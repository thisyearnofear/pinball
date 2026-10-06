import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  canonicalJson,
  parseLosslessJson,
  RawNumber,
  verifyMothResult,
  verifyPulseChain,
  type MothVerification,
} from '../src/lib/moth-proof.js';

/** Live results (emu job b7bfe686…, QPU job 0a276b9f… on ibm_fez), minus unread bulk fields. */
const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/moth/${name}`, import.meta.url)), 'utf8');
const EMU = fixture('emu-b7bfe686.json');
const QPU = fixture('qpu-0a276b9f.json');
/** QPU job 6eba1659… on ibm_marrakesh, submitted with prev_pulse_hash = QPU's pulse_hash. */
const QPU_CHAINED = fixture('qpu-6eba1659-chained.json');

/** Edit a fixture via plain JSON (safe for the fields touched here) and re-serialise. */
function mutate(text: string, edit: (output: any) => void): string {
  const d = JSON.parse(text);
  edit(d.result.output);
  return JSON.stringify(d);
}
const status = (v: MothVerification, id: string) => v.checks.find((c) => c.id === id)?.status;

describe('canonicalJson', () => {
  it('matches Python json.dumps(sort_keys=True, separators=(",", ":"))', () => {
    const v = parseLosslessJson('{"b": [1, 2.50, -3e-05], "a": {"y": null, "x": true}, "é": "q\\"\\n\\u0001ü"}');
    expect(canonicalJson(v)).toBe('{"a":{"x":true,"y":null},"b":[1,2.50,-3e-05],"\\u00e9":"q\\"\\n\\u0001\\u00fc"}');
  });

  it('keeps number tokens verbatim instead of reformatting through JS numbers', () => {
    const v = parseLosslessJson('[1e-05, 0.1000000000000000055511151231257827]') as RawNumber[];
    expect(v.map((n) => n.raw)).toEqual(['1e-05', '0.1000000000000000055511151231257827']);
  });

  it('rejects malformed JSON', () => {
    for (const bad of ['{', '[1,]', '{"a" 1}', '1 2', 'nope']) expect(() => parseLosslessJson(bad)).toThrow(SyntaxError);
  });
});

describe('verifyMothResult on live fixtures', () => {
  it('verifies the QPU job end to end and classifies it as hardware', () => {
    const v = verifyMothResult(QPU, { seed: 3125313286 });
    expect(v.ok).toBe(true);
    expect(v.classification).toBe('hardware');
    expect(v.backend).toBe('ibm_fez');
    expect(v.seedIndex).toBe(0);
    for (const id of ['output-hash', 'derived-integers', 'seed-in-output', 'raw-counts-hash', 'pulse-hash', 'pulse-binds-result', 'commitment', 'entropy-health']) {
      expect(status(v, id), id).toBe('pass');
    }
  });

  it('verifies the emu job but classifies it as simulator, never hardware', () => {
    const v = verifyMothResult(EMU);
    expect(v.ok).toBe(true);
    expect(v.classification).toBe('simulator');
    expect(status(v, 'pulse-hash')).toBe('pass');
    expect(status(v, 'raw-counts-hash')).toBe('pass');
  });

  it('reports genesis pulses and checks an expected chain link', () => {
    expect(verifyMothResult(QPU).checks.find((c) => c.id === 'chain')?.detail).toMatch(/genesis/);
    expect(status(verifyMothResult(QPU, { expectPrevHash: '0'.repeat(64) }), 'chain')).toBe('pass');
    expect(status(verifyMothResult(QPU, { expectPrevHash: 'f'.repeat(64) }), 'chain')).toBe('fail');
  });
});

describe('verifyMothResult tamper detection', () => {
  it('fails a seed that is not in the job output', () => {
    const v = verifyMothResult(QPU, { seed: 42 });
    expect(v.ok).toBe(false);
    expect(status(v, 'seed-in-output')).toBe('fail');
  });

  it('fails when output bytes are swapped', () => {
    const v = verifyMothResult(mutate(QPU, (o) => { o.random.hex = '00' + o.random.hex.slice(2); }));
    expect(status(v, 'output-hash')).toBe('fail');
    expect(status(v, 'derived-integers')).toBe('fail');
    expect(v.ok).toBe(false);
  });

  it('fails when a derived integer is edited', () => {
    const v = verifyMothResult(mutate(QPU, (o) => { o.random.derived.integers.values[1] ^= 1; }));
    expect(status(v, 'derived-integers')).toBe('fail');
  });

  it('fails when raw counts are edited', () => {
    const v = verifyMothResult(mutate(QPU, (o) => {
      const k = Object.keys(o.raw.counts)[0];
      o.raw.counts[k] += 1;
    }));
    expect(status(v, 'raw-counts-hash')).toBe('fail');
  });

  it('fails when the backend is relabelled (pulse hash and binding break)', () => {
    const v = verifyMothResult(mutate(EMU, (o) => {
      o.provenance.backend = 'ibm_fez';
      o.provenance.mode = 'qpu';
      o.pulse.provenance.backend = 'ibm_fez';
      o.pulse.provenance.mode = 'qpu';
    }));
    expect(status(v, 'pulse-hash')).toBe('fail');
    expect(v.ok).toBe(false);
  });

  it('fails when result provenance disagrees with the hashed pulse', () => {
    const v = verifyMothResult(mutate(EMU, (o) => { o.provenance.backend = 'ibm_fez'; }));
    expect(status(v, 'pulse-binds-result')).toBe('fail');
    expect(status(v, 'pulse-hash')).toBe('pass');
  });

  it('fails a commitment timestamped after the outcome', () => {
    const v = verifyMothResult(mutate(QPU, (o) => { o.provenance.committed_at = '2099-01-01T00:00:00+00:00'; }));
    expect(status(v, 'commitment')).toBe('fail');
  });

  it('skips raw-counts when counts are not included', () => {
    const v = verifyMothResult(mutate(QPU, (o) => { delete o.raw; }));
    expect(status(v, 'raw-counts-hash')).toBe('skip');
  });

  it('never throws on garbage', () => {
    for (const bad of ['', 'nope', '{}', '{"result":{"output":{}}}', '[]', 'null']) {
      const v = verifyMothResult(bad);
      expect(v.ok).toBe(false);
      expect(v.classification).toBe('unknown');
    }
  });
});

describe('verifyPulseChain', () => {
  it('verifies a live two-device QPU chain', () => {
    const chain = [verifyMothResult(QPU), verifyMothResult(QPU_CHAINED)];
    expect(chain.every((v) => v.ok && v.classification === 'hardware')).toBe(true);
    expect(chain.map((v) => v.backend)).toEqual(['ibm_fez', 'ibm_marrakesh']);
    expect(verifyPulseChain(chain).map((r) => r.status)).toEqual(['pass']);
    expect(verifyPulseChain([chain[1], chain[0]]).map((r) => r.status)).toEqual(['fail']);
  });

  it('passes linked pulses and fails broken links', () => {
    const a = { pulseHash: 'a'.repeat(64) } as MothVerification;
    const b = { prevHash: 'a'.repeat(64), pulseHash: 'b'.repeat(64) } as MothVerification;
    const c = { prevHash: 'x'.repeat(64) } as MothVerification;
    expect(verifyPulseChain([a, b]).map((r) => r.status)).toEqual(['pass']);
    expect(verifyPulseChain([a, b, c]).map((r) => r.status)).toEqual(['pass', 'fail']);
  });
});
