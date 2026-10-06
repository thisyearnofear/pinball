import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { keccak256, toUtf8Bytes } from 'ethers';
import {
  buildBank,
  checkDailyReplay,
  commitmentOf,
  dailyLeaf,
  dateForDay,
  dayIndex,
  loadDailySeedBank,
  merkleProof,
  merkleRoot,
  resetDailySeedBankCache,
  revealDay,
  validateBank,
  verifyMerkleProof,
  type DailySeedBank,
} from '../src/lib/daily-seed-bank.js';
import { verifyReplay } from '../src/lib/replay-verifier.js';
import { dailySeedRoutes } from '../src/routes/daily-seed.js';
import type { MothAttestation } from '../src/lib/moth-seed.js';

const att = (jobId: string): MothAttestation => ({
  provider: 'moth',
  engine: 'comet-qrng-v1',
  mode: 'qpu',
  jobId,
  pulseHash: 'ab'.repeat(32),
  backend: 'ibm_torino',
  bellViolation: true,
});
const salt = (i: number) => `0x${i.toString(16).padStart(64, '0')}`;

function bankOf(n: number, start = '2026-10-07'): DailySeedBank {
  return buildBank(start, Array.from({ length: n }, (_, i) => ({ seed: 1000 + i, salt: salt(i + 1), attestation: att(`job-${Math.floor(i / 4)}`) })));
}

describe('daily seed bank: merkle commitment', () => {
  it('leaf hash is pinned (client duplicates this exact encoding)', () => {
    // Vector shared with tests/unit/services/daily-seed.spec.ts.
    expect(dailyLeaf({ day: 0, seed: 1000, salt: salt(1), attestation: att('job-0') })).toBe(DAILY_VECTOR_LEAF0);
    expect(bankOf(5).root).toBe(DAILY_VECTOR_ROOT);
  });

  it('every day proves against the root, for odd and even sizes', () => {
    for (const n of [1, 2, 3, 5, 8, 13, 366]) {
      const bank = bankOf(n);
      const leaves = bank.entries.map(dailyLeaf);
      for (const i of [0, Math.floor(n / 2), n - 1]) {
        expect(verifyMerkleProof(leaves[i], merkleProof(leaves, i), bank.root)).toBe(true);
      }
    }
  });

  it('a different seed, salt, day or job id breaks the proof', () => {
    const bank = bankOf(8);
    const leaves = bank.entries.map(dailyLeaf);
    const proof = merkleProof(leaves, 3);
    const e = bank.entries[3];
    expect(verifyMerkleProof(dailyLeaf({ ...e, seed: e.seed + 1 }), proof, bank.root)).toBe(false);
    expect(verifyMerkleProof(dailyLeaf({ ...e, salt: salt(99) }), proof, bank.root)).toBe(false);
    expect(verifyMerkleProof(dailyLeaf({ ...e, day: 4 }), proof, bank.root)).toBe(false);
    expect(verifyMerkleProof(dailyLeaf({ ...e, attestation: att('other') }), proof, bank.root)).toBe(false);
    expect(verifyMerkleProof(dailyLeaf({ ...e, attestation: { ...e.attestation, mode: 'emu' } }), proof, bank.root)).toBe(false);
    expect(verifyMerkleProof(dailyLeaf({ ...e, attestation: { ...e.attestation, backend: 'aer' } }), proof, bank.root)).toBe(false);
  });

  it('assigns days in production order and generates 32-byte salts when absent', () => {
    const bank = buildBank('2026-10-07', [{ seed: 7, attestation: att('a') }, { seed: 9, attestation: att('a') }]);
    expect(bank.entries.map((e) => [e.day, e.seed])).toEqual([[0, 7], [1, 9]]);
    expect(bank.entries[0].salt).toMatch(/^0x[0-9a-f]{64}$/);
    expect(bank.entries[0].salt).not.toBe(bank.entries[1].salt);
    expect(merkleRoot(bank.entries.map(dailyLeaf))).toBe(bank.root);
  });

  it('the public commitment carries no seeds, salts or job ids', () => {
    const c = commitmentOf(bankOf(5));
    expect(c).toEqual({ v: 1, leafTag: 'kamikaze-daily-v1', startDate: '2026-10-07', days: 5, root: bankOf(5).root });
    expect(JSON.stringify(c)).not.toMatch(/job-|1000|0x0{63}1/);
  });

  it('validateBank rejects tampering', () => {
    const bank = bankOf(4);
    expect(validateBank(bank)).not.toBeNull();
    const tampered = structuredClone(bank);
    tampered.entries[2].seed = 42;
    expect(validateBank(tampered)).toBeNull();
    expect(validateBank({ ...bank, entries: [] })).toBeNull();
    expect(validateBank({ ...bank, startDate: '2026-13-01' })).toBeNull();
    expect(validateBank(null)).toBeNull();
  });
});

