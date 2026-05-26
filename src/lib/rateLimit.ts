// ============================================================================
// rateLimit.ts — naive in-memory rate limiter
// ----------------------------------------------------------------------------
// Two independent buckets:
//   - per IP for /api/generate-quiz       (default 20 / hour)
//   - per address for /api/verify-and-sign (default 50 / hour)
//
// Each bucket is a sliding window of timestamps trimmed on every check.
// Memory is bounded by the number of unique keys in the window, which is
// fine for a single-instance dev / demo backend.
// ============================================================================

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

type Bucket = Map<string, number[]>;

const buckets: Record<string, Bucket> = {};

function getBucket(name: string): Bucket {
  let b = buckets[name];
  if (!b) {
    b = new Map();
    buckets[name] = b;
  }
  return b;
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

export function consume(name: string, key: string, max: number): RateLimitResult {
  const bucket = getBucket(name);
  const now = Date.now();
  const trimmed = (bucket.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (trimmed.length >= max) {
    // The oldest hit in the window decides when it falls out — that's the
    // earliest moment the user can try again.
    const earliest = trimmed[0]!;
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - earliest)) / 1000));
    bucket.set(key, trimmed);
    return { ok: false, retryAfterSec };
  }

  trimmed.push(now);
  bucket.set(key, trimmed);
  return { ok: true, remaining: max - trimmed.length };
}
