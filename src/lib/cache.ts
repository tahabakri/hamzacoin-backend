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

import type { CachedHolders, CachedQuiz } from "../types";

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

// ----------------------------------------------------------------------------
// Holders cache — same lazy-TTL Map pattern, shorter window (5 min). One entry,
// keyed by the token contract address. Avoids hammering Etherscan: at most one
// full-history rebuild per 5 minutes regardless of request volume.
// ----------------------------------------------------------------------------
const HOLDERS_TTL_MS = 5 * 60 * 1000; // 5 minutes

const holdersStore = new Map<string, CachedHolders>();

export function getHolders(key: string): CachedHolders | null {
  const entry = holdersStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > HOLDERS_TTL_MS) {
    holdersStore.delete(key);
    return null;
  }
  return entry;
}

export function putHolders(key: string, entry: CachedHolders): void {
  holdersStore.set(key, entry);
}

// Useful for /health diagnostics — never expose this on a public endpoint.
export function cacheSize(): number {
  return store.size;
}
