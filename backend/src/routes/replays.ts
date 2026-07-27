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

const MAX_REPLAY_LENGTH = 100_000; // ~2x the recorder's 50KB cap
const REPLAY_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_MEM_REPLAYS = 1_000;

const ReplayBody = z.object({
  tournamentId: z.number().int().positive(),
  address: z.string().startsWith('0x').length(42),
  replay: z.string().min(2).max(MAX_REPLAY_LENGTH),
});

const memStore = new Map<string, string>();

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
}
