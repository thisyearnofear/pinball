/**
 * Quantum seed source.
 *
 * A run is fully deterministic from a single 32-bit seed (mulberry32), and that
 * seed is recorded in the replay digest — so the game stays replay-verifiable no
 * matter WHERE the seed came from. That is what makes a quantum RNG safe here:
 * it replaces the one genuinely non-deterministic input (the seed), not any of
 * the physics it feeds. See docs/QUANTUM_SEEDS.md.
 *
 * Two providers, chosen by QUANTUM_SEED_PROVIDER:
 * - `anu` (default): any HTTP-JSON QRNG at QUANTUM_SEED_URL (ANU-compatible).
 * - `moth`: MOTH comet-qrng-v1 (lib/moth-seed.ts), served from a background-
 *   refilled pool because its jobs take seconds (emu) to minutes (qpu).
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
import { MothSeedPool, type MothAttestation, type MothMode } from './moth-seed.js';

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

/**
 * - `qrng`: HTTP-JSON QRNG (anu provider)
 * - `moth-qpu`: MOTH comet-qrng-v1 on quantum hardware (result reports qpu + a real device)
 * - `moth-emu`: MOTH comet-qrng-v1 on the Aer simulator — NOT hardware-quantum
 * - `csprng`: backend CSPRNG (provider unset/unavailable)
 */
export type SeedSource = 'qrng' | 'moth-qpu' | 'moth-emu' | 'csprng';
export type SeedBatch = {
  seeds: number[];
  source: SeedSource;
  /** MOTH job/pulse provenance for the whole batch (moth-* sources only). */
  attestation?: MothAttestation;
};

export type SeedProvider = 'anu' | 'moth';

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
  provider?: SeedProvider;
  /** MOTH pool to serve from (defaults to the env-configured singleton). */
  mothPool?: MothSeedPool;
};

export function resolveSeedProvider(raw = process.env.QUANTUM_SEED_PROVIDER): SeedProvider {
  return raw?.trim().toLowerCase() === 'moth' ? 'moth' : 'anu';
}

function envInt(name: string): number | undefined {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Pool options from env. The key is read here and never logged. */
export function mothPoolOptionsFromEnv() {
  const mode: MothMode = process.env.MOTH_SEED_MODE?.trim().toLowerCase() === 'qpu' ? 'qpu' : 'emu';
  return {
    apiKey: process.env.MOTH_API_KEY || undefined,
    mode,
    baseUrl: process.env.MOTH_API_URL || undefined,
    count: envInt('MOTH_SEED_BATCH'),
    shots: envInt('MOTH_SEED_SHOTS'),
    timeoutMs: envInt('MOTH_SEED_TIMEOUT_MS'),
    pollIntervalMs: envInt('MOTH_SEED_POLL_MS'),
  };
}

let defaultMothPool: MothSeedPool | null = null;
export function getDefaultMothPool(): MothSeedPool {
  defaultMothPool ??= new MothSeedPool(mothPoolOptionsFromEnv());
  return defaultMothPool;
}

/**
 * Start filling the MOTH pool at boot so the first runs can be MOTH-seeded.
 * No-op for the anu provider or without a key; never rejects.
 */
export function warmQuantumSeedProvider(): Promise<void> {
  if (resolveSeedProvider() !== 'moth') return Promise.resolve();
  return getDefaultMothPool().refill();
}

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
  const randomBytesImpl = opts.randomBytesImpl ?? randomBytes;
  const fallback = (): SeedBatch => ({ seeds: csprngSeeds(n, randomBytesImpl), source: 'csprng' });

  if ((opts.provider ?? resolveSeedProvider()) === 'moth') {
    try {
      // Synchronous take: a MOTH job is never awaited on the request path.
      // An empty/short pool serves CSPRNG now and refills in the background.
      const chunk = (opts.mothPool ?? getDefaultMothPool()).take(n);
      if (!chunk || chunk.seeds.length < n) return fallback();
      return {
        seeds: chunk.seeds,
        source: chunk.attestation.mode === 'qpu' ? 'moth-qpu' : 'moth-emu',
        attestation: chunk.attestation,
      };
    } catch {
      return fallback();
    }
  }

  const url = opts.url ?? process.env.QUANTUM_SEED_URL;
  const apiKey = opts.apiKey ?? process.env.QUANTUM_SEED_API_KEY;
  const timeoutMs = opts.timeoutMs
    ?? (Number.parseInt(process.env.QUANTUM_SEED_TIMEOUT_MS ?? '', 10) || 2000);
  const doFetch = opts.fetchImpl ?? fetch;

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
