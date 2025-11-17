import { z } from 'zod';
import { env } from '../lib/env.js';
import { signScore } from '../lib/sign.js';
import { validateScoreSubmission } from '../lib/validation.js';
import { scoreSignatureRateLimiter } from '../lib/rate-limiter.js';
import { nonceTracker } from '../lib/nonce-tracker.js';
const SignBody = z.object({
    tournamentId: z.number().int().positive(),
    address: z.string().startsWith('0x').length(42),
    score: z.number().int().nonnegative(),
    name: z.string().default(''), // Wallet-derived, no length limit
    metadata: z.string().default(''),
});
export async function scoresRoutes(app) {
    app.post('/api/scores/sign', async (req, reply) => {
        // Basic schema validation
        const parsed = SignBody.safeParse(req.body);
        if (!parsed.success) {
            app.log.warn({ error: 'INVALID_BODY', details: parsed.error.flatten() });
            return reply.code(400).send({
                error: 'INVALID_BODY',
                message: 'Request body validation failed',
                details: parsed.error.flatten()
            });
        }
        const { tournamentId, address, score, name, metadata } = parsed.data;
        // Check per-address rate limit
        const rateLimitResult = scoreSignatureRateLimiter.isAllowed(address);
        if (!rateLimitResult.allowed) {
            app.log.warn({
                event: 'RATE_LIMIT_EXCEEDED',
                address,
                resetAt: new Date(rateLimitResult.resetAt).toISOString()
            });
            return reply.code(429).send({
                error: 'RATE_LIMIT_EXCEEDED',
                message: `Too many requests for this address. Try again after ${new Date(rateLimitResult.resetAt).toISOString()}`,
                remaining: rateLimitResult.remaining,
                resetAt: rateLimitResult.resetAt
            });
        }
        // Comprehensive validation and sanitization
        const validationResult = validateScoreSubmission({
            tournamentId,
            address,
            score,
            name,
            metadata
        });
        if (!validationResult.valid) {
            app.log.warn({
                event: 'VALIDATION_FAILED',
                address,
                score,
                reason: validationResult.reason
            });
            return reply.code(400).send({
                error: 'VALIDATION_FAILED',
                message: `Score submission validation failed: ${validationResult.reason}`,
                reason: validationResult.reason
            });
        }
        // Use sanitized values
        if (!validationResult.sanitized) {
            return reply.code(400).send({ error: 'VALIDATION_FAILED' });
        }
        const { sanitized: { tournamentId: tid, address: addr, score: s, name: n, metadata: m } } = validationResult;
        try {
            // Get next nonce for this player
            const nonce = nonceTracker.getNextNonce(tid, addr);
            const signature = await signScore(env.SCORE_SIGNER_PK, tid, addr, s, nonce, n, JSON.stringify(m) // Convert back to string
            );
            app.log.info({
                event: 'SCORE_SIGNED',
                address: addr,
                score: s,
                tournamentId: tid,
                nonce: nonce.toString(),
                rateLimitRemaining: rateLimitResult.remaining
            });
            return {
                signature,
                nonce: nonce.toString(),
                rateLimitRemaining: rateLimitResult.remaining,
                rateLimitResetAt: rateLimitResult.resetAt
            };
        }
        catch (e) {
            app.log.error({
                event: 'SIGN_FAILED',
                error: e.message,
                address: addr,
                score: s
            });
            return reply.code(500).send({
                error: 'SIGN_FAIL',
                message: 'Failed to sign score. Please try again later.'
            });
        }
    });
    // Admin endpoint to get rate limit status (optional)
    app.get('/admin/rate-limit/:address', async (req, reply) => {
        const { address } = req.params;
        // Validate address format
        if (!address.startsWith('0x') || address.length !== 42) {
            return reply.code(400).send({ error: 'INVALID_ADDRESS' });
        }
        const status = scoreSignatureRateLimiter.getStatus(address);
        return {
            address,
            status: status || { remaining: 3, resetAt: Date.now() }
        };
    });
    // Admin endpoint to reset rate limit
    app.post('/admin/rate-limit/:address/reset', async (req, reply) => {
        const { address } = req.params;
        // Validate address format
        if (!address.startsWith('0x') || address.length !== 42) {
            return reply.code(400).send({ error: 'INVALID_ADDRESS' });
        }
        scoreSignatureRateLimiter.reset(address);
        app.log.info({ event: 'RATE_LIMIT_RESET', address });
        return { ok: true, message: `Rate limit reset for ${address}` };
    });
    // Admin endpoint to get current nonce for a player
    app.get('/admin/nonce/:tournamentId/:address', async (req, reply) => {
        const { tournamentId, address } = req.params;
        // Validate inputs
        const tid = parseInt(tournamentId, 10);
        if (isNaN(tid) || tid <= 0) {
            return reply.code(400).send({ error: 'INVALID_TOURNAMENT_ID' });
        }
        if (!address.startsWith('0x') || address.length !== 42) {
            return reply.code(400).send({ error: 'INVALID_ADDRESS' });
        }
        const currentNonce = nonceTracker.getCurrentNonce(tid, address);
        const nextNonce = nonceTracker.getNextNonce(tid, address);
        return {
            tournamentId: tid,
            address,
            currentNonce: currentNonce?.toString() ?? null,
            nextNonce: nextNonce.toString()
        };
    });
    // Admin endpoint to reset nonce for a player
    app.post('/admin/nonce/:tournamentId/:address/reset', async (req, reply) => {
        const { tournamentId, address } = req.params;
        // Validate inputs
        const tid = parseInt(tournamentId, 10);
        if (isNaN(tid) || tid <= 0) {
            return reply.code(400).send({ error: 'INVALID_TOURNAMENT_ID' });
        }
        if (!address.startsWith('0x') || address.length !== 42) {
            return reply.code(400).send({ error: 'INVALID_ADDRESS' });
        }
        nonceTracker.resetPlayer(tid, address);
        app.log.info({ event: 'NONCE_RESET', tournamentId: tid, address });
        return { ok: true, message: `Nonce reset for player ${address} in tournament ${tid}` };
    });
    // Admin endpoint to reset all nonces for a tournament
    app.post('/admin/nonce/:tournamentId/reset', async (req, reply) => {
        const { tournamentId } = req.params;
        // Validate input
        const tid = parseInt(tournamentId, 10);
        if (isNaN(tid) || tid <= 0) {
            return reply.code(400).send({ error: 'INVALID_TOURNAMENT_ID' });
        }
        nonceTracker.resetTournament(tid);
        app.log.info({ event: 'TOURNAMENT_NONCE_RESET', tournamentId: tid });
        return { ok: true, message: `All nonces reset for tournament ${tid}` };
    });
}
