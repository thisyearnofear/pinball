import { FastifyInstance } from 'fastify';
import { fetchQuantumSeeds, MAX_SEED_COUNT } from '../lib/quantum-seed.js';

/**
 * Quantum-seeded runs.
 *
 * The client prefetches a small buffer of seeds here and consumes one per run.
 * The seed is recorded in the replay digest, so the run stays reproducible — the
 * QRNG only sources the (otherwise non-deterministic) seed. Proxied through the
 * backend so the provider key never reaches the browser.
 *
 * Never fails hard: an unconfigured or unreachable provider degrades to a
 * CSPRNG and reports it via `source`.
 */
export async function quantumSeedRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { count?: string } }>('/api/quantum/seed', async (req, reply) => {
    const raw = req.query?.count ?? '1';
    const count = Number.parseInt(raw, 10);
    if (!Number.isInteger(count) || count < 1 || count > MAX_SEED_COUNT) {
      return reply.code(400).send({ error: 'INVALID_COUNT', max: MAX_SEED_COUNT });
    }

    const batch = await fetchQuantumSeeds(count);
    // Provenance is public (it is recorded in the replay anyway); never cached,
    // so a QRNG outage recovery is visible immediately.
    reply.header('Cache-Control', 'no-store');
    return batch;
  });
}
