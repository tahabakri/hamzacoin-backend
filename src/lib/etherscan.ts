// ============================================================================
// etherscan.ts — reconstruct all-time HMZ holders from the Transfer event log
// ----------------------------------------------------------------------------
// Etherscan's free API has NO token-holders endpoint (that's a paid Pro
// feature), so we pull EVERY Transfer event for the token via the free getLogs
// endpoint and replay them into running per-address balances. Addresses with a
// positive balance are the holders.
//
// Uses the Etherscan V2 multichain API (one key works across chains, selected
// by chainid). Network/format/rate-limit failures throw so the route returns
// 502; "No records found" is treated as a legitimately empty result.
// ============================================================================

import { getAddress } from "ethers";
import { config } from "../config";
import type { HolderEntry, HoldersResult } from "../types";

const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";

// keccak256("Transfer(address,address,uint256)") — topic0 for ERC20 Transfer.
const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Etherscan free tier currently returns up to 10k logs/request (dropping to 1k
// on 2026-07-01). We page at 1000 either way and stop on a short page. MAX_PAGES
// bounds a runaway scan (20k logs) — far above this token's volume.
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;
const FROM_BLOCK = 0;
const TO_BLOCK = 99_999_999;
const PER_PAGE_DELAY_MS = 250; // stay well under the 5 req/s free-tier limit
const FETCH_TIMEOUT_MS = 15_000;

type EtherscanLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string; // hex string, e.g. "0x10d4f"
  transactionHash: string;
  logIndex: string;
};

type EtherscanLogsResponse = {
  status: string; // "1" = OK, "0" = error or empty
  message: string; // "OK" | "No records found" | "NOTOK" | ...
  result: EtherscanLog[] | string; // logs array, or an error string
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function buildUrl(page: number): string {
  const url = new URL(ETHERSCAN_V2_BASE);
  url.searchParams.set("chainid", String(config.CHAIN_ID));
  url.searchParams.set("module", "logs");
  url.searchParams.set("action", "getLogs");
  url.searchParams.set("address", config.HMZ_CONTRACT_ADDRESS);
  url.searchParams.set("fromBlock", String(FROM_BLOCK));
  url.searchParams.set("toBlock", String(TO_BLOCK));
  url.searchParams.set("topic0", TRANSFER_TOPIC0);
  url.searchParams.set("page", String(page));
  url.searchParams.set("offset", String(PAGE_SIZE));
  url.searchParams.set("apikey", config.ETHERSCAN_API_KEY);
  return url.toString();
}

async function fetchLogPage(page: number): Promise<EtherscanLog[]> {
  const res = await fetch(buildUrl(page), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Etherscan HTTP ${res.status}`);
  }

  const body = (await res.json()) as EtherscanLogsResponse;

  if (body.status === "1" && Array.isArray(body.result)) {
    return body.result;
  }

  // status "0": could be a legitimately empty result OR a real error.
  const detail = typeof body.result === "string" ? body.result : "";
  if (/no records found/i.test(body.message) || /no records found/i.test(detail)) {
    return [];
  }
  throw new Error(
    `Etherscan getLogs failed: ${body.message}${detail ? ` (${detail})` : ""}`,
  );
}

/** Fetch every Transfer log for the HMZ token, paging until a short page. */
export async function fetchAllTransferLogs(): Promise<EtherscanLog[]> {
  const all: EtherscanLog[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await fetchLogPage(page);
    all.push(...batch);
    if (batch.length < PAGE_SIZE) {
      return all; // last page reached
    }
    await sleep(PER_PAGE_DELAY_MS);
  }
  // Hit the safety cap — surface it rather than silently undercounting.
  console.warn(
    `[etherscan] reached MAX_PAGES=${MAX_PAGES} (${all.length} logs); holder count may be truncated`,
  );
  return all;
}

/** Last 20 bytes of a 32-byte topic, checksummed. */
function topicToAddress(topic: string): string {
  return getAddress(`0x${topic.slice(-40)}`);
}

function hexToBigInt(hex: string): bigint {
  return hex && hex !== "0x" ? BigInt(hex) : 0n;
}

/**
 * Replay Transfer logs into running balances and return holders (balance > 0).
 * Mirrors the frontend computeHolders() in src/utils/transfers.ts: mints/burns
 * (the zero address) never count as a holder; everything else nets out.
 */
export function computeHolders(logs: EtherscanLog[]): HoldersResult {
  const balances = new Map<string, bigint>();
  let asOfBlock = 0;

  for (const log of logs) {
    if (!log.topics || log.topics.length < 3) continue; // not a standard Transfer
    const from = topicToAddress(log.topics[1]!);
    const to = topicToAddress(log.topics[2]!);
    const value = hexToBigInt(log.data);

    const blockNum = Number.parseInt(log.blockNumber, 16);
    if (Number.isFinite(blockNum) && blockNum > asOfBlock) asOfBlock = blockNum;

    if (from !== ZERO_ADDRESS) {
      balances.set(from, (balances.get(from) ?? 0n) - value);
    }
    if (to !== ZERO_ADDRESS) {
      balances.set(to, (balances.get(to) ?? 0n) + value);
    }
  }

  const holders: HolderEntry[] = [...balances.entries()]
    .filter(([, bal]) => bal > 0n)
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .map(([address, bal]) => ({ address, balance: bal.toString() }));

  return { holderCount: holders.length, holders, asOfBlock };
}

/** Full pipeline: fetch all Transfer logs, then reconstruct holders. */
export async function reconstructHolders(): Promise<HoldersResult> {
  const logs = await fetchAllTransferLogs();
  return computeHolders(logs);
}
