/**
 * Audit a MOTH comet-qrng-v1 job (or a chain of them) and, optionally, a run seed.
 *
 *   npm run verify:moth -- <job-id | result.json> [more…] [--seed N]
 *
 * Arguments are job ids (fetched with MOTH_API_KEY) or saved result files, in
 * chain order. `--seed` checks the seed against the first job. Exits non-zero
 * if any check fails. The key is read from the environment and never printed.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { verifyMothResult, verifyPulseChain, type MothVerification, type ProofCheck } from '../lib/moth-proof.js';

const API = process.env.MOTH_API_URL ?? 'https://api.mothquantum.com/api/v1';
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(ref: string): Promise<{ label: string; body: string; jobId?: string }> {
  if (existsSync(ref)) return { label: ref, body: await readFile(ref, 'utf8') };
  if (!JOB_ID.test(ref)) throw new Error(`${ref}: not a file or MOTH job id`);
  const key = process.env.MOTH_API_KEY;
  if (!key) throw new Error('MOTH_API_KEY is not set (needed to fetch job results)');
  const res = await fetch(`${API}/jobs/${ref}/result`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${ref}: HTTP ${res.status}`);
  return { label: ref, body: await res.text(), jobId: ref };
}

const MARK: Record<ProofCheck['status'], string> = { pass: 'PASS', fail: 'FAIL', skip: ' -- ' };
const print = (c: ProofCheck) => console.log(`  ${MARK[c.status]}  ${c.id.padEnd(20)} ${c.detail}`);

async function main() {
  const args = process.argv.slice(2);
  let seed: number | undefined;
  const refs: string[] = [];
  for (let k = 0; k < args.length; k++) {
    if (args[k] === '--seed') {
      seed = Number(args[++k]);
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('--seed must be a uint32');
    } else refs.push(args[k]);
  }
  if (refs.length === 0) {
    console.error('usage: verify:moth <job-id | result.json> [more…] [--seed N]');
    process.exit(2);
  }

  const results: MothVerification[] = [];
  for (const [k, ref] of refs.entries()) {
    const { label, body, jobId } = await load(ref);
    const v = verifyMothResult(body, { ...(k === 0 && seed !== undefined ? { seed } : {}), ...(jobId ? { jobId } : {}) });
    results.push(v);
    console.log(`\n${label}  [${v.classification}${v.backend ? ` · ${v.backend}` : ''}]  ${v.ok ? 'OK' : 'FAILED'}`);
    v.checks.forEach(print);
  }
  const chain = verifyPulseChain(results);
  if (chain.length) {
    console.log('\nchain');
    chain.forEach(print);
  }
  const ok = results.every((r) => r.ok) && chain.every((c) => c.status !== 'fail');
  console.log(`\n${ok ? 'VERIFIED' : 'NOT VERIFIED'}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(2);
});
