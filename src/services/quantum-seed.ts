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
import { sanitizeSeedAttestation, type SeedAttestation, type SeedSource } from "@/utils/seed-provenance";

export type { SeedSource, SeedAttestation };

export type SeedBatch = { seeds: number[]; source: SeedSource; attestation?: SeedAttestation };

/** Each buffered seed keeps the provenance of the batch it arrived in. */
type BufferedSeed = { seed: number; source: SeedSource; attestation?: SeedAttestation };

const BACKEND_SOURCES: ReadonlySet<string> = new Set(["qrng", "moth-qpu", "moth-emu", "csprng"]);

const PREFETCH_COUNT = 8;
/** Refill when the buffer drops to this level. */
const LOW_WATER_MARK = 2;
const REQUEST_TIMEOUT_MS = 2500;

let buffer: BufferedSeed[] = [];
let lastSource: SeedSource = "local";
let lastAttestation: SeedAttestation | undefined;
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
      // Unknown labels collapse to csprng: never claim more than the backend said.
      const source = (BACKEND_SOURCES.has(data?.source) ? data.source : "csprng") as SeedSource;
      // Attestations only ride with MOTH batches.
      const attestation = source.startsWith("moth-") ? sanitizeSeedAttestation(data?.attestation) : undefined;
      buffer = buffer.concat(seeds.map((seed) => ({ seed, source, ...(attestation ? { attestation } : {}) })));
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
    const next = buffer.shift()!;
    lastSource = next.source;
    lastAttestation = next.attestation;
    if (buffer.length <= LOW_WATER_MARK) void prefetchQuantumSeeds();
    return next.seed;
  }
  lastSource = "local";
  lastAttestation = undefined;
  void prefetchQuantumSeeds();
  return createRunSeed();
}

/** Provenance of the most recently handed-out seed (for the replay digest). */
export function lastSeedSource(): SeedSource {
  return lastSource;
}

/** MOTH job/pulse provenance of the most recently handed-out seed, if any. */
export function lastSeedAttestation(): SeedAttestation | undefined {
  return lastAttestation;
}

/**
 * Provenance the NEXT run would use, without consuming a seed. Buffered seeds
 * carry the source they arrived with; an empty buffer means the local CSPRNG
 * (a refill may still land first, which is why the lobby re-reads this).
 */
export function peekNextSeedSource(): SeedSource {
  return buffer.length > 0 ? buffer[0].source : "local";
}

/** Test-only: clear buffered state between cases. */
export function resetQuantumSeedCache(): void {
  buffer = [];
  lastSource = "local";
  lastAttestation = undefined;
  inFlight = null;
}
