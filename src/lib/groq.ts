// ============================================================================
// groq.ts — Groq client + quiz-generation prompt + JSON validator
// ----------------------------------------------------------------------------
// Asks llama-3.3-70b-versatile for exactly 5 multiple-choice questions about
// an article. Forces JSON output via response_format and validates the
// structure before returning. Bad output throws so the route can return 502.
// ============================================================================

import Groq from "groq-sdk";
import { config } from "../config";
import type { RawQuestion } from "../types";

const groq = new Groq({ apiKey: config.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a quiz generator. Output ONLY valid JSON. No markdown, no commentary, no surrounding prose. Your JSON must conform exactly to the schema requested in the user message.`;

function buildUserPrompt(articleTitle: string, articleText: string): string {
  return `Generate exactly 5 multiple-choice questions that test understanding of the Wikipedia article titled "${articleTitle}". Use ONLY the article text below — do not pull in outside knowledge.

Guidelines:
- Each question must test comprehension or inference, NOT trivia ("what year was X" is bad; "why does X work" is good).
- Vary difficulty: 1 easy, 3 medium, 1 harder.
- Each question must have EXACTLY 4 plausible options. Wrong answers should sound reasonable to someone who skimmed but didn't understand.
- correctIndex is a 0-based index into the options array.
- explanation is one short sentence explaining why the correct option is right (used to teach the user when they get it wrong).

Output a single JSON object with this exact shape:

{
  "questions": [
    {
      "id": 1,
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "explanation": "..."
    },
    ... (5 items total, ids 1 through 5)
  ]
}

ARTICLE:
"""
${articleText}
"""`;
}

export async function generateQuestions(
  articleTitle: string,
  articleText: string,
): Promise<RawQuestion[]> {
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.4,
    max_tokens: 1800,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(articleTitle, articleText) },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("Groq returned empty content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Groq output was not valid JSON: ${(err as Error).message}`);
  }

  const questions = (parsed as { questions?: unknown })?.questions;
  if (!Array.isArray(questions) || questions.length !== 5) {
    throw new Error(
      `Expected 5 questions, got ${Array.isArray(questions) ? questions.length : typeof questions}`,
    );
  }

  const out: RawQuestion[] = questions.map((q, i) => {
    if (!q || typeof q !== "object") {
      throw new Error(`Question ${i + 1} is not an object`);
    }
    const obj = q as Record<string, unknown>;
    const question = obj.question;
    const options = obj.options;
    const correctIndex = obj.correctIndex;
    const explanation = obj.explanation;

    if (typeof question !== "string" || question.length === 0) {
      throw new Error(`Question ${i + 1} has invalid 'question' field`);
    }
    if (!Array.isArray(options) || options.length !== 4) {
      throw new Error(`Question ${i + 1} must have exactly 4 options`);
    }
    if (!options.every((o) => typeof o === "string" && o.length > 0)) {
      throw new Error(`Question ${i + 1} has non-string or empty option`);
    }
    if (
      typeof correctIndex !== "number" ||
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex > 3
    ) {
      throw new Error(`Question ${i + 1} has invalid correctIndex: ${String(correctIndex)}`);
    }
    if (typeof explanation !== "string") {
      throw new Error(`Question ${i + 1} has invalid 'explanation' field`);
    }

    return {
      id: i + 1,
      question,
      options: options as string[],
      correctIndex,
      explanation,
    };
  });

  return out;
}
