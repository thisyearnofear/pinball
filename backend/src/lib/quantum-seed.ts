/**
 * Quantum seed source.
 *
 * A run is fully deterministic from a single 32-bit seed (mulberry32), and that
 * seed is recorded in the replay digest — so the game stays replay-verifiable no
 * matter WHERE the seed came from. That is what makes a quantum RNG safe here:
 * it replaces the one genuinely non-deterministic input (the seed), not any of
 * the physics it feeds. See docs/QUANTUM_SEEDS.md.
 *
 * The provider is deliberately generic. It is NOT a MOTH endpoint: MOTH's public
 * API is a creative-compute platform (engines/jobs/assets), not a randomness
 * beacon. Point QUANTUM_SEED_URL at any HTTP-JSON QRNG.
 *
 * Contract: this never throws and never returns fewer than `count` seeds. A
 * provider outage must never break play — it degrades to a CSPRNG and says so
 * in `source`, which the client records for provenance.
 *
 * Reads process.env directly (rather than lib/env.ts) so the module stays
 * dependency-free and unit-testable; lib/env.ts declares/validates the same
 * vars at boot for production.
 */
import { randomBytes } from 'node:crypto';

/** Parse a QRNG response into 32-bit seeds. Pure — unit-testable. */
export function combineUint16(data: unknown, count: number): number[] {
  if (!Array.isArray(data)) return [];
  const clean = data.filter(
    (n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffff,
  );
  const seeds: number[] = [];
  for (let i = 0; i + 1 < clean.length && seeds.length < count; i += 2) {
    seeds.push(((clean[i] << 16) | clean[i + 1]) >>> 0);
  }
  return seeds;
}

export type SeedSource = 'qrng' | 'csprng';
export type SeedBatch = { seeds: number[]; source: SeedSource };

export const MAX_SEED_COUNT = 32;

export function clampSeedCount(count: number): number {
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.min(MAX_SEED_COUNT, Math.floor(count)));
}

/** Cryptographically strong local seeds, combined into uint32 values. */
export function csprngSeeds(
  count: number,
  randomBytesImpl: (size: number) => Buffer = randomBytes,
): number[] {
  const buf = randomBytesImpl(count * 4);
  const seeds: number[] = [];
  for (let i = 0; i < count; i++) seeds.push(buf.readUInt32BE(i * 4));
  return seeds;
}

export type FetchSeedsOptions = {
  url?: string;
  apiKey?: string;
  timeoutMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  randomBytesImpl?: (size: number) => Buffer;
};

/**
 * Fetch `count` seeds. Uses the configured QRNG when QUANTUM_SEED_URL is set and
 * reachable; otherwise a cryptographic local RNG. The returned `source` always
 * reflects which path was actually used.
 */
export async function fetchQuantumSeeds(
  count: number,
  opts: FetchSeedsOptions = {},
): Promise<SeedBatch> {
  const n = clampSeedCount(count);

  const url = opts.url ?? process.env.QUANTUM_SEED_URL;
  const apiKey = opts.apiKey ?? process.env.QUANTUM_SEED_API_KEY;
  const timeoutMs = opts.timeoutMs
    ?? (Number.parseInt(process.env.QUANTUM_SEED_TIMEOUT_MS ?? '', 10) || 2000);
  const doFetch = opts.fetchImpl ?? fetch;
  const randomBytesImpl = opts.randomBytesImpl ?? randomBytes;

  const fallback = (): SeedBatch => ({ seeds: csprngSeeds(n, randomBytesImpl), source: 'csprng' });

  if (!url) return fallback();

  try {
    // ANU-QRNG compatible shape by default: ?length=N&type=uint16 -> { data: [...] }.
    // Two uint16 words make one 32-bit seed.
    const endpoint = `${url}${url.includes('?') ? '&' : '?'}length=${n * 2}&type=uint16`;
    const res = await doFetch(endpoint, {
      method: 'GET',
      headers: apiKey ? { 'x-api-key': apiKey } : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return fallback();
    const body = (await res.json()) as { data?: unknown };
    const seeds = combineUint16(body?.data, n);
    if (seeds.length < n) return fallback();
    return { seeds, source: 'qrng' };
  } catch {
    // Timeout, DNS failure, bad JSON, non-JSON body — all degrade to CSPRNG.
    return fallback();
  }
}
