import { describe, it, expect, vi } from 'vitest';
import {
  MothSeedPool,
  normalizeMothResult,
  runMothSeedJob,
  isSimulatorBackend,
  MOTH_ENGINE_ID,
} from '../src/lib/moth-seed.js';
import { fetchQuantumSeeds, resolveSeedProvider } from '../src/lib/quantum-seed.js';

const KEY = 'test-key-not-real';
const PULSE = 'ab'.repeat(32);

/** Shape of a real comet-qrng-v1 result (trimmed to the fields we read). */
function resultBody(opts: {
  values?: unknown;
  mode?: string;
  backend?: string;
  pulseHash?: unknown;
  violates?: unknown;
  witnessEnabled?: boolean;
} = {}) {
  return {
    $schema: 'https://api.mothquantum.com/schemas/JobResultOutputBody.json',
    result: {
      output: {
        random: { bytes: 32, derived: { integers: { min: 0, max: 4294967295, requested: 8, values: opts.values ?? [1, 2, 3, 4, 5, 6, 7, 8] } } },
        provenance: { backend: opts.backend ?? 'aer', mode: opts.mode ?? 'emu', provider_job_id: 'p1', shots: 4096 },
        pulse: { pulse_hash: opts.pulseHash ?? PULSE, prev_hash: '0'.repeat(64), output_hash: 'cd'.repeat(32) },
        bell_witness: { enabled: opts.witnessEnabled ?? true, S: 2.84, violates_classical_3sigma: opts.violates ?? true },
      },
    },
  };
}

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

/**
 * A scripted MOTH API: POST -> 202 job, `statuses` returned by successive
 * polls, then `result` from /result. Records every call.
 */
function mothApi(opts: {
  submit?: () => Response;
  statuses?: string[];
  result?: () => Response;
} = {}) {
  const statuses = [...(opts.statuses ?? ['completed'])];
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith(`/engines/${MOTH_ENGINE_ID}/process`)) {
      return opts.submit ? opts.submit() : json({ job_id: 'job-123', status: 'queued' }, 202);
    }
    if (u.endsWith('/status')) {
      const s = statuses.length > 1 ? statuses.shift()! : statuses[0];
      return json({ job_id: 'job-123', status: s });
    }
    if (u.endsWith('/result')) return opts.result ? opts.result() : json(resultBody());
    return json({}, 404);
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const noSleep = async () => {};

describe('normalizeMothResult', () => {
  it('reads derived uint32 integers as seeds and keeps the job provenance', () => {
    const chunk = normalizeMothResult(resultBody(), 'job-1');
    expect(chunk?.seeds).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(chunk?.attestation).toEqual({
      provider: 'moth',
      engine: MOTH_ENGINE_ID,
      mode: 'emu',
      jobId: 'job-1',
      pulseHash: PULSE,
      backend: 'aer',
      bellViolation: true,
    });
  });

  it('labels hardware only when the result reports qpu on a real device', () => {
    expect(normalizeMothResult(resultBody({ mode: 'qpu', backend: 'ibm_torino' }), 'j')?.attestation.mode).toBe('qpu');
    // Asked for qpu but the result says it ran on the simulator: stays emu.
    expect(normalizeMothResult(resultBody({ mode: 'qpu', backend: 'aer' }), 'j')?.attestation.mode).toBe('emu');
    expect(normalizeMothResult(resultBody({ mode: 'emu', backend: 'ibm_torino' }), 'j')?.attestation.mode).toBe('emu');
    expect(isSimulatorBackend(undefined)).toBe(true);
    expect(isSimulatorBackend('aer_simulator')).toBe(true);
    expect(isSimulatorBackend('ibm_kyiv')).toBe(false);
  });

  it('drops non-uint32 values', () => {
    const chunk = normalizeMothResult(resultBody({ values: [5, -1, 2 ** 32, 1.5, 'x', 4294967295] }), 'j');
    expect(chunk?.seeds).toEqual([5, 4294967295]);
  });

  it('omits malformed provenance fields rather than passing them through', () => {
    const chunk = normalizeMothResult(resultBody({ pulseHash: 'not-a-hash', violates: 'yes', backend: '<script>' }), 'j');
    expect(chunk?.attestation.pulseHash).toBeUndefined();
    expect(chunk?.attestation.bellViolation).toBeUndefined();
    expect(chunk?.attestation.backend).toBeUndefined();
    const off = normalizeMothResult(resultBody({ witnessEnabled: false, violates: false }), 'j');
    expect(off?.attestation.bellViolation).toBeUndefined();
  });

  it('returns null for malformed or empty results', () => {
    expect(normalizeMothResult(undefined, 'j')).toBeNull();
    expect(normalizeMothResult({ result: {} }, 'j')).toBeNull();
    expect(normalizeMothResult({ result: { output: { random: { derived: { integers: { values: 'nope' } } } } } }, 'j')).toBeNull();
    expect(normalizeMothResult(resultBody({ values: [] }), 'j')).toBeNull();
    expect(normalizeMothResult(resultBody({ values: [-1, 'x'] }), 'j')).toBeNull();
  });
});

