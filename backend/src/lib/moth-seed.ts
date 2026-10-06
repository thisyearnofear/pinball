/**
 * MOTH comet-qrng-v1 seed provider.
 *
 * comet-qrng-v1 is an async randomness beacon: POST a job, poll its status,
 * then read the result, which carries the conditioned output plus a beacon
 * pulse (hash chain), a pre-outcome commitment, a CHSH Bell witness, an entropy
 * report and provenance. We ask it to derive uint32 integers directly, so the
 * values ARE run seeds — no combining.
 *
 * Latency is the design constraint: an emu job takes seconds, a qpu job queues
 * on IBM hardware for minutes. So the request path never waits on a job —
 * `MothSeedPool` holds seeds from finished jobs and refills in the background,
 * and an empty pool degrades to CSPRNG (see fetchQuantumSeeds).
 *
 * Contract: nothing here throws. Every failure (no key, HTTP error, timeout,
 * job failure, malformed or short result) resolves to `null` / an empty take.
 *
 * Labelling: `mode: "emu"` runs on the Aer simulator — classical output, NOT
 * hardware-quantum. The attestation records the mode/backend the RESULT reports,
 * not the mode we asked for, so a seed is only labelled `moth-qpu` when the
 * result itself says it came off a non-simulator device.
 */

export const MOTH_DEFAULT_BASE_URL = 'https://api.mothquantum.com/api/v1';
export const MOTH_ENGINE_ID = 'comet-qrng-v1';

export type MothMode = 'emu' | 'qpu';

/** Public, per-job provenance carried alongside the seeds it produced. */
export type MothAttestation = {
  provider: 'moth';
  engine: typeof MOTH_ENGINE_ID;
  /** Mode the result reports it ran in (`emu` = Aer simulator). */
  mode: MothMode;
  jobId: string;
  /** Beacon pulse hash (hex) — chains via `prev_hash` into the beacon. */
  pulseHash?: string;
  /** Device that produced the outcomes (`aer` for emu, an IBM device for qpu). */
  backend?: string;
  /** CHSH witness `violates_classical_3sigma`; absent when the witness was off. */
  bellViolation?: boolean;
};

export type MothSeedChunk = { seeds: number[]; attestation: MothAttestation };

