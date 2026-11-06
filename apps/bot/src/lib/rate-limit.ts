/**
 * In-memory token bucket (interim для 1 реплики Railway).
 * Прод: таблица rate_limit_buckets / Redis, общая для реплик.
 */
interface Bucket {
  tokens: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  allow(key: string, limit: number, windowMs: number): boolean {
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { tokens: limit - 1, resetAt: now + windowMs });
      return true;
    }
    if (bucket.tokens <= 0) return false;
    bucket.tokens -= 1;
    return true;
  }

  get retryAfterMs(): number {
    return 60_000;
  }
}
