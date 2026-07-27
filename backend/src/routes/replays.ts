import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { keccak256, toUtf8Bytes } from 'ethers';
import { getRedis } from '../lib/redis-client.js';

/**
 * Replay storage.
 *
 * Clients upload the full deterministic run recording here; the replay's
 * keccak hash travels inside the signed score metadata, so the stored
 * payload is verifiably bound to the on-chain submission. Stored in Redis
 * when available (30-day TTL), otherwise a bounded in-memory map.
 */

const MAX_REPLAY_LENGTH = 150_000; // events (~50KB) + ghost position trace (~70KB) + headroom
const REPLAY_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_MEM_REPLAYS = 1_000;

const ReplayBody = z.object({
  tournamentId: z.number().int().positive(),
  address: z.string().startsWith('0x').length(42),
  replay: z.string().min(2).max(MAX_REPLAY_LENGTH),
});

const memStore = new Map<string, string>();

/** Look up a stored replay by its signed-metadata hash. */
export async function getStoredReplay(
  tournamentId: number,
  address: string,
  hash: string
): Promise<string | null> {
  const key = `replay:${tournamentId}:${address.toLowerCase()}:${hash}`;
  const redis = getRedis();
  if (redis) {
    return (await redis.get(key)) ?? null;
  }
  return memStore.get(key) ?? null;
}

// --- Best replay per tournament (ghost racing) ---

const BEST_TTL_SECONDS = 60 * 60 * 24 * 90;

export type BestReplay = { score: number; address: string; mode: string; replay: string };

const bestMemStore = new Map<number, BestReplay>();

/**
 * Keep the tournament leader's replay for ghost racing. Direction-aware:
 * kamikaze scores are drain times, so lower is better.
 */
export async function maybeStoreBestReplay(
  tournamentId: number,
  address: string,
  score: number,
  mode: 'classic' | 'kamikaze',
  replay: string
): Promise<boolean> {
  const improves = (next: number, cur: number) => (mode === 'kamikaze' ? next < cur : next > cur);
  const entry: BestReplay = { score, address, mode, replay };
  const redis = getRedis();
  if (redis) {
    const key = `replay:best:${tournamentId}`;
    const existing = await redis.get(key);
    if (existing) {
      try {
        const cur = JSON.parse(existing) as BestReplay;
        if (!improves(score, cur.score)) return false;
      } catch {
        // corrupt entry: overwrite
      }
    }
    await redis.set(key, JSON.stringify(entry), 'EX', BEST_TTL_SECONDS);
    return true;
  }
  const cur = bestMemStore.get(tournamentId);
  if (cur && !improves(score, cur.score)) return false;
  bestMemStore.set(tournamentId, entry);
  return true;
}

export async function getBestReplay(tournamentId: number): Promise<BestReplay | null> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(`replay:best:${tournamentId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as BestReplay;
    } catch {
      return null;
    }
  }
  return bestMemStore.get(tournamentId) ?? null;
}

export async function replaysRoutes(app: FastifyInstance) {
  app.post('/api/replays', async (req, reply) => {
    const parsed = ReplayBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', details: parsed.error.flatten() });
    }

    const { tournamentId, address, replay } = parsed.data;

    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return reply.code(400).send({ error: 'INVALID_ADDRESS' });
    }

    // Cheap sanity check: replay must be a JSON object with the recorder shape
    try {
      const data = JSON.parse(replay);
      if (typeof data !== 'object' || data === null || Array.isArray(data) || data.v !== 1 || !Array.isArray(data.events)) {
        return reply.code(400).send({ error: 'INVALID_REPLAY' });
      }
    } catch {
      return reply.code(400).send({ error: 'INVALID_REPLAY' });
    }

    const hash = keccak256(toUtf8Bytes(replay));
    const key = `replay:${tournamentId}:${address.toLowerCase()}:${hash}`;

    const redis = getRedis();
    if (redis) {
      await redis.set(key, replay, 'EX', REPLAY_TTL_SECONDS);
    } else {
      if (!memStore.has(key) && memStore.size >= MAX_MEM_REPLAYS) {
        const oldest = memStore.keys().next().value;
        if (oldest) memStore.delete(oldest);
      }
      memStore.set(key, replay);
    }

    app.log.info({ event: 'REPLAY_STORED', tournamentId, address, hash, bytes: replay.length });
    return { ok: true, hash };
  });

  // Leader's replay for ghost racing (public, no auth: replays are not secret)
  app.get<{ Params: { tournamentId: string } }>('/api/replays/best/:tournamentId', async (req, reply) => {
    const tid = parseInt(req.params.tournamentId, 10);
    if (isNaN(tid) || tid <= 0) {
      return reply.code(400).send({ error: 'INVALID_TOURNAMENT_ID' });
    }
    const best = await getBestReplay(tid);
    if (!best) {
      return reply.code(404).send({ error: 'NO_BEST_REPLAY' });
    }
    return best;
  });
}
