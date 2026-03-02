export class UserRateLimiter {
  private readonly lastActionAt = new Map<number, number>();

  constructor(private readonly minIntervalMs: number) {}

  public check(userId: number): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const last = this.lastActionAt.get(userId) ?? 0;
    const diff = now - last;

    if (diff < this.minIntervalMs) {
      return { allowed: false, retryAfterMs: this.minIntervalMs - diff };
    }

    this.lastActionAt.set(userId, now);
    return { allowed: true, retryAfterMs: 0 };
  }
}
