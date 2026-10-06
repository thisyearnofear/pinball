import { FastifyInstance } from 'fastify';
import { commitmentOf, isUtcDate, loadDailySeedBank, revealDay, utcDateKey } from '../lib/daily-seed-bank.js';

/**
 * Daily Kami seed: one QPU-banked seed per UTC day, revealed on that day with
 * its salt and Merkle proof against the published root (the client checks the
 * proof against the root it ships with). Future days are never revealed.
 */
export async function dailySeedRoutes(app: FastifyInstance) {
  app.get('/api/daily/commitment', async (_req, reply) => {
    const bank = loadDailySeedBank();
    if (!bank) return reply.code(404).send({ error: 'NO_DAILY_BANK' });
    reply.header('Cache-Control', 'public, max-age=300');
    return commitmentOf(bank);
  });

  app.get<{ Querystring: { date?: string } }>('/api/daily/seed', async (req, reply) => {
    const today = utcDateKey(new Date());
    const date = req.query?.date ?? today;
    if (!isUtcDate(date)) return reply.code(400).send({ error: 'INVALID_DATE' });
    if (date > today) return reply.code(403).send({ error: 'NOT_YET_REVEALED', today });
    const bank = loadDailySeedBank();
    if (!bank) return reply.code(404).send({ error: 'NO_DAILY_BANK' });
    const reveal = revealDay(bank, date, today);
    if (!reveal) return reply.code(404).send({ error: 'DAY_NOT_IN_BANK', startDate: bank.startDate, days: bank.entries.length });
    // Past days never change; today's entry is fixed too, but let it expire
    // so a mid-day bank deploy is picked up.
    reply.header('Cache-Control', date < today ? 'public, max-age=86400, immutable' : 'public, max-age=300');
    return reveal;
  });
}
