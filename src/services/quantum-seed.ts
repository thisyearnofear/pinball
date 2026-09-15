/**
 * Quantum-seeded runs.
 *
 * The ONLY non-deterministic input to a run is its 32-bit seed; everything after
 * that is deterministic (mulberry32) and the seed is recorded in the replay
 * digest. So sourcing the seed from a quantum RNG does not weaken verifiability
 * — replays still re-simulate identically. See docs/QUANTUM_SEEDS.md.
 *
 * Seeds are prefetched in small batches from the backend (which holds the
 * provider key) so run creation stays synchronous. Any failure — unconfigured
 * backend, offline WebView, provider outage — silently falls back to the local
 * CSPRNG seed. Play never blocks on the network.
 */
import axios from "axios";
import { getAppConfig } from "@/config/app-config";
import { createRunSeed } from "@/utils/rng";

/** Where a run's seed came from. Recorded in the replay for provenance. */
export type SeedSource = "qrng" | "csprng" | "local";

export type SeedBatch = { seeds: number[]; source: SeedSource };

const PREFETCH_COUNT = 8;
/** Refill when the buffer drops to this level. */
const LOW_WATER_MARK = 2;
const REQUEST_TIMEOUT_MS = 2500;

let buffer: number[] = [];
let bufferSource: SeedSource = "csprng";
let lastSource: SeedSource = "local";
let inFlight: Promise<void> | null = null;

const API_BASE = (() => {
  try {
    return getAppConfig().backend.baseUrl;
  } catch {
    return "";
  }
})();

function isUint32(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
}

/**
 * Warm the seed buffer. Safe to call opportunistically (on app mount, on run
 * end): it is fire-and-forget, de-duplicated, and never throws.
 */
export function prefetchQuantumSeeds(count = PREFETCH_COUNT): Promise<void> {
  if (!API_BASE) return Promise.resolve();
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data } = await axios.get<SeedBatch>(`${API_BASE}/api/quantum/seed`, {
        params: { count },
        timeout: REQUEST_TIMEOUT_MS,
      });
      const seeds = Array.isArray(data?.seeds) ? data.seeds.filter(isUint32) : [];
      if (seeds.length === 0) return;
      const source: SeedSource = data?.source === "qrng" ? "qrng" : "csprng";
      buffer = buffer.concat(seeds);
      bufferSource = source;
    } catch {
      // Offline, backend down, provider down, bad payload — keep the fallback.
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Take the next run seed. Prefers a buffered quantum seed; falls back to the
 * local CSPRNG so a run can always start. Triggers a background refill when low.
 */
export function nextRunSeed(): number {
  if (buffer.length > 0) {
    const seed = buffer.shift()!;
    lastSource = bufferSource;
    if (buffer.length <= LOW_WATER_MARK) void prefetchQuantumSeeds();
    return seed;
  }
  lastSource = "local";
  void prefetchQuantumSeeds();
  return createRunSeed();
}

/** Provenance of the most recently handed-out seed (for the replay digest). */
export function lastSeedSource(): SeedSource {
  return lastSource;
}

/**
 * Provenance the NEXT run would use, without consuming a seed. Buffered seeds
 * carry the source they arrived with; an empty buffer means the local CSPRNG
 * (a refill may still land first, which is why the lobby re-reads this).
 */
export function peekNextSeedSource(): SeedSource {
  return buffer.length > 0 ? bufferSource : "local";
}

/** Test-only: clear buffered state between cases. */
export function resetQuantumSeedCache(): void {
  buffer = [];
  bufferSource = "csprng";
  lastSource = "local";
  inFlight = null;
}
