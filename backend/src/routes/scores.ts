import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../lib/env.js';
import { signScore } from '../lib/sign.js';

const SignBody = z.object({
  tournamentId: z.number().int().positive(),
  address: z.string().startsWith('0x').length(42),
  score: z.number().int().nonnegative(),
  name: z.string().default(''),
  metadata: z.string().default(''),
});

export async function scoresRoutes(app: FastifyInstance) {
  app.post('/api/scores/sign', async (req, reply) => {
    const parsed = SignBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', details: parsed.error.flatten() });
    }

    const { tournamentId, address, score, name, metadata } = parsed.data;

    // TODO: Add real anti-cheat validation here using metadata/runData/timing, etc.

    try {
      const signature = await signScore(env.SCORE_SIGNER_PK, tournamentId, address, score, name, metadata);
      return { signature };
    } catch (e: any) {
      app.log.error(e);
      return reply.code(500).send({ error: 'SIGN_FAIL' });
    }
  });
}
