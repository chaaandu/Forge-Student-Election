import type { NextFunction, Request, Response } from 'express';
import { RateLimitedError } from '../services/errors.js';

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimitOptions {
  /** Requests allowed per window. */
  readonly limit: number;
  readonly windowMs: number;
  /** Defaults to the client IP. Auth routes also key on the voter id. */
  readonly keyOf?: (req: Request) => string;
}

/**
 * Token-bucket rate limiting.
 *
 * In-process state, which is correct for the single-node deployment this system
 * is designed for (ADR-3) and is stated as a limitation in
 * docs/security-model.md §8: scaling the API out would need a shared store.
 *
 * This protects against accidents and casual abuse — a stuck retry loop, a
 * someone holding down a key — not against a determined attacker on the LAN.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  const refillPerMs = options.limit / options.windowMs;

  // Bounded memory: a long-running election must not accumulate a bucket per
  // spoofed IP forever.
  const sweep = setInterval(() => {
    const cutoff = Date.now() - options.windowMs * 10;
    for (const [key, bucket] of buckets) if (bucket.updatedAt < cutoff) buckets.delete(key);
  }, options.windowMs * 10);
  sweep.unref?.();

  return function rateLimit(req: Request, _res: Response, next: NextFunction): void {
    const key = options.keyOf ? options.keyOf(req) : (req.ip ?? 'unknown');
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: options.limit, updatedAt: now };

    bucket.tokens = Math.min(options.limit, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = now;

    if (bucket.tokens < 1) {
      buckets.set(key, bucket);
      const waitMs = (1 - bucket.tokens) / refillPerMs;
      next(new RateLimitedError(Math.max(1, Math.ceil(waitMs / 1000))));
      return;
    }

    bucket.tokens -= 1;
    buckets.set(key, bucket);
    next();
  };
}
