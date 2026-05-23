/**
 * Lazy Redis client — only connects when REDIS_URL is set.
 * Falls back to null (in-memory stores) otherwise.
 *
 * Reads REDIS_URL directly from process.env to avoid importing
 * the full env schema (which validates CHAIN_ID and other vars
 * that may not be set in test environments).
 */
import Redis from "ioredis";

let client: Redis | null = null;
let initialized = false;

export function getRedis(): Redis | null {
  if (initialized) return client;
  initialized = true;

  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;

  client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 200, 3000);
    },
  });
  client.connect().catch((err) => {
    console.error("Redis connection failed, falling back to in-memory:", err.message);
    client?.disconnect();
    client = null;
  });
  return client;
}

export function isRedisAvailable(): boolean {
  return getRedis() !== null;
}
