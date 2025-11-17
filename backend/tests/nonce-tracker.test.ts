import { describe, it, expect, beforeEach } from 'vitest';
import { NonceTracker } from '../src/lib/nonce-tracker.js';

describe('NonceTracker', () => {
  let tracker: NonceTracker;
  const tournamentId = 1;
  const playerAddr = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    tracker = new NonceTracker();
  });

  describe('getNextNonce', () => {
    it('should return 1 for first submission', () => {
      const nonce = tracker.getNextNonce(tournamentId, playerAddr);
      expect(nonce).toBe(1n);
    });

    it('should return 1 for new tournament', () => {
      tracker.recordNonce(1, playerAddr, 1n);
      const nonce = tracker.getNextNonce(2, playerAddr);
      expect(nonce).toBe(1n);
    });

    it('should return 2 after first submission recorded', () => {
      tracker.recordNonce(tournamentId, playerAddr, 1n);
      const nonce = tracker.getNextNonce(tournamentId, playerAddr);
      expect(nonce).toBe(2n);
    });

    it('should increment after each submission', () => {
      const nonces = [];
      for (let i = 1; i <= 5; i++) {
        const nonce = tracker.getNextNonce(tournamentId, playerAddr);
        nonces.push(nonce);
        tracker.recordNonce(tournamentId, playerAddr, nonce);
      }
      expect(nonces).toEqual([1n, 2n, 3n, 4n, 5n]);
    });
  });

  describe('isValidNext', () => {
    it('should return true for next valid nonce', () => {
      tracker.recordNonce(tournamentId, playerAddr, 1n);
      const isValid = tracker.isValidNext(tournamentId, playerAddr, 2n);
      expect(isValid).toBe(true);
    });

    it('should return false for wrong nonce', () => {
      tracker.recordNonce(tournamentId, playerAddr, 1n);
      const isValid = tracker.isValidNext(tournamentId, playerAddr, 3n);
      expect(isValid).toBe(false);
    });

    it('should return false for replayed nonce', () => {
      tracker.recordNonce(tournamentId, playerAddr, 1n);
      const isValid = tracker.isValidNext(tournamentId, playerAddr, 1n);
      expect(isValid).toBe(false);
    });
  });

  describe('getCurrentNonce', () => {
    it('should return null for new player', () => {
      const nonce = tracker.getCurrentNonce(tournamentId, playerAddr);
      expect(nonce).toBeNull();
    });

    it('should return recorded nonce', () => {
      tracker.recordNonce(tournamentId, playerAddr, 5n);
      const nonce = tracker.getCurrentNonce(tournamentId, playerAddr);
      expect(nonce).toBe(5n);
    });
  });

  describe('resetPlayer', () => {
    it('should reset player nonce', () => {
      tracker.recordNonce(tournamentId, playerAddr, 5n);
      tracker.resetPlayer(tournamentId, playerAddr);

      const nonce = tracker.getNextNonce(tournamentId, playerAddr);
      expect(nonce).toBe(1n);
    });

    it('should not affect other players', () => {
      const player1 = '0x0000000000000000000000000000000000000001';
      const player2 = '0x0000000000000000000000000000000000000002';

      tracker.recordNonce(tournamentId, player1, 5n);
      tracker.recordNonce(tournamentId, player2, 10n);

      tracker.resetPlayer(tournamentId, player1);

      expect(tracker.getNextNonce(tournamentId, player1)).toBe(1n);
      expect(tracker.getNextNonce(tournamentId, player2)).toBe(11n);
    });
  });

  describe('resetTournament', () => {
    it('should reset all players in tournament', () => {
      const player1 = '0x0000000000000000000000000000000000000001';
      const player2 = '0x0000000000000000000000000000000000000002';

      tracker.recordNonce(tournamentId, player1, 5n);
      tracker.recordNonce(tournamentId, player2, 10n);

      tracker.resetTournament(tournamentId);

      expect(tracker.getNextNonce(tournamentId, player1)).toBe(1n);
      expect(tracker.getNextNonce(tournamentId, player2)).toBe(1n);
    });

    it('should not affect other tournaments', () => {
      const player = '0x0000000000000000000000000000000000000001';
      const tournament1 = 1;
      const tournament2 = 2;

      tracker.recordNonce(tournament1, player, 5n);
      tracker.recordNonce(tournament2, player, 10n);

      tracker.resetTournament(tournament1);

      expect(tracker.getNextNonce(tournament1, player)).toBe(1n);
      expect(tracker.getNextNonce(tournament2, player)).toBe(11n);
    });
  });

  describe('address case insensitivity', () => {
    it('should treat addresses case-insensitively', () => {
      const lower = '0x1234567890123456789012345678901234567890';
      const upper = '0x1234567890123456789012345678901234567890'.toUpperCase();
      const mixed = '0x1234567890123456789012345678901234567890';

      tracker.recordNonce(tournamentId, lower, 1n);

      // Should recognize these as the same player
      expect(tracker.getNextNonce(tournamentId, upper)).toBe(2n);
      expect(tracker.getNextNonce(tournamentId, mixed)).toBe(2n);
    });
  });

  describe('getStats', () => {
    it('should track stats correctly', () => {
      const player1 = '0x0000000000000000000000000000000000000001';
      const player2 = '0x0000000000000000000000000000000000000002';

      tracker.recordNonce(1, player1, 1n);
      tracker.recordNonce(1, player2, 1n);
      tracker.recordNonce(2, player1, 1n);

      const stats = tracker.getStats();
      expect(stats.totalTournaments).toBe(2);
      expect(stats.totalPlayers).toBe(3); // 2 in tournament 1, 1 in tournament 2
    });
  });

  describe('replay attack prevention', () => {
    it('should prevent signature replay within same tournament', () => {
      // Player submits with nonce 1
      const nonce1 = tracker.getNextNonce(tournamentId, playerAddr);
      expect(nonce1).toBe(1n);
      tracker.recordNonce(tournamentId, playerAddr, nonce1);

      // Attacker tries to replay same nonce
      const nonce2 = tracker.getNextNonce(tournamentId, playerAddr);
      expect(nonce2).toBe(2n);
      expect(nonce2).not.toBe(nonce1);

      // Even if they try to submit with old nonce, it won't match
      expect(tracker.isValidNext(tournamentId, playerAddr, nonce1)).toBe(false);
    });

    it('should allow same nonce in different tournaments', () => {
      tracker.recordNonce(1, playerAddr, 1n);
      tracker.recordNonce(2, playerAddr, 1n);

      // Different tournaments can have same nonce from same player
      expect(tracker.getCurrentNonce(1, playerAddr)).toBe(1n);
      expect(tracker.getCurrentNonce(2, playerAddr)).toBe(1n);

      // But next nonce should still be 2 in both
      expect(tracker.getNextNonce(1, playerAddr)).toBe(2n);
      expect(tracker.getNextNonce(2, playerAddr)).toBe(2n);
    });
  });
});