describe('runMothSeedJob', () => {
  it('posts the job, polls status until completed, then reads the result', async () => {
    const api = mothApi({ statuses: ['queued', 'processing', 'completed'] });
    const sleep = vi.fn(noSleep);
    const chunk = await runMothSeedJob({ apiKey: KEY, fetchImpl: api.fetchImpl, sleep, count: 8, shots: 1024 });

    expect(chunk?.seeds).toHaveLength(8);
    expect(chunk?.attestation.jobId).toBe('job-123');
    expect(sleep).toHaveBeenCalledTimes(2);

    const [submit, ...rest] = api.calls;
    expect(submit.url).toBe(`https://api.mothquantum.com/api/v1/engines/${MOTH_ENGINE_ID}/process`);
    expect(submit.init?.method).toBe('POST');
    expect((submit.init?.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(submit.init?.body))).toEqual({
      mode: 'emu',
      params: {
        shots: 1024,
        output_bytes: 32,
        include_raw_counts: false,
        derive: { integers: { min: 0, max: 4294967295, count: 8 } },
      },
    });
    expect(rest.map((c) => c.url.split('/v1')[1])).toEqual([
      '/jobs/job-123/status',
      '/jobs/job-123/status',
      '/jobs/job-123/status',
      '/jobs/job-123/result',
    ]);
  });

  it('defaults to emu and only sends qpu when asked', async () => {
    const emu = mothApi();
    await runMothSeedJob({ apiKey: KEY, fetchImpl: emu.fetchImpl, sleep: noSleep });
    expect(JSON.parse(String(emu.calls[0].init?.body)).mode).toBe('emu');

    const qpu = mothApi();
    await runMothSeedJob({ apiKey: KEY, mode: 'qpu', fetchImpl: qpu.fetchImpl, sleep: noSleep });
    expect(JSON.parse(String(qpu.calls[0].init?.body)).mode).toBe('qpu');
  });

  it('pins backend_name only for qpu jobs with a safe device name', async () => {
    const pinned = mothApi();
    await runMothSeedJob({ apiKey: KEY, mode: 'qpu', backendName: 'ibm_boston', fetchImpl: pinned.fetchImpl, sleep: noSleep });
    expect(JSON.parse(String(pinned.calls[0].init?.body)).params.backend_name).toBe('ibm_boston');

    const emu = mothApi();
    await runMothSeedJob({ apiKey: KEY, backendName: 'ibm_boston', fetchImpl: emu.fetchImpl, sleep: noSleep });
    expect(JSON.parse(String(emu.calls[0].init?.body)).params.backend_name).toBeUndefined();

    const unsafe = mothApi();
    await runMothSeedJob({ apiKey: KEY, mode: 'qpu', backendName: 'ibm boston"; x', fetchImpl: unsafe.fetchImpl, sleep: noSleep });
    expect(JSON.parse(String(unsafe.calls[0].init?.body)).params.backend_name).toBeUndefined();
  });

  it('returns null without a key and never calls the API', async () => {
    const api = mothApi();
    expect(await runMothSeedJob({ fetchImpl: api.fetchImpl })).toBeNull();
    expect(await runMothSeedJob({ apiKey: '', fetchImpl: api.fetchImpl })).toBeNull();
    expect(api.fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null on HTTP errors at each step', async () => {
    const submitFails = mothApi({ submit: () => json({ detail: 'unauthorized' }, 401) });
    expect(await runMothSeedJob({ apiKey: KEY, fetchImpl: submitFails.fetchImpl, sleep: noSleep })).toBeNull();

    const noJobId = mothApi({ submit: () => json({ status: 'queued' }, 202) });
    expect(await runMothSeedJob({ apiKey: KEY, fetchImpl: noJobId.fetchImpl, sleep: noSleep })).toBeNull();

    const resultFails = mothApi({ result: () => json({ detail: 'job failed and produced no result' }, 409) });
    expect(await runMothSeedJob({ apiKey: KEY, fetchImpl: resultFails.fetchImpl, sleep: noSleep })).toBeNull();
  });

  it('returns null when the job fails or errors', async () => {
    for (const status of ['failed', 'error', 'cancelled']) {
      const api = mothApi({ statuses: ['queued', status] });
      expect(await runMothSeedJob({ apiKey: KEY, fetchImpl: api.fetchImpl, sleep: noSleep })).toBeNull();
      expect(api.calls.some((c) => c.url.endsWith('/result'))).toBe(false);
    }
  });

  it('gives up at the deadline instead of polling forever', async () => {
    let t = 0;
    const api = mothApi({ statuses: ['queued'] });
    const sleep = vi.fn(async (ms: number) => { t += ms; });
    const chunk = await runMothSeedJob({
      apiKey: KEY,
      fetchImpl: api.fetchImpl,
      sleep,
      now: () => t,
      timeoutMs: 10_000,
      pollIntervalMs: 1_000,
    });
    expect(chunk).toBeNull();
    expect(t).toBeLessThanOrEqual(10_000);
    expect(sleep.mock.calls.length).toBeGreaterThan(0);
    expect(api.calls.some((c) => c.url.endsWith('/result'))).toBe(false);
  });

  it('returns null when fetch throws (abort / DNS) or the body is not JSON', async () => {
    const throws = vi.fn(async () => { throw new Error('aborted'); }) as unknown as typeof fetch;
    expect(await runMothSeedJob({ apiKey: KEY, fetchImpl: throws, sleep: noSleep })).toBeNull();

    const badJson = vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } })) as unknown as typeof fetch;
    expect(await runMothSeedJob({ apiKey: KEY, fetchImpl: badJson, sleep: noSleep })).toBeNull();
  });

  it('returns null for a completed job with a malformed result', async () => {
    const api = mothApi({ result: () => json({ result: { output: { random: {} } } }) });
    expect(await runMothSeedJob({ apiKey: KEY, fetchImpl: api.fetchImpl, sleep: noSleep })).toBeNull();
  });
});

