import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './lib/env.js';
import { scoresRoutes } from './routes/scores.js';
import { replaysRoutes } from './routes/replays.js';
import { nimEntryRoutes } from './routes/nim-entry.js';
import { scoreSignatureRateLimiter } from './lib/rate-limiter.js';
import { nonceTracker } from './lib/nonce-tracker.js';
import { isRedisAvailable } from './lib/redis-client.js';
import { adminAuth } from './lib/admin-auth.js';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = env.ALLOWED_ORIGINS === '*' ? true : env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
    if (allowed === true || (Array.isArray(allowed) && allowed.includes(origin))) {
      cb(null, true);
    } else {
      cb(new Error('CORS'), false);
    }
  },
});

await app.register(rateLimit, {
  max: env.RATE_LIMIT,
  timeWindow: '1 minute',
});

await app.register(scoresRoutes);
await app.register(replaysRoutes);
await app.register(nimEntryRoutes);

app.get('/health', async () => ({ ok: true }));

app.get('/admin/metrics', { preHandler: adminAuth }, async () => {
  const rateLimitStats = scoreSignatureRateLimiter.getStats();
  const nonceStats = nonceTracker.getStats();
  return {
    uptime: process.uptime(),
    storage: {
      rateLimiter: rateLimitStats.storage ?? (isRedisAvailable() ? 'redis' : 'in-memory'),
      nonceTracker: nonceStats.storage ?? (isRedisAvailable() ? 'redis' : 'in-memory'),
    },
    rateLimiter: {
      trackedAddresses: rateLimitStats.totalTrackedAddresses,
      memoryUsageBytes: rateLimitStats.memoryUsageBytes,
    },
    nonceTracker: {
      trackedTournaments: nonceStats.totalTournaments,
      trackedPlayers: nonceStats.totalPlayers,
    },
    memory: {
      rssBytes: process.memoryUsage().rss,
      heapUsedBytes: process.memoryUsage().heapUsed,
    },
  };
});

app.listen({ host: '0.0.0.0', port: env.PORT }).then(() => {
  app.log.info(`Server listening on :${env.PORT}`);
});