describe('daily seed bank: reveal', () => {
  it('maps UTC dates to days', () => {
    expect(dayIndex('2026-10-07', '2026-10-07')).toBe(0);
    expect(dayIndex('2026-10-07', '2027-10-07')).toBe(365);
    expect(dateForDay('2026-10-07', 25)).toBe('2026-11-01');
  });

  it('reveals today and past days with a valid proof', () => {
    const bank = bankOf(10);
    const r = revealDay(bank, '2026-10-09', '2026-10-09')!;
    expect(r.day).toBe(2);
    expect(r.seed).toBe(1002);
    expect(verifyMerkleProof(dailyLeaf(r), r.proof, r.root)).toBe(true);
    expect(revealDay(bank, '2026-10-07', '2026-10-09')?.seed).toBe(1000);
  });

  it('never reveals the future or days outside the bank', () => {
    const bank = bankOf(10);
    expect(revealDay(bank, '2026-10-10', '2026-10-09')).toBeNull();
    expect(revealDay(bank, '2026-10-06', '2026-10-09')).toBeNull();
    expect(revealDay(bank, '2026-10-17', '2026-12-01')).toBeNull();
    expect(revealDay(bank, 'nope', '2026-10-09')).toBeNull();
  });
});

describe('daily seed bank: loader', () => {
  let dir: string;
  beforeEach(() => {
    resetDailySeedBankCache();
    dir = mkdtempSync(join(tmpdir(), 'bank-'));
  });
  afterEach(() => resetDailySeedBankCache());

  it('loads from a path, inline JSON or base64, and checks the pinned root', () => {
    const bank = bankOf(6);
    const path = join(dir, 'bank.json');
    writeFileSync(path, JSON.stringify(bank));
    expect(loadDailySeedBank({ DAILY_SEED_BANK_PATH: path })?.root).toBe(bank.root);
    expect(loadDailySeedBank({ DAILY_SEED_BANK_JSON: JSON.stringify(bank) })?.root).toBe(bank.root);
    expect(loadDailySeedBank({ DAILY_SEED_BANK_JSON: Buffer.from(JSON.stringify(bank)).toString('base64') })?.root).toBe(bank.root);
    expect(loadDailySeedBank({ DAILY_SEED_BANK_PATH: path, DAILY_SEED_BANK_ROOT: bank.root })).not.toBeNull();
    expect(loadDailySeedBank({ DAILY_SEED_BANK_PATH: path, DAILY_SEED_BANK_ROOT: `0x${'0'.repeat(64)}` })).toBeNull();
  });

  it('never throws on a missing, unreadable or invalid bank', () => {
    expect(loadDailySeedBank({})).toBeNull();
    expect(loadDailySeedBank({ DAILY_SEED_BANK_PATH: join(dir, 'missing.json') })).toBeNull();
    expect(loadDailySeedBank({ DAILY_SEED_BANK_JSON: '{not json' })).toBeNull();
  });
});

