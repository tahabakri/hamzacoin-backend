// ============================================================================
// config.ts — read + validate env on boot
// ----------------------------------------------------------------------------
// If any required env var is missing, we crash here BEFORE the server starts
// listening, which is much friendlier than failing on the first request.
// ============================================================================

import dotenv from "dotenv";
import { Wallet, isAddress } from "ethers";

dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(
      `Missing required env var: ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : fallback;
}

const GROQ_API_KEY = required("GROQ_API_KEY");

// Etherscan API key for GET /api/holders. OPTIONAL on purpose: if it's missing
// the server still boots (quiz + verify keep working) and /api/holders returns
// 503, so the frontend falls back to its recent-window holder count. Making
// this required() would crash the whole backend until the key is set.
const ETHERSCAN_API_KEY = optional("ETHERSCAN_API_KEY", "");

// Normalize the private key (allow with or without 0x prefix).
const rawPk = required("SIGNER_PRIVATE_KEY");
const SIGNER_PRIVATE_KEY = rawPk.startsWith("0x") ? rawPk : `0x${rawPk}`;

const FAUCET_CONTRACT_ADDRESS = required("FAUCET_CONTRACT_ADDRESS");
if (!isAddress(FAUCET_CONTRACT_ADDRESS)) {
  throw new Error(
    `FAUCET_CONTRACT_ADDRESS is not a valid Ethereum address: ${FAUCET_CONTRACT_ADDRESS}`,
  );
}

const HMZ_CONTRACT_ADDRESS = optional(
  "HMZ_CONTRACT_ADDRESS",
  "0x619F30ec004442cdc3BE060FC927A3688054e6c3",
);
if (!isAddress(HMZ_CONTRACT_ADDRESS)) {
  throw new Error(
    `HMZ_CONTRACT_ADDRESS is not a valid Ethereum address: ${HMZ_CONTRACT_ADDRESS}`,
  );
}

const CHAIN_ID = Number(optional("CHAIN_ID", "11155111"));
if (!Number.isInteger(CHAIN_ID) || CHAIN_ID <= 0) {
  throw new Error(`CHAIN_ID must be a positive integer, got: ${process.env.CHAIN_ID}`);
}

const PORT = Number(optional("PORT", "3001"));
if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`PORT must be 1-65535, got: ${process.env.PORT}`);
}

// Derive the signer's public address from the private key so we can log it on
// boot and include it in /health. If the private key is malformed, ethers
// throws here and the process exits.
let signerAddress: string;
try {
  signerAddress = new Wallet(SIGNER_PRIVATE_KEY).address;
} catch (err) {
  throw new Error(
    `SIGNER_PRIVATE_KEY could not be parsed as an Ethereum private key: ${(err as Error).message}`,
  );
}

export const config = {
  GROQ_API_KEY,
  ETHERSCAN_API_KEY,
  SIGNER_PRIVATE_KEY,
  SIGNER_ADDRESS: signerAddress,
  FAUCET_CONTRACT_ADDRESS,
  HMZ_CONTRACT_ADDRESS,
  CHAIN_ID,
  PORT,
} as const;
