export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

/** Small in-memory limiter for the single-process local bridge. */
export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, WindowState>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");
    if (!Number.isFinite(windowMs) || windowMs < 1) throw new Error("windowMs must be positive");
  }

  check(key: string, now = Date.now()): RateLimitResult {
    const normalizedKey = key || "unknown";
    const existing = this.hits.get(normalizedKey);
    const state = !existing || now >= existing.resetAt
      ? { count: 0, resetAt: now + this.windowMs }
      : existing;

    state.count += 1;
    this.hits.set(normalizedKey, state);
    this.prune(now);

    return {
      allowed: state.count <= this.limit,
      remaining: Math.max(0, this.limit - state.count),
      retryAfterMs: Math.max(0, state.resetAt - now),
    };
  }

  private prune(now: number): void {
    if (this.hits.size < 256) return;
    for (const [key, state] of this.hits) {
      if (now >= state.resetAt) this.hits.delete(key);
    }
  }
}