describe('MothSeedPool', () => {
  function pool(values: number[], extra: Partial<ConstructorParameters<typeof MothSeedPool>[0]> = {}) {
    const api = mothApi({ result: () => json(resultBody({ values })) });
    return { api, pool: new MothSeedPool({ apiKey: KEY, fetchImpl: api.fetchImpl, sleep: noSleep, ...extra }) };
  }

  it('serves each seed once, from a single job per batch', async () => {
    const { pool: p } = pool([1, 2, 3, 4, 5, 6]);
    await p.refill();
    expect(p.size).toBe(6);
    const a = p.take(4);
    expect(a?.seeds).toEqual([1, 2, 3, 4]);
    expect(a?.attestation.jobId).toBe('job-123');
    // Only 2 left in that job: not enough for a batch of 4.
    expect(p.take(4)).toBeNull();
    expect(p.take(2)?.seeds).toEqual([5, 6]);
  });

  it('take() is synchronous on an empty pool and starts a background refill', async () => {
    const { pool: p, api } = pool([9, 8, 7, 6]);
    expect(p.take(2)).toBeNull();
    expect(api.fetchImpl).toHaveBeenCalled();
    await p.refill();
    expect(p.take(2)?.seeds).toEqual([9, 8]);
  });

  it('runs one job at a time', async () => {
    const { pool: p, api } = pool([1, 2]);
    await Promise.all([p.refill(), p.refill(), p.refill()]);
    expect(api.calls.filter((c) => c.url.endsWith('/process'))).toHaveLength(1);
  });

  it('is inert without a key', async () => {
    const api = mothApi();
    const p = new MothSeedPool({ fetchImpl: api.fetchImpl });
    await p.refill();
    expect(p.take(1)).toBeNull();
    expect(api.fetchImpl).not.toHaveBeenCalled();
  });

  it('backs off after a failed job instead of hammering the API', async () => {
    let t = 0;
    const api = mothApi({ submit: () => json({}, 500) });
    const p = new MothSeedPool({ apiKey: KEY, fetchImpl: api.fetchImpl, sleep: noSleep, now: () => t, failureCooldownMs: 1_000 });
    await p.refill();
    await p.refill();
    expect(api.calls.filter((c) => c.url.endsWith('/process'))).toHaveLength(1);
    t = 1_001;
    await p.refill();
    expect(api.calls.filter((c) => c.url.endsWith('/process'))).toHaveLength(2);
  });
});

