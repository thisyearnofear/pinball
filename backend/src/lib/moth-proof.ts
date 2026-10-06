/**
 * Independent verifier for MOTH comet-qrng-v1 results.
 *
 * A "quantum-seeded" label is only worth something if a third party can check
 * it without trusting us. Given a job's `/jobs/{id}/result` body, this
 * recomputes every hash the engine exposes and checks they bind together:
 *
 *   seed ∈ derived integers ⊂ output bytes ──sha256──▶ pulse.output_hash
 *   raw Born-rule counts ──sha256(canonical JSON)──▶ pulse.raw_counts_hash
 *   pulse (provenance, commitment, entropy, …) ──sha256(canonical JSON)──▶ pulse_hash
 *   pulse.prev_hash ──▶ previous pulse_hash (beacon chain)
 *
 * The hash constructions were established empirically against live emu and
 * QPU jobs (fixtures in tests/fixtures/moth). The commitment preimage
 * (H(circuit_hash ‖ backend ‖ job_id ‖ salt)) does not match any common
 * encoding, so it is reported as not independently recomputable rather than
 * guessed at. See docs/MOTH_PROOFS.md.
 *
 * Pure and dependency-free (node:crypto only). Never throws on bad input — a
 * malformed body yields failed checks.
 */
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Lossless JSON → Python-compatible canonical JSON
// ---------------------------------------------------------------------------

/** A JSON number kept as its source token, so re-serialising never reformats it. */
export class RawNumber {
  constructor(readonly raw: string) {}
}
export type LosslessJson = null | boolean | string | RawNumber | LosslessJson[] | { [k: string]: LosslessJson };

/**
 * Parse JSON keeping number tokens verbatim. The engine hashes with Python's
 * float repr; JS number formatting differs (e.g. `1e-05` vs `0.00001`), so a
 * round-trip through `JSON.parse` could silently change the hashed bytes.
 */
export function parseLosslessJson(text: string): LosslessJson {
  let i = 0;
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i++;
  };
  const fail = (msg: string): never => {
    throw new SyntaxError(`${msg} at ${i}`);
  };
  const value = (): LosslessJson => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const obj: { [k: string]: LosslessJson } = {};
      ws();
      if (text[i] === '}') { i++; return obj; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('expected key');
        const k = str();
        ws();
        if (text[i++] !== ':') fail('expected :');
        obj[k] = value();
        ws();
        const d = text[i++];
        if (d === '}') return obj;
        if (d !== ',') fail('expected , or }');
      }
    }
    if (c === '[') {
      i++;
      const arr: LosslessJson[] = [];
      ws();
      if (text[i] === ']') { i++; return arr; }
      for (;;) {
        arr.push(value());
        ws();
        const d = text[i++];
        if (d === ']') return arr;
        if (d !== ',') fail('expected , or ]');
      }
    }
    if (c === '"') return str();
    if (text.startsWith('true', i)) { i += 4; return true; }
    if (text.startsWith('false', i)) { i += 5; return false; }
    if (text.startsWith('null', i)) { i += 4; return null; }
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 64));
    if (!m) return fail('unexpected token');
    i += m[0].length;
    return new RawNumber(m[0]);
  };
  const str = (): string => {
    const start = i;
    i++;
    for (;;) {
      const c = text[i];
      if (c === undefined) fail('unterminated string');
      if (c === '\\') i += 2;
      else if (c === '"') { i++; break; }
      else i++;
    }
    return JSON.parse(text.slice(start, i)) as string;
  };
  const out = value();
  ws();
  if (i !== text.length) fail('trailing data');
  return out;
}

const SHORT_ESCAPES: Record<string, string> = {
  '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f',
};

