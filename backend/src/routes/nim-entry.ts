import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../lib/env.js';

const NimEntrySchema = z.object({
  tournamentId: z.number().int().positive(),
  playerAddress: z.string().min(3),
  txHash: z.string().min(10),
  from: z.string().min(10),
  valueLuna: z.number().int().positive(),
});

/**
 * NIM entry route — registers a player into a tournament after they've
 * paid the entry fee in NIM on the Nimiq chain.
 *
 * Flow:
 *   1. Player pays NIM to the treasury via Nimiq Pay (client-side)
 *   2. Client sends the tx hash here
 *   3. Backend verifies the tx on the Nimiq chain (via RPC) and records entry
 *
 * For the competition, this demonstrates real NIM integration as a core
 * part of the user experience (not just a logo).
 */
export async function nimEntryRoutes(app: FastifyInstance) {
  app.post('/api/nim-entry', async (request, reply) => {
    const parsed = NimEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { tournamentId, playerAddress, txHash, from, valueLuna } = parsed.data;

    // Minimum entry fee: 1 NIM = 100,000 Luna
    const minFeeLuna = Number(env.NIM_ENTRY_FEE_LUNA ?? 100000);
    if (valueLuna < minFeeLuna) {
      return reply.status(400).send({ error: `Insufficient NIM. Minimum: ${minFeeLuna / 100000} NIM` });
    }

    // Verify treasury address matches
    const expectedTreasury = env.NIM_TREASURY_ADDRESS;
    if (!expectedTreasury) {
      return reply.status(503).send({ error: 'NIM payments not configured on server' });
    }

    // Verify the transaction on the Nimiq chain via RPC
    try {
      const nimiqRpc = env.NIMIQ_RPC_URL ?? 'https://rpc.nimiq-mainnet.nimiq-network.com';
      const rpcRes = await fetch(nimiqRpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransactionByHash',
          params: [txHash],
        }),
      });

      if (!rpcRes.ok) {
        return reply.status(502).send({ error: 'Failed to verify transaction on Nimiq chain' });
      }

      const rpcBody = await rpcRes.json() as any;
      const tx = rpcBody?.result;
      if (!tx) {
        return reply.status(404).send({ error: 'Transaction not found on Nimiq chain' });
      }

      // Verify recipient is our treasury
      if (tx.to?.toLowerCase() !== expectedTreasury.toLowerCase()) {
        return reply.status(400).send({ error: 'Transaction recipient does not match treasury' });
      }

      // Verify amount
      if (Number(tx.value) < minFeeLuna) {
        return reply.status(400).send({ error: 'Transaction value below minimum entry fee' });
      }

      // Verify sender matches claimed `from`
      if (tx.from?.toLowerCase() !== from.toLowerCase()) {
        return reply.status(400).send({ error: 'Transaction sender mismatch' });
      }
    } catch (err: any) {
      app.log.error({ err }, 'NIM tx verification failed');
      return reply.status(502).send({ error: 'Transaction verification failed' });
    }

    // Record the entry (in-memory for MVP; production would use a database)
    const entryKey = `${tournamentId}:${playerAddress.toLowerCase()}`;
    nimEntries.set(entryKey, {
      tournamentId,
      playerAddress,
      txHash,
      from,
      valueLuna,
      timestamp: Date.now(),
    });

    app.log.info({ tournamentId, playerAddress, txHash }, 'NIM entry registered');

    return reply.status(200).send({
      ok: true,
      message: `Entered tournament #${tournamentId} with NIM!`,
      txHash,
    });
  });

  // Admin: list NIM entries
  app.get('/api/nim-entries', async (_request, reply) => {
    return reply.send({ entries: Array.from(nimEntries.values()) });
  });
}

// Simple in-memory store for NIM entries (MVP)
const nimEntries = new Map<string, {
  tournamentId: number;
  playerAddress: string;
  txHash: string;
  from: string;
  valueLuna: number;
  timestamp: number;
}>();
