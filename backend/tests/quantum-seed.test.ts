import { describe, it, expect, vi } from 'vitest';
import {
  combineUint16,
  csprngSeeds,
  clampSeedCount,
  fetchQuantumSeeds,
  MAX_SEED_COUNT,
} from '../src/lib/quantum-seed.js';

/** Deterministic stand-in for crypto.randomBytes so seeds are predictable. */
function fakeRandom(fill = 0xab) {
  return (size: number) => Buffer.alloc(size, fill);
}

function qrngResponse(values: number[], ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ success: true, type: 'uint16', length: values.length, data: values }),
  } as unknown as Response;
}

describe('combineUint16', () => {
  it('pairs two uint16 words into one 32-bit seed', () => {
    expect(combineUint16([0x1234, 0x5678], 1)).toEqual([0x12345678]);
    expect(combineUint16([1, 2, 3, 4], 2)).toEqual([(1 << 16) | 2, (3 << 16) | 4]);
  });

  it('stops at the requested count and ignores a trailing odd word', () => {
    expect(combineUint16([1, 2, 3, 4, 5], 1)).toEqual([(1 << 16) | 2]);
    expect(combineUint16([1, 2, 3], 3)).toEqual([(1 << 16) | 2]);
  });

  it('drops out-of-range and non-integer words (compacting the remainder)', () => {
    // -1 and 70000 are dropped, so [1, 2, 3, 4] pairs into 1 seed.
    expect(combineUint16([1, -1, 2, 70000, 3, 4], 1)).toEqual([(1 << 16) | 2]);
    expect(combineUint16([1, -1, 2, 70000, 3, 4], 2)).toEqual([(1 << 16) | 2, (3 << 16) | 4]);
  });

  it('returns empty for non-arrays', () => {
    expect(combineUint16(undefined, 1)).toEqual([]);
    expect(combineUint16({ data: [1, 2] }, 1)).toEqual([]);
  });
});

describe('clampSeedCount', () => {
  it('clamps into [1, MAX] and floors', () => {
    expect(clampSeedCount(0)).toBe(1);
    expect(clampSeedCount(-5)).toBe(1);
    expect(clampSeedCount(999)).toBe(MAX_SEED_COUNT);
    expect(clampSeedCount(3.9)).toBe(3);
    expect(clampSeedCount(Number.NaN)).toBe(1);
  });
});

describe('csprngSeeds', () => {
  it('returns uint32 seeds derived from the byte source', () => {
    const seeds = csprngSeeds(2, fakeRandom(0x01));
    expect(seeds).toEqual([0x01010101, 0x01010101]);
    for (const s of seeds) {
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('fetchQuantumSeeds', () => {
  it('falls back to CSPRNG when no provider is configured', async () => {
    const batch = await fetchQuantumSeeds(4, { url: '', randomBytesImpl: fakeRandom(0x0a) });
    expect(batch.source).toBe('csprng');
    expect(batch.seeds).toHaveLength(4);
    expect(batch.seeds.every((s) => s === 0x0a0a0a0a)).toBe(true);
  });

  it('uses QRNG numbers when the provider responds', async () => {
    const fetchImpl = vi.fn(async () => qrngResponse([0x1111, 0x2222, 0x3333, 0x4444]));
    const batch = await fetchQuantumSeeds(2, { url: 'https://qrng.test/json', fetchImpl });
    expect(batch.source).toBe('qrng');
    expect(batch.seeds).toEqual([0x11112222, 0x33334444]);
    // Two uint16 words per seed were requested.
    expect(String(fetchImpl.mock.calls[0][0])).toContain('length=4');
  });

  it('sends the api key header when configured', async () => {
    const fetchImpl = vi.fn(async () => qrngResponse([1, 2]));
    await fetchQuantumSeeds(1, { url: 'https://qrng.test/json', apiKey: 'secret', fetchImpl });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('secret');
  });

  it('degrades to CSPRNG on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => qrngResponse([], false));
    const batch = await fetchQuantumSeeds(2, { url: 'https://qrng.test/json', fetchImpl, randomBytesImpl: fakeRandom(0x05) });
    expect(batch.source).toBe('csprng');
    expect(batch.seeds).toHaveLength(2);
  });

  it('degrades to CSPRNG when the request throws (timeout / DNS)', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('aborted'); });
    const batch = await fetchQuantumSeeds(3, { url: 'https://qrng.test/json', fetchImpl, randomBytesImpl: fakeRandom(0x07) });
    expect(batch.source).toBe('csprng');
    expect(batch.seeds).toHaveLength(3);
  });

  it('degrades to CSPRNG when the body is malformed or short', async () => {
    const short = vi.fn(async () => qrngResponse([1, 2]));
    const a = await fetchQuantumSeeds(4, { url: 'https://qrng.test/json', fetchImpl: short, randomBytesImpl: fakeRandom(0x09) });
    expect(a.source).toBe('csprng');
    expect(a.seeds).toHaveLength(4);

    const garbage = vi.fn(async () => ({ ok: true, json: async () => ({ data: 'nope' }) } as unknown as Response));
    const b = await fetchQuantumSeeds(1, { url: 'https://qrng.test/json', fetchImpl: garbage, randomBytesImpl: fakeRandom(0x0b) });
    expect(b.source).toBe('csprng');
  });

  it('always returns the clamped count', async () => {
    const fetchImpl = vi.fn(async () => qrngResponse(Array.from({ length: 64 }, (_, i) => i % 0xffff)));
    const many = await fetchQuantumSeeds(999, { url: 'https://qrng.test/json', fetchImpl });
    expect(many.seeds).toHaveLength(MAX_SEED_COUNT);

    const zero = await fetchQuantumSeeds(0, { url: '', randomBytesImpl: fakeRandom(0x01) });
    expect(zero.seeds).toHaveLength(1);
  });
});
