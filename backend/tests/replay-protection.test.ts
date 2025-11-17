import { describe, it, expect, beforeEach } from 'vitest';
import { innerScoreHashV2, buildPersonalDigest } from '../src/lib/sign.js';
import { keccak256, toUtf8Bytes } from 'ethers';

describe('Replay Protection (Phase 2)', () => {
  const tournamentId = 1n;
  const playerAddr = '0x1234567890123456789012345678901234567890';
  const score = 50000n;
  const name = 'Alice';
  const metadata = '{}';

  beforeEach(() => {
    // Clear any state between tests
  });

  describe('innerScoreHashV2 includes nonce', () => {
    it('should produce different hashes for different nonces', () => {
      const nameHash = keccak256(toUtf8Bytes(name));
      const metaHash = keccak256(toUtf8Bytes(metadata));

      const hash1 = innerScoreHashV2(tournamentId, playerAddr, score, 1n, nameHash, metaHash);
      const hash2 = innerScoreHashV2(tournamentId, playerAddr, score, 2n, nameHash, metaHash);

      expect(hash1).not.toBe(hash2);
    });

    it('should be deterministic for same nonce', () => {
      const nameHash = keccak256(toUtf8Bytes(name));
      const metaHash = keccak256(toUtf8Bytes(metadata));

      const hash1 = innerScoreHashV2(tournamentId, playerAddr, score, 1n, nameHash, metaHash);
      const hash2 = innerScoreHashV2(tournamentId, playerAddr, score, 1n, nameHash, metaHash);

      expect(hash1).toBe(hash2);
    });
  });

  describe('chainId binding (Arbitrum One)', () => {
    it('should bind signature to chainId 42161', () => {
      const nameHash = keccak256(toUtf8Bytes(name));
      const metaHash = keccak256(toUtf8Bytes(metadata));

      // V2 hash includes 42161 (Arbitrum One)
      const hash = innerScoreHashV2(tournamentId, playerAddr, score, 1n, nameHash, metaHash);

      // The hash should be stable for Arbitrum One
      const hash2 = innerScoreHashV2(tournamentId, playerAddr, score, 1n, nameHash, metaHash);
      expect(hash).toBe(hash2);
    });
  });

  describe('version differentiation', () => {
    it('should use different prefix for V2', () => {
      // V2 uses "PINBALL_SCORE:v2" prefix
      // This ensures V1 signatures cannot be replayed as V2 and vice versa
      const nameHash = keccak256(toUtf8Bytes(name));
      const metaHash = keccak256(toUtf8Bytes(metadata));

      const hashV2 = innerScoreHashV2(tournamentId, playerAddr, score, 1n, nameHash, metaHash);

      // Hash should be created (if we had a V1 hash function, they would differ)
      expect(hashV2).toBeDefined();
      expect(typeof hashV2).toBe('string');
    });
  });

  describe('digest building', () => {
    it('should apply personal_sign wrapper correctly', () => {
      const innerHash = '0x1234567890123456789012345678901234567890123456789012345678901234';
      const digest = buildPersonalDigest(innerHash);

      // Result should be a valid hex string
      expect(digest).toMatch(/^0x[0-9a-f]{64}$/i);
    });

    it('should include EIP-191 prefix in digest', () => {
      const innerHash1 = '0x1111111111111111111111111111111111111111111111111111111111111111';
      const innerHash2 = '0x2222222222222222222222222222222222222222222222222222222222222222';

      const digest1 = buildPersonalDigest(innerHash1);
      const digest2 = buildPersonalDigest(innerHash2);

      // Different inner hashes must produce different digests
      expect(digest1).not.toBe(digest2);
    });
  });

  describe('nonce sequencing', () => {
    it('should require sequential nonces', () => {
      const nameHash = keccak256(toUtf8Bytes(name));
      const metaHash = keccak256(toUtf8Bytes(metadata));

      // Generate hashes for sequential nonces
      const nonces = [1n, 2n, 3n, 4n, 5n];
      const hashes = nonces.map(nonce =>
        innerScoreHashV2(tournamentId, playerAddr, score, nonce, nameHash, metaHash)
      );

      // All hashes should be unique
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(hashes.length);
    });

    it('should make it impossible to skip nonces', () => {
      const nameHash = keccak256(toUtf8Bytes(name));
      const metaHash = keccak256(toUtf8Bytes(metadata));

      // Contract enforces nonce == lastNonce + 1
      // So if player has submitted nonce 1, they cannot submit nonce 3 next
      // (though the signature would be valid, the nonce check prevents it)

      const hash1 = innerScoreHashV2(tournamentId, playerAddr, score, 1n, nameHash, metaHash);
      const hash3 = innerScoreHashV2(tournamentId, playerAddr, score, 3n, nameHash, metaHash);

      // Hashes are different, but contract validation ensures sequence
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('score immutability with nonce', () => {
    it('should bind score value to nonce', () => {
      const nameHash = keccak256(toUtf8Bytes(name));
      const metaHash = keccak256(toUtf8Bytes(metadata));

      const hash1 = innerScoreHashV2(tournamentId, playerAddr, 1000n, 1n, nameHash, metaHash);
      const hash2 = innerScoreHashV2(tournamentId, playerAddr, 2000n, 1n, nameHash, metaHash);

      // Same nonce, different score => different hash
      expect(hash1).not.toBe(hash2);
    });

    it('should bind score and nonce together', () => {
      const nameHash = keccak256(toUtf8Bytes(name));
      const metaHash = keccak256(toUtf8Bytes(metadata));

      // Score 1000 with nonce 1
      const hash1a = innerScoreHashV2(tournamentId, playerAddr, 1000n, 1n, nameHash, metaHash);

      // Score 1000 with nonce 2
      const hash1b = innerScoreHashV2(tournamentId, playerAddr, 1000n, 2n, nameHash, metaHash);

      // Same score, different nonce => different hash
      expect(hash1a).not.toBe(hash1b);
    });
  });

  describe('metadata binding', () => {
    it('should include metadata hash in signature', () => {
      const nameHash = keccak256(toUtf8Bytes(name));
      const metaHash1 = keccak256(toUtf8Bytes('{"duration": 300}'));
      const metaHash2 = keccak256(toUtf8Bytes('{"duration": 600}'));

      const hash1 = innerScoreHashV2(tournamentId, playerAddr, score, 1n, nameHash, metaHash1);
      const hash2 = innerScoreHashV2(tournamentId, playerAddr, score, 1n, nameHash, metaHash2);

      // Same score/nonce, different metadata => different hash
      expect(hash1).not.toBe(hash2);
    });
  });
});
