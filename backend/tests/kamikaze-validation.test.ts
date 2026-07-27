/**
 * Tests for Kamikaze-mode validation: inverted score bounds, plausibility
 * cross-checks, and admin endpoint auth.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  validateScoreBounds,
  validatePlausibility,
  validateScoreSubmission,
  MIN_DRAIN_MS,
  MAX_DRAIN_MS,
  MAX_POINTS_PER_SECOND,
} from '../src/lib/validation';

const ADDRESS = '0x' + 'a'.repeat(40);

describe('Kamikaze score bounds (inverted)', () => {
  test('should accept a plausible drain time', () => {
    expect(validateScoreBounds(5_000, 'kamikaze').valid).toBe(true);
    expect(validateScoreBounds(MIN_DRAIN_MS, 'kamikaze').valid).toBe(true);
    expect(validateScoreBounds(MAX_DRAIN_MS, 'kamikaze').valid).toBe(true);
  });

  test('should reject implausibly fast drains', () => {
    const result = validateScoreBounds(MIN_DRAIN_MS - 1, 'kamikaze');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('DRAIN_TOO_FAST');
  });

  test('should reject a zero score (0-is-perfect sentinel attack)', () => {
    const result = validateScoreBounds(0, 'kamikaze');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('DRAIN_TOO_FAST');
  });

  test('should reject drains longer than an hour', () => {
    const result = validateScoreBounds(MAX_DRAIN_MS + 1, 'kamikaze');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('DRAIN_TOO_SLOW');
  });

  test('classic bounds remain unaffected', () => {
    expect(validateScoreBounds(0, 'classic').valid).toBe(true);
    expect(validateScoreBounds(0).valid).toBe(true);
  });
});

describe('Plausibility cross-checks', () => {
  test('kamikaze: should accept score within penalty ceiling of duration', () => {
    // 10s run, 20s score (penalties) is plausible
    expect(validatePlausibility(20_000, 'kamikaze', { duration: 10_000 }).valid).toBe(true);
  });

  test('kamikaze: should reject score wildly exceeding run duration', () => {
    const result = validatePlausibility(100_000, 'kamikaze', { duration: 10_000 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('SCORE_EXCEEDS_DURATION');
  });

  test('classic: should reject implausible point rates', () => {
    const result = validatePlausibility(10_000_000, 'classic', { duration: 5_000 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('SCORE_RATE_IMPLAUSIBLE');
  });

  test('classic: should accept peak legitimate rates', () => {
    // 10s run at max plausible rate
    const score = 10 * MAX_POINTS_PER_SECOND;
    expect(validatePlausibility(score, 'classic', { duration: 10_000 }).valid).toBe(true);
  });

  test('should skip checks when duration is absent (older clients)', () => {
    expect(validatePlausibility(9_999_999, 'classic', {}).valid).toBe(true);
    expect(validatePlausibility(3_000_000, 'kamikaze', {}).valid).toBe(true);
  });

  test('full submission: kamikaze metadata drives inverted validation', () => {
    const result = validateScoreSubmission({
      tournamentId: 1,
      address: ADDRESS,
      score: 400, // < MIN_DRAIN_MS
      metadata: JSON.stringify({ mode: 'kamikaze' }),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('DRAIN_TOO_FAST');
  });

  test('full submission: plausibility failure surfaces its reason', () => {
    const result = validateScoreSubmission({
      tournamentId: 1,
      address: ADDRESS,
      score: 500_000,
      metadata: JSON.stringify({ mode: 'kamikaze', duration: 10_000 }),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('SCORE_EXCEEDS_DURATION');
  });
});

describe('Admin auth', () => {
  function getReply() {
    const reply: any = {
      statusCode: 0,
      body: undefined as unknown,
      code(c: number) { this.statusCode = c; return this; },
      send(payload: unknown) { this.body = payload; return this; },
    };
    return reply;
  }

  beforeEach(() => {
    vi.resetModules();
    vi.unmock('../src/lib/env.js');
  });

  test('should 404 when ADMIN_TOKEN is unset', async () => {
    vi.doMock('../src/lib/env.js', () => ({ env: { ADMIN_TOKEN: undefined } }));
    const { adminAuth } = await import('../src/lib/admin-auth.js');

    const reply = getReply();
    const done = vi.fn();
    adminAuth({ headers: {} } as any, reply, done);

    expect(reply.statusCode).toBe(404);
    expect(done).not.toHaveBeenCalled();
  });

  test('should 401 on missing or wrong bearer token', async () => {
    vi.doMock('../src/lib/env.js', () => ({ env: { ADMIN_TOKEN: 'super-secret-token-123' } }));
    const { adminAuth } = await import('../src/lib/admin-auth.js');

    const missing = getReply();
    adminAuth({ headers: {} } as any, missing, vi.fn());
    expect(missing.statusCode).toBe(401);

    const wrong = getReply();
    adminAuth({ headers: { authorization: 'Bearer nope' } } as any, wrong, vi.fn());
    expect(wrong.statusCode).toBe(401);
  });

  test('should pass through with the correct bearer token', async () => {
    vi.doMock('../src/lib/env.js', () => ({ env: { ADMIN_TOKEN: 'super-secret-token-123' } }));
    const { adminAuth } = await import('../src/lib/admin-auth.js');

    const reply = getReply();
    const done = vi.fn();
    adminAuth({ headers: { authorization: 'Bearer super-secret-token-123' } } as any, reply, done);

    expect(reply.statusCode).toBe(0);
    expect(done).toHaveBeenCalled();
  });
});
