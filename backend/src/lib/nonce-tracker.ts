/**
 * Nonce tracker for score signature requests.
 * Backed by Redis when REDIS_URL is set; falls back to in-memory otherwise.
 * Prevents replay attacks by ensuring each signature is unique per player per tournament.
 */

import { getRedis } from "./redis-client.js";

interface InMemoryEntry {
  nonce: bigint;
  timestamp: number;
}

export class NonceTracker {
  private memStore: Map<number, Map<string, InMemoryEntry>> = new Map();

  async getNextNonce(tournamentId: number, playerAddress: string): Promise<bigint> {
    const redis = getRedis();
    if (redis) return this.getNextNonceRedis(redis, tournamentId, playerAddress);
    return this.getNextNonceMemory(tournamentId, playerAddress);
  }

  async recordNonce(tournamentId: number, playerAddress: string, nonce: bigint): Promise<void> {
    const redis = getRedis();
    if (redis) {
      const key = `nonce:${tournamentId}:${playerAddress.toLowerCase()}`;
      await redis.set(key, nonce.toString());
    } else {
      this.recordNonceMemory(tournamentId, playerAddress, nonce);
    }
  }

  async isValidNext(tournamentId: number, playerAddress: string, nonce: bigint): Promise<boolean> {
    const expected = await this.getNextNonce(tournamentId, playerAddress);
    return nonce === expected;
  }

  async getCurrentNonce(tournamentId: number, playerAddress: string): Promise<bigint | null> {
    const redis = getRedis();
    if (redis) {
      const key = `nonce:${tournamentId}:${playerAddress.toLowerCase()}`;
      const val = await redis.get(key);
      return val ? BigInt(val) : null;
    }
    return this.getCurrentNonceMemory(tournamentId, playerAddress);
  }

  async resetTournament(tournamentId: number): Promise<void> {
    const redis = getRedis();
    if (redis) {
      const keys = await redis.keys(`nonce:${tournamentId}:*`);
      if (keys.length) await redis.del(...keys);
    } else {
      this.memStore.delete(tournamentId);
    }
  }

  async resetPlayer(tournamentId: number, playerAddress: string): Promise<void> {
    const redis = getRedis();
    if (redis) {
      await redis.del(`nonce:${tournamentId}:${playerAddress.toLowerCase()}`);
    } else {
      this.memStore.get(tournamentId)?.delete(playerAddress.toLowerCase());
    }
  }

  getStats(): { totalTournaments: number; totalPlayers: number; storage: string } {
    let totalPlayers = 0;
    for (const m of this.memStore.values()) totalPlayers += m.size;
    return {
      totalTournaments: this.memStore.size,
      totalPlayers,
      storage: getRedis() ? "redis" : "in-memory",
    };
  }

  // --- Redis path ---

  private async getNextNonceRedis(redis: NonNullable<ReturnType<typeof getRedis>>, tid: number, addr: string): Promise<bigint> {
    const key = `nonce:${tid}:${addr.toLowerCase()}`;
    const val = await redis.get(key);
    return val ? BigInt(val) + 1n : 1n;
  }

  // --- In-memory path ---

  private getNextNonceMemory(tid: number, addr: string): bigint {
    const tMap = this.memStore.get(tid);
    if (!tMap) return 1n;
    const entry = tMap.get(addr.toLowerCase());
    return entry ? entry.nonce + 1n : 1n;
  }

  private recordNonceMemory(tid: number, addr: string, nonce: bigint): void {
    const normalized = addr.toLowerCase();
    let tMap = this.memStore.get(tid);
    if (!tMap) {
      tMap = new Map();
      this.memStore.set(tid, tMap);
    }
    tMap.set(normalized, { nonce, timestamp: Date.now() });
  }

  private getCurrentNonceMemory(tid: number, addr: string): bigint | null {
    const tMap = this.memStore.get(tid);
    if (!tMap) return null;
    return tMap.get(addr.toLowerCase())?.nonce ?? null;
  }
}

export const nonceTracker = new NonceTracker();
