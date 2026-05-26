// ============================================================================
// cache.ts — tiny in-memory TTL cache for graded quizzes
// ----------------------------------------------------------------------------
// Keyed by articleHash. Values include the questions, the correct answers
// (which never leave the server), and the createdAt timestamp.
//
// Eviction is lazy: we check the timestamp on read and drop the entry if
// it's too old. No background timer, no Redis.
//
// NOTE: this is single-process memory only. Restart the server and the cache
// resets. For multi-instance / serverless prod, replace with Redis or
// Vercel KV — the keys/values are tiny.
// ============================================================================

import type { CachedQuiz } from "../types";

const TTL_MS = 60 * 60 * 1000; // 1 hour

const store = new Map<string, CachedQuiz>();

export function getQuiz(articleHash: string): CachedQuiz | null {
  const entry = store.get(articleHash);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(articleHash);
    return null;
  }
  return entry;
}

export function putQuiz(articleHash: string, entry: CachedQuiz): void {
  store.set(articleHash, entry);
}

// Useful for /health diagnostics — never expose this on a public endpoint.
export function cacheSize(): number {
  return store.size;
}