describe('daily seed bank: replay verification', () => {
  const bank = bankOf(10);
  const today = '2026-10-09';

  it('passes a daily run on the revealed seed and ignores non-daily runs', () => {
    expect(checkDailyReplay({ seed: 1002, daily: { date: today, day: 2, root: bank.root } }, bank, today)).toEqual([]);
    expect(checkDailyReplay({ seed: 5 }, bank, today)).toEqual([]);
  });

  it('flags a wrong seed, unrevealed day, wrong root, missing bank and malformed claims', () => {
    expect(checkDailyReplay({ seed: 1, daily: { date: today } }, bank, today)).toEqual(['REPLAY_DAILY_SEED_MISMATCH']);
    expect(checkDailyReplay({ seed: 1003, daily: { date: '2026-10-10' } }, bank, today)).toEqual(['REPLAY_DAILY_DAY_UNREVEALED']);
    expect(checkDailyReplay({ seed: 1002, daily: { date: today, root: `0x${'1'.repeat(64)}` } }, bank, today)).toEqual(['REPLAY_DAILY_ROOT_MISMATCH']);
    expect(checkDailyReplay({ seed: 1002, daily: { date: today, day: 3 } }, bank, today)).toEqual(['REPLAY_DAILY_DAY_MISMATCH']);
    expect(checkDailyReplay({ seed: 1002, daily: { date: today } }, null, today)).toEqual(['REPLAY_DAILY_BANK_UNAVAILABLE']);
    expect(checkDailyReplay({ seed: 1002, daily: 'today' }, bank, today)).toEqual(['REPLAY_DAILY_MALFORMED']);
  });

  it('is wired into verifyReplay', () => {
    const digest = {
      v: 1, seed: 1002, table: 1, mode: 'classic', tickCount: 600, finalScore: 5000, events: [{ t: 0, e: 'spawn' }],
      daily: { date: today, day: 2, root: bank.root },
    };
    const json = JSON.stringify(digest);
    const ctx = { score: 5000, mode: 'classic' as const, metadata: {}, replayHash: keccak256(toUtf8Bytes(json)), dailyBank: bank, today };
    expect(verifyReplay(json, ctx).failures).toEqual([]);
    const forged = JSON.stringify({ ...digest, seed: 77 });
    expect(verifyReplay(forged, { ...ctx, replayHash: keccak256(toUtf8Bytes(forged)) }).failures).toContain('REPLAY_DAILY_SEED_MISMATCH');
  });
});

describe('daily seed routes', () => {
  let dir: string;
  beforeEach(() => {
    resetDailySeedBankCache();
    dir = mkdtempSync(join(tmpdir(), 'bank-'));
  });
  afterEach(() => {
    delete process.env.DAILY_SEED_BANK_PATH;
    resetDailySeedBankCache();
  });

  async function app(bank?: DailySeedBank) {
    if (bank) {
      const path = join(dir, 'bank.json');
      writeFileSync(path, JSON.stringify(bank));
      process.env.DAILY_SEED_BANK_PATH = path;
    }
    const a = Fastify();
    await a.register(dailySeedRoutes);
    return a;
  }
  const todayUtc = new Date().toISOString().slice(0, 10);

  it("reveals today's seed with a proof and publishes the commitment", async () => {
    const bank = bankOf(3, todayUtc);
    const a = await app(bank);
    const res = await a.inject({ method: 'GET', url: '/api/daily/seed' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ day: 0, date: todayUtc, seed: 1000, root: bank.root });
    expect(verifyMerkleProof(dailyLeaf(body), body.proof, bank.root)).toBe(true);
    const c = await a.inject({ method: 'GET', url: '/api/daily/commitment' });
    expect(c.json()).toEqual(commitmentOf(bank));
  });

  it('refuses future dates, bad dates and a missing bank', async () => {
    const a = await app(bankOf(3, todayUtc));
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect((await a.inject({ method: 'GET', url: `/api/daily/seed?date=${tomorrow}` })).statusCode).toBe(403);
    expect((await a.inject({ method: 'GET', url: '/api/daily/seed?date=2026-02-30' })).statusCode).toBe(400);
    expect((await a.inject({ method: 'GET', url: '/api/daily/seed?date=2000-01-01' })).statusCode).toBe(404);
    delete process.env.DAILY_SEED_BANK_PATH;
    resetDailySeedBankCache();
    const b = await app();
    expect((await b.inject({ method: 'GET', url: '/api/daily/seed' })).statusCode).toBe(404);
  });
});

const DAILY_VECTOR_LEAF0 = '0x0fe58e14cad5ed6ba8283d4c1c80c2fb1eb5c8d053daccdd6b018742410c4728';
const DAILY_VECTOR_ROOT = '0x8e8d5e96769e239846db5ded3e43a69618411c537c6221dd96ebfce300784a87';
