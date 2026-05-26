// ============================================================================
// routes/verify.ts — POST /api/verify-and-sign
// ----------------------------------------------------------------------------
// User submits 5 answers. We look up the cached correct answers for that
// articleHash, compute the score, and (if > 0) sign an EIP-712 message the
// HamzaFaucet contract will accept.
// ============================================================================

import { Router, type Request, type Response } from "express";
import { getAddress, isAddress, isHexString } from "ethers";
import { getQuiz } from "../lib/cache";
import { consume } from "../lib/rateLimit";
import { signClaim } from "../lib/signer";
import type { VerifyAndSignBody, VerifyAndSignResponse } from "../types";

const PER_ADDRESS_LIMIT = 50;

export const verifyRouter = Router();

verifyRouter.post(
  "/verify-and-sign",
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Partial<VerifyAndSignBody> | undefined;
    const articleHash = typeof body?.articleHash === "string" ? body.articleHash : "";
    const rawAddress = typeof body?.userAddress === "string" ? body.userAddress : "";
    const answers = Array.isArray(body?.answers) ? body!.answers : null;

    if (!isHexString(articleHash, 32)) {
      res.status(400).json({ error: "articleHash must be a 0x-prefixed 32-byte hex string" });
      return;
    }
    if (!isAddress(rawAddress)) {
      res.status(400).json({ error: "userAddress must be a valid Ethereum address" });
      return;
    }
    // Normalize to checksum address — the EIP-712 signature is over this exact form.
    const userAddress = getAddress(rawAddress);

    if (!answers || answers.length !== 5) {
      res.status(400).json({ error: "answers must be an array of exactly 5 integers" });
      return;
    }
    for (let i = 0; i < 5; i++) {
      const a = answers[i];
      if (typeof a !== "number" || !Number.isInteger(a) || a < 0 || a > 3) {
        res.status(400).json({ error: `answers[${i}] must be an integer 0-3 (got ${String(a)})` });
        return;
      }
    }

    const limit = consume("verify", userAddress.toLowerCase(), PER_ADDRESS_LIMIT);
    if (!limit.ok) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      res
        .status(429)
        .json({
          error: "Too many verification requests. Try again later.",
          retryAfterSec: limit.retryAfterSec,
        });
      return;
    }

    const cached = getQuiz(articleHash);
    if (!cached) {
      res.status(410).json({ error: "Quiz expired or not found. Please re-fetch the quiz." });
      return;
    }

    // Compute score and per-answer correctness.
    const perAnswer: boolean[] = answers.map(
      (a, i) => a === cached.correctAnswers[i],
    );
    const score = perAnswer.filter(Boolean).length;

    // Reveal explanations only AFTER grading (so we can show them on missed Qs).
    const explanations = cached.explanations;

    logRequest("/api/verify-and-sign", {
      addr: truncateAddr(userAddress),
      articleHash: articleHash.slice(0, 10) + "…",
      score: String(score),
    });

    if (score === 0) {
      const response: VerifyAndSignResponse = {
        score: 0,
        signature: null,
        articleHash,
        perAnswer,
        explanations,
        message: "Try again with another article.",
      };
      res.status(200).json(response);
      return;
    }

    try {
      const signature = await signClaim(userAddress, score, articleHash);
      const response: VerifyAndSignResponse = {
        score,
        signature,
        articleHash,
        perAnswer,
        explanations,
      };
      res.status(200).json(response);
    } catch (err) {
      console.error(`[verify] sign failure: ${(err as Error)?.message}`);
      res.status(500).json({ error: "Could not sign reward. Please try again." });
    }
  },
);

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function logRequest(endpoint: string, meta: Record<string, string>): void {
  const parts = Object.entries(meta).map(([k, v]) => `${k}=${v}`);
  console.log(`[${new Date().toISOString()}] ${endpoint} ${parts.join(" ")}`);
}
