/**
 * Per-address rate limiting for score signature requests.
 * Backed by Redis when REDIS_URL is set; falls back to in-memory otherwise.
 * Prevents spam/abuse from individual players.
 */

import { getRedis } from "./redis-client.js";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface InMemoryEntry {
  count: number;
  resetTime: number;
}

export class AddressRateLimiter {
  private memStore: Map<string, InMemoryEntry> = new Map();
  private maxRequests: number;
  private windowMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxRequests: number = 3, windowMs: number = 5 * 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // In-memory cleanup (harmless when Redis is active since memStore stays empty)
    this.cleanupTimer = setInterval(() => this.cleanupInMemory(), 60 * 1000);
  }

  async isAllowed(address: string): Promise<RateLimitResult> {
    const redis = getRedis();
    if (redis) return this.isAllowedRedis(redis, address);
    return this.isAllowedMemory(address);
  }

  async reset(address: string): Promise<void> {
    const redis = getRedis();
    if (redis) {
      await redis.del(`rl:${address}`);
    } else {
      this.memStore.delete(address);
    }
  }

  async getStatus(address: string): Promise<{ count: number; remaining: number; resetAt: number } | null> {
    const redis = getRedis();
    if (redis) {
      const raw = await redis.get(`rl:${address}`);
      if (!raw) return null;
      const entry = JSON.parse(raw) as InMemoryEntry;
      const now = Date.now();
      if (now >= entry.resetTime) return null;
      return {
        count: entry.count,
        remaining: Math.max(0, this.maxRequests - entry.count),
        resetAt: entry.resetTime,
      };
    }
    return this.getStatusMemory(address);
  }

  getStats(): { totalTrackedAddresses: number; storage: string; memoryUsageBytes: number } {
    const redis = getRedis();
    return {
      totalTrackedAddresses: this.memStore.size,
      storage: redis ? "redis" : "in-memory",
      memoryUsageBytes: this.memStore.size * 100,
    };
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // --- Redis path ---

  private async isAllowedRedis(redis: NonNullable<ReturnType<typeof getRedis>>, address: string): Promise<RateLimitResult> {
    const key = `rl:${address}`;
    const raw = await redis.get(key);
    const now = Date.now();

    if (!raw) {
      const entry: InMemoryEntry = { count: 1, resetTime: now + this.windowMs };
      await redis.set(key, JSON.stringify(entry), "PX", this.windowMs);
      return { allowed: true, remaining: this.maxRequests - 1, resetAt: entry.resetTime };
    }

    const entry: InMemoryEntry = JSON.parse(raw);
    if (entry.count >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetTime };
    }

    entry.count += 1;
    const ttl = await redis.pttl(key);
    await redis.set(key, JSON.stringify(entry), "PX", Math.max(ttl, 1000));
    return { allowed: true, remaining: this.maxRequests - entry.count, resetAt: entry.resetTime };
  }

  // --- In-memory path ---

  private isAllowedMemory(address: string): RateLimitResult {
    const now = Date.now();
    const entry = this.memStore.get(address);

    if (!entry || now >= entry.resetTime) {
      this.memStore.set(address, { count: 1, resetTime: now + this.windowMs });
      return { allowed: true, remaining: this.maxRequests - 1, resetAt: now + this.windowMs };
    }

    if (entry.count >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetTime };
    }

    entry.count += 1;
    return { allowed: true, remaining: Math.max(0, this.maxRequests - entry.count), resetAt: entry.resetTime };
  }

  private getStatusMemory(address: string): { count: number; remaining: number; resetAt: number } | null {
    const entry = this.memStore.get(address);
    if (!entry) return null;
    if (Date.now() >= entry.resetTime) return null;
    return {
      count: entry.count,
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetAt: entry.resetTime,
    };
  }

  private cleanupInMemory(): void {
    const now = Date.now();
    for (const [address, entry] of this.memStore.entries()) {
      if (now >= entry.resetTime) this.memStore.delete(address);
    }
  }
}

export const scoreSignatureRateLimiter = new AddressRateLimiter(3, 5 * 60 * 1000);
