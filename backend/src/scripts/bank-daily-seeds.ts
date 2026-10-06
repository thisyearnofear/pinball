import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runMothSeedJob, type MothMode, type MothSeedChunk } from '../lib/moth-seed.js';
import { buildBank, commitmentOf, dateForDay, isUtcDate, newSalt, utcDateKey } from '../lib/daily-seed-bank.js';

/**
 * Bank a run of daily Kami seeds from MOTH and emit the Merkle commitment.
 *
 * Usage:
 *   npm run bank-daily -- [--days 366] [--start YYYY-MM-DD] [--out .data/daily-seed-bank.json]
 *                         [--mode qpu|emu] [--per-job 128] [--shots 10000] [--parallel 2]
 *
 * Resumable: finished jobs are appended to `<out>.chunks.json`, so a killed run
 * picks up where it stopped. In qpu mode any chunk the result reports as
 * simulator output is rejected rather than banked under a hardware label.
 * Seeds are assigned to days strictly in the order they were produced.
 *
 * The bank file holds every future seed: keep it out of git (backend/.data is
 * ignored) and deploy it as a secret. Only the printed commitment is public.
 * Nothing secret (key, seeds, salts) is ever printed.
 */

type Args = { days: number; start: string; out: string; mode: MothMode; perJob: number; shots: number; parallel: number };

function parseArgs(argv: string[]): Args {
  const get = (k: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const tomorrow = utcDateKey(new Date(Date.now() + 86_400_000));
  const a: Args = {
    days: Number(get('days') ?? 366),
    start: get('start') ?? tomorrow,
    out: resolve(get('out') ?? '.data/daily-seed-bank.json'),
    mode: get('mode') === 'emu' ? 'emu' : 'qpu',
    perJob: Number(get('per-job') ?? 128),
    shots: Number(get('shots') ?? 10_000),
    parallel: Math.max(1, Number(get('parallel') ?? 2)),
  };
  if (!Number.isInteger(a.days) || a.days < 1 || a.days > 4000) throw new Error('--days must be 1..4000');
  if (!isUtcDate(a.start)) throw new Error('--start must be YYYY-MM-DD');
  return a;
}

type StoredChunk = MothSeedChunk & { salts: string[] };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.MOTH_API_KEY;
  if (!apiKey) throw new Error('MOTH_API_KEY is not set');
  if (existsSync(args.out)) throw new Error(`${args.out} already exists — refusing to overwrite a bank`);
  mkdirSync(dirname(args.out), { recursive: true });

  const chunksPath = `${args.out}.chunks.json`;
  const chunks: StoredChunk[] = existsSync(chunksPath) ? JSON.parse(readFileSync(chunksPath, 'utf8')) : [];
  const total = () => chunks.reduce((n, c) => n + c.seeds.length, 0);
  const save = () => writeFileSync(chunksPath, JSON.stringify(chunks), { mode: 0o600 });
  console.log(`banking ${args.days} days from ${args.start} (${args.mode}); resumed ${total()} seeds from ${chunks.length} jobs`);

  let failures = 0;
  while (total() < args.days) {
    const need = args.days - total();
    const jobs = Math.min(args.parallel, Math.ceil(need / args.perJob));
    const results = await Promise.all(
      Array.from({ length: jobs }, () =>
        runMothSeedJob({ apiKey, mode: args.mode, count: args.perJob, shots: args.shots, timeoutMs: 45 * 60_000, baseUrl: process.env.MOTH_API_URL }),
      ),
    );
    for (const r of results) {
      if (!r) {
        failures++;
        console.log('job failed or timed out');
        continue;
      }
      if (args.mode === 'qpu' && r.attestation.mode !== 'qpu') {
        failures++;
        console.log(`job ${r.attestation.jobId}: result reports simulator backend (${r.attestation.backend ?? 'unknown'}) — rejected`);
        continue;
      }
      failures = 0;
      chunks.push({ ...r, salts: r.seeds.map(() => newSalt()) });
      save();
      console.log(`job ${r.attestation.jobId}: +${r.seeds.length} seeds on ${r.attestation.backend ?? '?'} (bell ${r.attestation.bellViolation ?? 'n/a'}) → ${total()}/${args.days}`);
    }
    if (failures >= 4) throw new Error(`${failures} consecutive job failures — progress saved to ${chunksPath}, re-run to resume`);
  }

  const seeds = chunks.flatMap((c) => c.seeds.map((seed, i) => ({ seed, salt: c.salts[i], attestation: c.attestation }))).slice(0, args.days);
  const bank = buildBank(args.start, seeds);
  writeFileSync(args.out, JSON.stringify(bank), { mode: 0o600 });
  const backends = [...new Set(chunks.map((c) => c.attestation.backend ?? '?'))];
  console.log(`wrote ${args.out} (${bank.entries.length} days, ${chunks.length} jobs, backends: ${backends.join(', ')})`);
  console.log(`last day: ${dateForDay(bank.startDate, bank.entries.length - 1)}`);
  console.log('PUBLIC COMMITMENT:');
  console.log(JSON.stringify(commitmentOf(bank), null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
