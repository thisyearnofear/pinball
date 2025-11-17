import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './lib/env.js';
import { scoresRoutes } from './routes/scores.js';
const app = Fastify({ logger: true });
await app.register(cors, {
    origin: (origin, cb) => {
        if (!origin)
            return cb(null, true);
        const allowed = env.ALLOWED_ORIGINS === '*' ? true : env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
        if (allowed === true || (Array.isArray(allowed) && allowed.includes(origin))) {
            cb(null, true);
        }
        else {
            cb(new Error('CORS'), false);
        }
    },
});
await app.register(rateLimit, {
    max: env.RATE_LIMIT,
    timeWindow: '1 minute',
});
await app.register(scoresRoutes);
app.get('/health', async () => ({ ok: true }));
app.listen({ host: '0.0.0.0', port: env.PORT }).then(() => {
    app.log.info(`Server listening on :${env.PORT}`);
});
