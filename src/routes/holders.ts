// ============================================================================
// routes/holders.ts — GET /api/holders
// ----------------------------------------------------------------------------
// Returns the all-time HMZ holder count, reconstructed from the full Transfer
// log via Etherscan (see lib/etherscan.ts). Result is cached 5 minutes. If the
// ETHERSCAN_API_KEY isn't configured we return 503 so the frontend can fall
// back to its recent-block-window count instead of showing an error.
// ============================================================================

import { Router, type Request, type Response } from "express";
import { config } from "../config";
import { reconstructHolders } from "../lib/etherscan";
import { getHolders, putHolders } from "../lib/cache";
import { consume } from "../lib/rateLimit";
import type { GetHoldersResponse, HoldersResult } from "../types";

// Generous — the 5-minute cache already shields Etherscan; this just bounds
// abusive direct hits that miss the cache.
const PER_IP_LIMIT = 60;
const CACHE_KEY = config.HMZ_CONTRACT_ADDRESS.toLowerCase();

export const holdersRouter = Router();

// Single-flight: coalesce concurrent cache-miss rebuilds behind one promise so a
// burst of requests triggers exactly ONE Etherscan scan.
let inflight: Promise<HoldersResult> | null = null;

holdersRouter.get(
  "/holders",
  async (req: Request, res: Response): Promise<void> => {
    const ip = clientIp(req);

    if (!config.ETHERSCAN_API_KEY) {
      res.status(503).json({ error: "Holder index not configured" });
      return;
    }

    const limit = consume("holders", ip, PER_IP_LIMIT);
    if (!limit.ok) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      res.status(429).json({
        error: "Too many holder requests. Try again later.",
        retryAfterSec: limit.retryAfterSec,
      });
      return;
    }

    const cached = getHolders(CACHE_KEY);
    if (cached) {
      logRequest("/api/holders", {
        ip,
        cache: "hit",
        holders: String(cached.holderCount),
      });
      const response: GetHoldersResponse = {
        holderCount: cached.holderCount,
        holders: cached.holders,
        asOfBlock: cached.asOfBlock,
        source: "etherscan",
      };
      res.status(200).json(response);
      return;
    }

    try {
      if (!inflight) {
        inflight = reconstructHolders().finally(() => {
          inflight = null;
        });
      }
      const result = await inflight;
      putHolders(CACHE_KEY, { ...result, createdAt: Date.now() });

      logRequest("/api/holders", {
        ip,
        cache: "miss",
        holders: String(result.holderCount),
        asOfBlock: String(result.asOfBlock),
      });
      const response: GetHoldersResponse = { ...result, source: "etherscan" };
      res.status(200).json(response);
    } catch (err) {
      const msg = (err as Error)?.message ?? "Unknown error";
      console.error(`[holders] etherscan failure: ${msg}`);
      res
        .status(502)
        .json({ error: "Could not load holders from Etherscan. Please try again." });
    }
  },
);

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function logRequest(endpoint: string, meta: Record<string, string>): void {
  const parts = Object.entries(meta).map(([k, v]) => `${k}=${v}`);
  console.log(`[${new Date().toISOString()}] ${endpoint} ${parts.join(" ")}`);
}