describe('fetchQuantumSeeds with the moth provider', () => {
  const fakeRandom = (fill = 0xab) => (size: number) => Buffer.alloc(size, fill);

  it('serves pooled MOTH seeds with an honest simulator label + attestation', async () => {
    const api = mothApi({ result: () => json(resultBody({ values: [11, 22, 33, 44] })) });
    const mothPool = new MothSeedPool({ apiKey: KEY, fetchImpl: api.fetchImpl, sleep: noSleep });
    await mothPool.refill();
    const batch = await fetchQuantumSeeds(2, { provider: 'moth', mothPool });
    expect(batch.source).toBe('moth-emu');
    expect(batch.seeds).toEqual([11, 22]);
    expect(batch.attestation?.jobId).toBe('job-123');
    expect(batch.attestation?.pulseHash).toBe(PULSE);
  });

  it('labels hardware-sourced batches moth-qpu', async () => {
    const api = mothApi({ result: () => json(resultBody({ mode: 'qpu', backend: 'ibm_torino' })) });
    const mothPool = new MothSeedPool({ apiKey: KEY, mode: 'qpu', fetchImpl: api.fetchImpl, sleep: noSleep });
    await mothPool.refill();
    const batch = await fetchQuantumSeeds(8, { provider: 'moth', mothPool });
    expect(batch.source).toBe('moth-qpu');
    expect(batch.attestation?.backend).toBe('ibm_torino');
  });

  it('degrades to CSPRNG (never under-delivers) when the pool is empty or short', async () => {
    const api = mothApi({ result: () => json(resultBody({ values: [1, 2] })) });
    const mothPool = new MothSeedPool({ apiKey: KEY, fetchImpl: api.fetchImpl, sleep: noSleep });
    const cold = await fetchQuantumSeeds(4, { provider: 'moth', mothPool, randomBytesImpl: fakeRandom(0x0c) });
    expect(cold.source).toBe('csprng');
    expect(cold.seeds).toHaveLength(4);
    expect(cold.attestation).toBeUndefined();

    await mothPool.refill();
    // Job only yielded 2 integers (MOTH returns min(requested, extractable)).
    const short = await fetchQuantumSeeds(4, { provider: 'moth', mothPool, randomBytesImpl: fakeRandom(0x0d) });
    expect(short.source).toBe('csprng');
    expect(short.seeds).toEqual([0x0d0d0d0d, 0x0d0d0d0d, 0x0d0d0d0d, 0x0d0d0d0d]);
  });

  it('degrades to CSPRNG with no key', async () => {
    const batch = await fetchQuantumSeeds(3, { provider: 'moth', mothPool: new MothSeedPool({}), randomBytesImpl: fakeRandom(0x01) });
    expect(batch.source).toBe('csprng');
    expect(batch.seeds).toHaveLength(3);
  });

  it('degrades to CSPRNG if the pool itself throws', async () => {
    const broken = { take: () => { throw new Error('boom'); } } as unknown as MothSeedPool;
    const batch = await fetchQuantumSeeds(2, { provider: 'moth', mothPool: broken, randomBytesImpl: fakeRandom(0x02) });
    expect(batch.source).toBe('csprng');
    expect(batch.seeds).toHaveLength(2);
  });

  it('resolves the provider from config, defaulting to the anu path', () => {
    expect(resolveSeedProvider(undefined)).toBe('anu');
    expect(resolveSeedProvider('')).toBe('anu');
    expect(resolveSeedProvider('anu')).toBe('anu');
    expect(resolveSeedProvider(' MOTH ')).toBe('moth');
  });
});
