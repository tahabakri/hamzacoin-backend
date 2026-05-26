// ============================================================================
// routes/quiz.ts — POST /api/generate-quiz
// ----------------------------------------------------------------------------
// Takes article text from the frontend, hashes it, asks Groq for a quiz,
// caches it server-side (so the answers never leave the server), and returns
// the questions without the correct-index field.
// ============================================================================

import { Router, type Request, type Response } from "express";
import { id as keccakId, isHexString } from "ethers";
import { generateQuestions } from "../lib/groq";
import { getQuiz, putQuiz } from "../lib/cache";
import { consume } from "../lib/rateLimit";
import type {
  GenerateQuizBody,
  GenerateQuizResponse,
  PublicQuestion,
} from "../types";

const MIN_ARTICLE_CHARS = 200;
const MAX_ARTICLE_CHARS = 15_000;
const PER_IP_LIMIT = 20;

export const quizRouter = Router();

quizRouter.post(
  "/generate-quiz",
  async (req: Request, res: Response): Promise<void> => {
    const ip = clientIp(req);

    const limit = consume("quiz", ip, PER_IP_LIMIT);
    if (!limit.ok) {
      res.setHeader("Retry-After", String(limit.retryAfterSec));
      res
        .status(429)
        .json({ error: "Too many quiz requests. Try again later.", retryAfterSec: limit.retryAfterSec });
      return;
    }

    const body = req.body as Partial<GenerateQuizBody> | undefined;
    const articleText = typeof body?.articleText === "string" ? body.articleText.trim() : "";
    const articleTitle = typeof body?.articleTitle === "string" ? body.articleTitle.trim() : "";

    if (articleTitle.length === 0 || articleTitle.length > 200) {
      res.status(400).json({ error: "articleTitle is required (1-200 chars)" });
      return;
    }
    if (articleText.length < MIN_ARTICLE_CHARS || articleText.length > MAX_ARTICLE_CHARS) {
      res
        .status(400)
        .json({
          error: `articleText must be between ${MIN_ARTICLE_CHARS} and ${MAX_ARTICLE_CHARS} characters (got ${articleText.length})`,
        });
      return;
    }

    // keccak256 of the article text — same algorithm the contract will see.
    const articleHash = keccakId(articleText);
    if (!isHexString(articleHash, 32)) {
      // Defensive; ethers.id should always produce a 32-byte hex string.
      res.status(500).json({ error: "Failed to hash article text" });
      return;
    }

    // Cached?
    const cached = getQuiz(articleHash);
    if (cached) {
      logRequest("/api/generate-quiz", { ip, articleHash, cache: "hit" });
      const response: GenerateQuizResponse = {
        articleHash,
        questions: cached.questions,
      };
      res.status(200).json(response);
      return;
    }

    try {
      const raw = await generateQuestions(articleTitle, articleText);

      const publicQuestions: PublicQuestion[] = raw.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
      }));
      const correctAnswers = raw.map((q) => q.correctIndex);
      const explanations = raw.map((q) => q.explanation);

      putQuiz(articleHash, {
        questions: publicQuestions,
        correctAnswers,
        explanations,
        createdAt: Date.now(),
      });

      logRequest("/api/generate-quiz", { ip, articleHash, cache: "miss" });
      const response: GenerateQuizResponse = { articleHash, questions: publicQuestions };
      res.status(200).json(response);
    } catch (err) {
      const msg = (err as Error)?.message ?? "Unknown error";
      console.error(`[quiz] groq failure: ${msg}`);
      res.status(502).json({ error: "Quiz generation failed. Please try again." });
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
