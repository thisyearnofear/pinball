import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './env.js';

// Admin endpoints require a bearer token. When ADMIN_TOKEN is unset, they don't exist (404).
export function adminAuth(req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) {
  if (!env.ADMIN_TOKEN) {
    reply.code(404).send({ error: 'NOT_FOUND' });
    return;
  }
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    reply.code(401).send({ error: 'UNAUTHORIZED' });
    return;
  }
  done();
}