const UINT32_MAX = 0xffffffff;
const HEX64 = /^[0-9a-f]{64}$/i;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function isUint32(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= UINT32_MAX;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** True when a backend name is a simulator rather than quantum hardware. */
export function isSimulatorBackend(name: string | undefined): boolean {
  return !name || /aer|sim|emu|fake/i.test(name);
}

/**
 * Normalise a `GET /jobs/{id}/result` body into seeds + attestation. Pure.
 * Returns null unless at least one valid uint32 was derived.
 */
export function normalizeMothResult(body: unknown, jobId: string): MothSeedChunk | null {
  const output = asRecord(asRecord(asRecord(body)?.result)?.output);
  if (!output) return null;

  const integers = asRecord(asRecord(asRecord(output.random)?.derived)?.integers);
  const values = Array.isArray(integers?.values) ? integers!.values : [];
  const seeds = values.filter(isUint32);
  if (seeds.length === 0) return null;

  const provenance = asRecord(output.provenance);
  const pulse = asRecord(output.pulse);
  const witness = asRecord(output.bell_witness);

  const backend = typeof provenance?.backend === 'string' && SAFE_ID.test(provenance.backend)
    ? provenance.backend
    : undefined;
  // Hardware only when the result itself says qpu AND names a non-simulator
  // device. Anything ambiguous is labelled the simulator.
  const mode: MothMode = provenance?.mode === 'qpu' && !isSimulatorBackend(backend) ? 'qpu' : 'emu';

  const pulseHash = typeof pulse?.pulse_hash === 'string' && HEX64.test(pulse.pulse_hash)
    ? pulse.pulse_hash.toLowerCase()
    : undefined;
  const bellViolation = witness?.enabled !== false && typeof witness?.violates_classical_3sigma === 'boolean'
    ? witness.violates_classical_3sigma
    : undefined;

  return {
    seeds,
    attestation: {
      provider: 'moth',
      engine: MOTH_ENGINE_ID,
      mode,
      jobId,
      ...(pulseHash ? { pulseHash } : {}),
      ...(backend ? { backend } : {}),
      ...(bellViolation !== undefined ? { bellViolation } : {}),
    },
  };
}

export type MothJobOptions = {
  apiKey?: string;
  mode?: MothMode;
  baseUrl?: string;
  /** Integers to ask for. MOTH returns min(requested, extractable). */
  count?: number;
  shots?: number;
  /** qpu only: pin an IBM device (MOTH `backend_name`) instead of least-busy. */
  backendName?: string;
  /** Overall budget for submit + polling + result. */
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Per-HTTP-request timeout. */
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const TERMINAL_FAILURE = new Set(['failed', 'error', 'cancelled', 'canceled']);

export const MOTH_DEFAULTS = {
  count: 32,
  // Emu yields ~1200 extractable bits at 12 qubits/4096 shots — enough for 32
  // uint32s. On real hardware the ordering penalty grows super-linearly in
  // shots: 4096 collapsed the budget to ~45 bits and derived zero integers;
  // 1024 budgeted ~415 bits (docs/TRAPS.md #12).
  shots: { emu: 4096, qpu: 1024 } as Record<MothMode, number>,
  timeoutMs: { emu: 60_000, qpu: 30 * 60_000 } as Record<MothMode, number>,
  pollIntervalMs: { emu: 2_000, qpu: 15_000 } as Record<MothMode, number>,
  requestTimeoutMs: 10_000,
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run one comet-qrng-v1 job end to end. Never throws; null on any failure.
 * The key is only ever sent as a bearer header — never logged or returned.
 */
export async function runMothSeedJob(opts: MothJobOptions = {}): Promise<MothSeedChunk | null> {
  const apiKey = opts.apiKey;
  if (!apiKey) return null;

  const mode: MothMode = opts.mode === 'qpu' ? 'qpu' : 'emu';
  const base = (opts.baseUrl ?? MOTH_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const count = Math.max(1, Math.min(1024, Math.floor(opts.count ?? MOTH_DEFAULTS.count)));
  const shots = Math.max(1, Math.min(10_000, Math.floor(opts.shots ?? MOTH_DEFAULTS.shots[mode])));
  const timeoutMs = opts.timeoutMs ?? MOTH_DEFAULTS.timeoutMs[mode];
  const pollMs = opts.pollIntervalMs ?? MOTH_DEFAULTS.pollIntervalMs[mode];
  const requestTimeoutMs = opts.requestTimeoutMs ?? MOTH_DEFAULTS.requestTimeoutMs;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const deadline = now() + timeoutMs;

  const headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
  const call = async (path: string, init: RequestInit = {}): Promise<unknown | null> => {
    const remaining = deadline - now();
    if (remaining <= 0) return null;
    const res = await doFetch(`${base}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remaining)),
    });
    if (!res.ok) return null;
    return res.json();
  };

  try {
    const submitted = asRecord(await call(`/engines/${MOTH_ENGINE_ID}/process`, {
      method: 'POST',
      body: JSON.stringify({
        mode,
        params: {
          shots,
          output_bytes: count * 4,
          include_raw_counts: false,
          derive: { integers: { min: 0, max: UINT32_MAX, count } },
          ...(mode === 'qpu' && opts.backendName && SAFE_ID.test(opts.backendName) ? { backend_name: opts.backendName } : {}),
        },
      }),
    }));
    const jobId = submitted?.job_id;
    if (typeof jobId !== 'string' || !SAFE_ID.test(jobId)) return null;
    const jobPath = `/jobs/${encodeURIComponent(jobId)}`;

    for (;;) {
      const status = asRecord(await call(`${jobPath}/status`))?.status;
      if (status === 'completed') break;
      if (typeof status === 'string' && TERMINAL_FAILURE.has(status)) return null;
      // Unknown/transient status (queued, processing, a non-ok poll): keep
      // polling until the deadline.
      if (deadline - now() <= pollMs) return null;
      await sleep(pollMs);
    }

    return normalizeMothResult(await call(`${jobPath}/result`), jobId);
  } catch {
    // Network error, abort/timeout, non-JSON body.
    return null;
  }
}

export type MothSeedPoolOptions = MothJobOptions & {
  /** Refill when fewer than this many seeds remain (default: one job's worth / 2). */
  lowWater?: number;
  /** After a failed job, wait this long before trying again (default 60s). */
  failureCooldownMs?: number;
  /** Cap on buffered jobs so a bursty refill cannot hoard seeds. */
  maxChunks?: number;
};

/**
 * Seeds from finished MOTH jobs, served once each. `take` is synchronous and
 * never waits on the network; `refill` runs at most one job at a time and
 * never rejects.
 */
export class MothSeedPool {
  private chunks: MothSeedChunk[] = [];
  private inFlight: Promise<void> | null = null;
  private lastFailureAt = Number.NEGATIVE_INFINITY;
  private readonly opts: MothSeedPoolOptions;

  constructor(opts: MothSeedPoolOptions) {
    this.opts = opts;
  }

  get configured(): boolean {
    return Boolean(this.opts.apiKey);
  }

  get size(): number {
    return this.chunks.reduce((n, c) => n + c.seeds.length, 0);
  }

  /**
   * Take exactly `n` seeds from a single job (one attestation per batch), or
   * null when no buffered job has enough. Kicks a background refill when low.
   */
  take(n: number): MothSeedChunk | null {
    const idx = this.chunks.findIndex((c) => c.seeds.length >= n);
    let out: MothSeedChunk | null = null;
    if (idx >= 0) {
      const chunk = this.chunks[idx];
      out = { seeds: chunk.seeds.splice(0, n), attestation: chunk.attestation };
      if (chunk.seeds.length === 0) this.chunks.splice(idx, 1);
    }
    const lowWater = this.opts.lowWater ?? Math.ceil((this.opts.count ?? MOTH_DEFAULTS.count) / 2);
    if (this.size < Math.max(lowWater, n)) void this.refill();
    return out;
  }

  refill(): Promise<void> {
    if (!this.configured) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    const now = this.opts.now ?? Date.now;
    if (now() - this.lastFailureAt < (this.opts.failureCooldownMs ?? 60_000)) return Promise.resolve();

    this.inFlight = (async () => {
      try {
        const chunk = await runMothSeedJob(this.opts);
        if (chunk) {
          this.chunks.push(chunk);
          const max = this.opts.maxChunks ?? 4;
          if (this.chunks.length > max) this.chunks.splice(0, this.chunks.length - max);
        } else {
          this.lastFailureAt = now();
        }
      } catch {
        this.lastFailureAt = now();
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }
}
