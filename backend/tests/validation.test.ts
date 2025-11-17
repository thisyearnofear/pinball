/**
 * Tests for Phase 1: Input Validation & Rate Limiting
 */

import {
  validateScoreBounds,
  sanitizePlayerName,
  validateGameMetadata,
  validateScoreSubmission,
  MAX_SCORE,
  PLAYER_NAME_MAX_LENGTH,
  MAX_METADATA_LENGTH
} from '../src/lib/validation';

describe('Input Validation - Phase 1', () => {
  describe('Score Bounds Validation', () => {
    test('should accept valid scores', () => {
      const result = validateScoreBounds(0);
      expect(result.valid).toBe(true);

      const result2 = validateScoreBounds(50000);
      expect(result2.valid).toBe(true);

      const result3 = validateScoreBounds(MAX_SCORE);
      expect(result3.valid).toBe(true);
    });

    test('should reject negative scores', () => {
      const result = validateScoreBounds(-1);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('NEGATIVE_SCORE');
    });

    test('should reject scores exceeding MAX_SCORE', () => {
      const result = validateScoreBounds(MAX_SCORE + 1);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SCORE_TOO_HIGH');
    });

    test('should reject Infinity', () => {
      const result = validateScoreBounds(Infinity);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SCORE');
    });

    test('should reject NaN', () => {
      const result = validateScoreBounds(NaN);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SCORE');
    });
  });

  describe('Player Name Sanitization', () => {
    test('should accept valid names', () => {
      const result = sanitizePlayerName('Alice');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Alice');

      const result2 = sanitizePlayerName('Player-123');
      expect(result2.valid).toBe(true);
      expect(result2.sanitized).toBe('Player-123');
    });

    test('should trim whitespace', () => {
      const result = sanitizePlayerName('  Alice  ');
      expect(result.sanitized).toBe('Alice');
    });

    test('should accept underscores and dots', () => {
      const result = sanitizePlayerName('player_name.eth');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('player_name.eth');
    });

    test('should remove invalid characters', () => {
      const result = sanitizePlayerName('Alice@#$Bob');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('AliceBob');
    });

    test('should truncate long names', () => {
      const longName = 'a'.repeat(PLAYER_NAME_MAX_LENGTH + 10);
      const result = sanitizePlayerName(longName);
      expect(result.sanitized.length).toBeLessThanOrEqual(PLAYER_NAME_MAX_LENGTH);
    });

    test('should handle empty string', () => {
      const result = sanitizePlayerName('');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('');
    });

    test('should handle only-whitespace string', () => {
      const result = sanitizePlayerName('   ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('');
    });
  });

  describe('Metadata Validation', () => {
    test('should accept valid JSON metadata', () => {
      const metadata = JSON.stringify({ duration: 300, ballsUsed: 3 });
      const result = validateGameMetadata(metadata);
      expect(result.valid).toBe(true);
      expect(result.data?.duration).toBe(300);
    });

    test('should accept empty metadata', () => {
      const result = validateGameMetadata('');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({});
    });

    test('should reject invalid JSON', () => {
      const result = validateGameMetadata('{ invalid json }');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('METADATA_INVALID_JSON');
    });

    test('should reject non-object JSON', () => {
      const result = validateGameMetadata(JSON.stringify([1, 2, 3]));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('METADATA_NOT_OBJECT');
    });

    test('should reject null', () => {
      const result = validateGameMetadata(JSON.stringify(null));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('METADATA_NOT_OBJECT');
    });

    test('should validate duration field', () => {
      const metadata = JSON.stringify({ duration: -100 });
      const result = validateGameMetadata(metadata);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('METADATA_INVALID_DURATION');
    });

    test('should validate ballsUsed field', () => {
      const metadata = JSON.stringify({ ballsUsed: 10000 });
      const result = validateGameMetadata(metadata);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('METADATA_INVALID_BALLS_USED');
    });

    test('should validate tableId field', () => {
      const metadata = JSON.stringify({ tableId: -1 });
      const result = validateGameMetadata(metadata);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('METADATA_INVALID_TABLE_ID');
    });

    test('should reject oversized metadata', () => {
      const hugeMetadata = JSON.stringify({ data: 'x'.repeat(MAX_METADATA_LENGTH + 1) });
      const result = validateGameMetadata(hugeMetadata);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('METADATA_TOO_LARGE');
    });
  });

  describe('Complete Score Submission Validation', () => {
    test('should accept valid submission', () => {
      const result = validateScoreSubmission({
        tournamentId: 1,
        address: '0x' + 'a'.repeat(40),
        score: 50000,
        name: 'Alice',
        metadata: JSON.stringify({ duration: 300 })
      });
      expect(result.valid).toBe(true);
      expect(result.sanitized?.score).toBe(50000);
      expect(result.sanitized?.name).toBe('Alice');
    });

    test('should reject invalid tournament ID', () => {
      const result = validateScoreSubmission({
        tournamentId: -1,
        address: '0x' + 'a'.repeat(40),
        score: 50000
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_TOURNAMENT_ID');
    });

    test('should reject invalid address', () => {
      const result = validateScoreSubmission({
        tournamentId: 1,
        address: 'not-an-address',
        score: 50000
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_ADDRESS_FORMAT');
    });

    test('should sanitize player name in submission', () => {
      const result = validateScoreSubmission({
        tournamentId: 1,
        address: '0x' + 'a'.repeat(40),
        score: 50000,
        name: '  Alice@#$  '
      });
      expect(result.valid).toBe(true);
      expect(result.sanitized?.name).toBe('Alice');
    });

    test('should validate all fields together', () => {
      const result = validateScoreSubmission({
        tournamentId: 1,
        address: '0x' + 'a'.repeat(40),
        score: MAX_SCORE + 1,
        name: 'Alice',
        metadata: '{invalid'
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SCORE_TOO_HIGH'); // First validation to fail
    });
  });
});

describe('Rate Limiting', () => {
  const { AddressRateLimiter } = require('../src/lib/rate-limiter');

  test('should allow requests within limit', () => {
    const limiter = new AddressRateLimiter(3, 60000);
    const address = '0x' + 'a'.repeat(40);

    const result1 = limiter.isAllowed(address);
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(2);

    const result2 = limiter.isAllowed(address);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(1);

    const result3 = limiter.isAllowed(address);
    expect(result3.allowed).toBe(true);
    expect(result3.remaining).toBe(0);
  });

  test('should reject requests exceeding limit', () => {
    const limiter = new AddressRateLimiter(1, 60000);
    const address = '0x' + 'a'.repeat(40);

    limiter.isAllowed(address); // First request
    const result2 = limiter.isAllowed(address); // Second request

    expect(result2.allowed).toBe(false);
    expect(result2.remaining).toBe(0);
  });

  test('should reset after window expires', async () => {
    const limiter = new AddressRateLimiter(1, 100); // 100ms window
    const address = '0x' + 'a'.repeat(40);

    const result1 = limiter.isAllowed(address);
    expect(result1.allowed).toBe(true);

    const result2 = limiter.isAllowed(address);
    expect(result2.allowed).toBe(false);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    const result3 = limiter.isAllowed(address);
    expect(result3.allowed).toBe(true);
  });

  test('should track different addresses separately', () => {
    const limiter = new AddressRateLimiter(1, 60000);
    const address1 = '0x' + 'a'.repeat(40);
    const address2 = '0x' + 'b'.repeat(40);

    limiter.isAllowed(address1); // Address1: 1 request
    const result2a = limiter.isAllowed(address1); // Address1: limit exceeded
    expect(result2a.allowed).toBe(false);

    const result1b = limiter.isAllowed(address2); // Address2: 1 request
    expect(result1b.allowed).toBe(true);
  });

  test('should provide status information', () => {
    const limiter = new AddressRateLimiter(3, 60000);
    const address = '0x' + 'a'.repeat(40);

    let status = limiter.getStatus(address);
    expect(status).toBeNull();

    limiter.isAllowed(address);
    status = limiter.getStatus(address);
    expect(status?.count).toBe(1);
    expect(status?.remaining).toBe(2);
  });

  test('should reset address rate limit', () => {
    const limiter = new AddressRateLimiter(1, 60000);
    const address = '0x' + 'a'.repeat(40);

    limiter.isAllowed(address);
    const result1 = limiter.isAllowed(address);
    expect(result1.allowed).toBe(false);

    limiter.reset(address);

    const result2 = limiter.isAllowed(address);
    expect(result2.allowed).toBe(true);
  });

  test('should provide stats for monitoring', () => {
    const limiter = new AddressRateLimiter(3, 60000);
    const address1 = '0x' + 'a'.repeat(40);
    const address2 = '0x' + 'b'.repeat(40);

    limiter.isAllowed(address1);
    limiter.isAllowed(address2);

    const stats = limiter.getStats();
    expect(stats.totalTrackedAddresses).toBe(2);
    expect(stats.memoryUsageBytes).toBeGreaterThan(0);
  });
});