/** Python `json.dumps(ensure_ascii=True)` string escaping. */
function pyString(s: string): string {
  let out = '"';
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    const code = s.charCodeAt(k);
    if (SHORT_ESCAPES[ch]) out += SHORT_ESCAPES[ch];
    else if (code < 0x20 || code > 0x7e) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

/**
 * Canonical form the engine hashes: Python
 * `json.dumps(obj, sort_keys=True, separators=(",", ":"))`.
 */
export function canonicalJson(v: LosslessJson): string {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (v instanceof RawNumber) return v.raw;
  if (typeof v === 'string') return pyString(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  // Python sorts by code point; JS default sort compares UTF-16 units, which
  // only differs for astral-plane keys (none appear in engine output).
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${pyString(k)}:${canonicalJson(v[k])}`).join(',')}}`;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type CheckStatus = 'pass' | 'fail' | 'skip';
export type ProofCheck = { id: string; status: CheckStatus; detail: string };

export type MothClassification = 'hardware' | 'simulator' | 'unknown';

export type MothVerification = {
  /** No check failed (skips are allowed). */
  ok: boolean;
  classification: MothClassification;
  jobId?: string;
  backend?: string;
  pulseHash?: string;
  prevHash?: string;
  /** Index of `seed` in the derived integers, when a seed was supplied and found. */
  seedIndex?: number;
  checks: ProofCheck[];
};

export type VerifyOptions = {
  /** A run seed claimed to come from this job. */
  seed?: number;
  /** Expected `pulse.prev_hash` (the previous pulse in a chain). */
  expectPrevHash?: string;
  jobId?: string;
};

type Obj = { [k: string]: LosslessJson };
const isObj = (v: LosslessJson | undefined): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof RawNumber);
const asStr = (v: LosslessJson | undefined): string | undefined => (typeof v === 'string' ? v : undefined);
const asNum = (v: LosslessJson | undefined): number | undefined =>
  v instanceof RawNumber ? Number(v.raw) : undefined;
const HEX64 = /^[0-9a-f]{64}$/;

export function isSimulatorBackendName(name: string): boolean {
  return /aer|sim|fake|emu/i.test(name);
}

/** Verify a result body (raw JSON text or an already-parsed lossless tree). */
export function verifyMothResult(body: string | LosslessJson, opts: VerifyOptions = {}): MothVerification {
  const checks: ProofCheck[] = [];
  const add = (id: string, status: CheckStatus, detail: string) => checks.push({ id, status, detail });
  const done = (extra: Partial<MothVerification> = {}): MothVerification => ({
    ok: !checks.some((c) => c.status === 'fail'),
    classification: 'unknown',
    ...(opts.jobId ? { jobId: opts.jobId } : {}),
    ...extra,
    checks,
  });

  let root: LosslessJson;
  try {
    root = typeof body === 'string' ? parseLosslessJson(body) : body;
  } catch (e) {
    add('parse', 'fail', `result is not valid JSON (${(e as Error).message})`);
    return done();
  }
  const result = isObj(root) && isObj(root.result) ? root.result : undefined;
  const output = isObj(result?.output) ? (result!.output as Obj) : isObj(root) && isObj(root.output) ? root.output : undefined;
  if (!output) {
    add('shape', 'fail', 'no result.output object');
    return done();
  }
  const pulse = isObj(output.pulse) ? output.pulse : undefined;
  const provenance = isObj(output.provenance) ? output.provenance : undefined;
  const random = isObj(output.random) ? output.random : undefined;
  if (!pulse || !provenance || !random) {
    add('shape', 'fail', `missing ${[!pulse && 'pulse', !provenance && 'provenance', !random && 'random'].filter(Boolean).join(', ')}`);
    return done();
  }

  const pulseHash = asStr(pulse.pulse_hash);
  const prevHash = asStr(pulse.prev_hash);
  const backend = asStr(provenance.backend);
  const meta: Partial<MothVerification> = {
    ...(pulseHash ? { pulseHash } : {}),
    ...(prevHash ? { prevHash } : {}),
    ...(backend ? { backend } : {}),
  };

  // 1. Output bytes → pulse.output_hash
  const hex = asStr(random.hex);
  let bytes: Buffer | undefined;
  if (!hex || !/^([0-9a-f]{2})+$/i.test(hex)) {
    add('output-hash', 'fail', 'random.hex missing or not hex');
  } else {
    bytes = Buffer.from(hex, 'hex');
    const h = sha256Hex(bytes);
    add('output-hash', h === asStr(pulse.output_hash) ? 'pass' : 'fail',
      `sha256(output bytes) = ${h.slice(0, 16)}… vs pulse.output_hash ${String(asStr(pulse.output_hash)).slice(0, 16)}…`);
  }

  // 2. Derived integers are the output bytes (full uint32 range ⇒ no rejection sampling).
  const ints = isObj(random.derived) && isObj(random.derived.integers) ? random.derived.integers : undefined;
  const values = Array.isArray(ints?.values) ? (ints!.values as LosslessJson[]).map(asNum) : undefined;
  const lo = asNum(ints?.min);
  const hi = asNum(ints?.max);
  if (!values || values.some((v) => v === undefined)) {
    add('derived-integers', 'skip', 'no derived integers in the result');
  } else if (lo !== 0 || hi !== 0xffffffff) {
    add('derived-integers', 'skip', `range [${lo}, ${hi}] uses rejection sampling; not recomputed`);
  } else if (!bytes) {
    add('derived-integers', 'fail', 'output bytes unavailable');
  } else {
    const expected: number[] = [];
    for (let k = 0; k + 4 <= bytes.length && expected.length < values.length; k += 4) expected.push(bytes.readUInt32BE(k));
    const same = expected.length === values.length && expected.every((v, k) => v === values[k]);
    add('derived-integers', same ? 'pass' : 'fail',
      same ? `${values.length} integers = big-endian uint32 words of the output bytes` : 'integers do not match the output bytes');
  }

  // 3. The claimed seed is one of them.
  if (opts.seed !== undefined) {
    const idx = values ? values.indexOf(opts.seed) : -1;
    if (idx >= 0) meta.seedIndex = idx;
    add('seed-in-output', idx >= 0 ? 'pass' : 'fail',
      idx >= 0 ? `seed ${opts.seed} is derived integer #${idx}` : `seed ${opts.seed} is not among this job's derived integers`);
  }

  // 4. Raw counts → pulse.raw_counts_hash
  const raw = isObj(output.raw) ? output.raw : undefined;
  if (!raw || !isObj(raw.counts)) {
    add('raw-counts-hash', 'skip', 'raw counts not included (include_raw_counts=false)');
  } else {
    const h = sha256Hex(canonicalJson(raw.counts));
    const okPulse = h === asStr(pulse.raw_counts_hash);
    const okEcho = asStr(raw.counts_sha256) === undefined || h === asStr(raw.counts_sha256);
    add('raw-counts-hash', okPulse && okEcho ? 'pass' : 'fail',
      `sha256(canonical counts) ${okPulse ? 'matches' : 'does not match'} pulse.raw_counts_hash`);
  }

  // 5. Pulse hash over everything else in the pulse.
  if (!pulseHash || !HEX64.test(pulseHash)) {
    add('pulse-hash', 'fail', 'pulse.pulse_hash missing or malformed');
  } else {
    const { pulse_hash: _omit, ...rest } = pulse;
    const h = sha256Hex(canonicalJson(rest));
    add('pulse-hash', h === pulseHash ? 'pass' : 'fail',
      h === pulseHash ? 'sha256(canonical pulse) = pulse_hash' : `recomputed ${h.slice(0, 16)}… ≠ ${pulseHash.slice(0, 16)}…`);
  }

  // 6. The hashed pulse is the same record the result reports.
  const commitment = isObj(output.commitment) ? output.commitment : undefined;
  const pc = isObj(pulse.commitment) ? pulse.commitment : undefined;
  const provSame = isObj(pulse.provenance) && canonicalJson(pulse.provenance) === canonicalJson(provenance);
  const commitSame = !!commitment && !!pc && asStr(pc.commit) === asStr(commitment.commit) && asStr(pc.salt) === asStr(commitment.salt);
  add('pulse-binds-result', provSame && commitSame ? 'pass' : 'fail',
    `pulse provenance ${provSame ? '=' : '≠'} result provenance; pulse commitment ${commitSame ? '=' : '≠'} result commitment`);

  // 7. Beacon chain link.
  if (opts.expectPrevHash !== undefined) {
    add('chain', prevHash === opts.expectPrevHash ? 'pass' : 'fail',
      prevHash === opts.expectPrevHash ? 'prev_hash links to the expected pulse' : `prev_hash ${prevHash} ≠ expected ${opts.expectPrevHash}`);
  } else {
    add('chain', 'skip', prevHash && /^0+$/.test(prevHash) ? 'genesis pulse (prev_hash = 0…0)' : `prev_hash ${prevHash ?? 'absent'} (no expected link given)`);
  }

  // 8. Commitment was formed before the outcome existed (engine timestamps).
  const committedAt = asStr(provenance.committed_at);
  const outcomeAt = asStr(provenance.collected_at) ?? asStr(provenance.formatted_at);
  if (!commitment || !asStr(commitment.commit)) {
    add('commitment', 'fail', 'no commitment');
  } else if (committedAt && outcomeAt) {
    const before = Date.parse(committedAt) <= Date.parse(outcomeAt);
    add('commitment', before ? 'pass' : 'fail',
      `committed ${committedAt} ${before ? '≤' : '>'} outcome ${outcomeAt} (engine-reported; preimage encoding unpublished, not recomputed)`);
  } else {
    add('commitment', 'skip', 'commitment present; timestamps missing');
  }

  // 9. Entropy health.
  const report = isObj(output.entropy_report) ? output.entropy_report : undefined;
  const health = report?.health_passed;
  add('entropy-health', health === true ? 'pass' : health === false ? 'fail' : 'skip',
    health === true ? `health tests passed (grade ${asStr(report?.grade) ?? '?'})` : health === false ? 'entropy health tests FAILED' : 'no entropy report');

  // Classification: hardware only when mode, backend and grade all agree.
  const mode = asStr(provenance.mode);
  const grade = asStr(report?.grade);
  let classification: MothClassification = 'unknown';
  if (mode === 'qpu' && backend && !isSimulatorBackendName(backend) && grade?.startsWith('hardware')) classification = 'hardware';
  else if (mode === 'emu' || (backend && isSimulatorBackendName(backend)) || grade === 'simulator-baseline') classification = 'simulator';

  const bell = isObj(output.bell_witness) ? output.bell_witness : undefined;
  const S = asNum(bell?.S);
  add('bell-witness', 'skip',
    bell ? `CHSH S = ${S?.toFixed(3)}; violates classical bound at 3σ: ${String(bell.violates_classical_3sigma)} (fidelity witness, informational)` : 'not run');

  return done({ ...meta, classification });
}

/** Check that a sequence of pulses forms an unbroken chain (each prev_hash = previous pulse_hash). */
export function verifyPulseChain(results: MothVerification[]): ProofCheck[] {
  const out: ProofCheck[] = [];
  for (let k = 1; k < results.length; k++) {
    const prev = results[k - 1].pulseHash;
    const link = results[k].prevHash;
    out.push({
      id: `chain[${k - 1}→${k}]`,
      status: prev && link === prev ? 'pass' : 'fail',
      detail: prev && link === prev ? `pulse ${k} links to pulse ${k - 1}` : `pulse ${k} prev_hash ${link} ≠ ${prev}`,
    });
  }
  return out;
}
