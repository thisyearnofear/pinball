import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { ZeroHash, keccak256, concat, getBytes, solidityPackedKeccak256 } from 'ethers';
import type { MothAttestation } from './moth-seed.js';

/**
 * Daily Kami seed bank — commit now, reveal one day at a time.
 *
 * While QPU access exists we bank a run of daily seeds, each from a MOTH job
 * with its attestation. Only the Merkle root over the bank is published (and
 * committed in the client), so nobody — the operator included — can swap a
 * day's seed after the root is out. Each day the backend reveals that day's
 * seed, salt and proof; never a future day.
 *
 * Leaf = keccak256(abi.encodePacked(LEAF_TAG, day, seed, salt, jobId, pulseHash, mode, backend)).
 * Mode and backend are bound too, so an emu seed can't be relabelled QPU later.
 * The 32-byte salt is load-bearing: a uint32 seed alone could be brute-forced
 * out of its leaf hash in seconds. Pairs hash sorted (OpenZeppelin MerkleProof
 * convention), so a proof is just the sibling list and is checkable on-chain.
 */

export const DAILY_LEAF_TAG = 'kamikaze-daily-v1';
const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX32 = /^0x[0-9a-f]{64}$/i;

export type DailySeedEntry = {
  day: number;
  seed: number;
  /** 0x-prefixed 32-byte hex. Secret until the day is revealed. */
  salt: string;
  attestation: MothAttestation;
};

export type DailySeedBank = {
  v: 1;
  leafTag: typeof DAILY_LEAF_TAG;
  /** UTC date of day 0, YYYY-MM-DD. */
  startDate: string;
  root: string;
  entries: DailySeedEntry[];
};

/** Public commitment: safe to publish (no seeds, salts or job ids). */
export type DailySeedCommitment = {
  v: 1;
  leafTag: typeof DAILY_LEAF_TAG;
  startDate: string;
  days: number;
  root: string;
};

export type DailySeedReveal = {
  day: number;
  date: string;
  seed: number;
  salt: string;
  attestation: MothAttestation;
  proof: string[];
  root: string;
  startDate: string;
};

export function isUtcDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Day index of `date` relative to `startDate` (both UTC YYYY-MM-DD). */
export function dayIndex(startDate: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS);
}

export function dateForDay(startDate: string, day: number): string {
  return utcDateKey(new Date(Date.parse(`${startDate}T00:00:00Z`) + day * DAY_MS));
}

export function newSalt(rand: (n: number) => Buffer = randomBytes): string {
  return `0x${rand(32).toString('hex')}`;
}

export function dailyLeaf(e: Pick<DailySeedEntry, 'day' | 'seed' | 'salt' | 'attestation'>): string {
  return solidityPackedKeccak256(
    ['string', 'uint32', 'uint32', 'bytes32', 'string', 'bytes32', 'string', 'string'],
    [
      DAILY_LEAF_TAG,
      e.day,
      e.seed,
      e.salt,
      e.attestation.jobId,
      e.attestation.pulseHash ? `0x${e.attestation.pulseHash}` : ZeroHash,
      e.attestation.mode,
      e.attestation.backend ?? '',
    ],
  );
}

function hashPair(a: string, b: string): string {
  return a.toLowerCase() < b.toLowerCase() ? keccak256(concat([getBytes(a), getBytes(b)])) : keccak256(concat([getBytes(b), getBytes(a)]));
}

/** All tree levels, leaves first. An odd node is promoted unchanged. */
function buildLevels(leaves: string[]): string[][] {
  if (leaves.length === 0) throw new Error('empty bank');
  const levels = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const next: string[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? hashPair(cur[i], cur[i + 1]) : cur[i]);
    levels.push(next);
  }
  return levels;
}

export function merkleRoot(leaves: string[]): string {
  const levels = buildLevels(leaves);
  return levels[levels.length - 1][0];
}

export function merkleProof(leaves: string[], index: number): string[] {
  const levels = buildLevels(leaves);
  const proof: string[] = [];
  let i = index;
  for (let l = 0; l < levels.length - 1; l++) {
    const sib = i ^ 1;
    if (sib < levels[l].length) proof.push(levels[l][sib]);
    i >>= 1;
  }
  return proof;
}

export function verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
  let h = leaf;
  for (const p of proof) h = hashPair(h, p);
  return h.toLowerCase() === root.toLowerCase();
}

/** Build a bank (assigns days in the order seeds were produced — no picking). */
export function buildBank(startDate: string, seeds: Array<{ seed: number; attestation: MothAttestation; salt?: string }>): DailySeedBank {
  if (!isUtcDate(startDate)) throw new Error('startDate must be YYYY-MM-DD');
  const entries = seeds.map((s, day) => ({ day, seed: s.seed, salt: s.salt ?? newSalt(), attestation: s.attestation }));
  return { v: 1, leafTag: DAILY_LEAF_TAG, startDate, root: merkleRoot(entries.map(dailyLeaf)), entries };
}

export function commitmentOf(bank: DailySeedBank): DailySeedCommitment {
  return { v: 1, leafTag: bank.leafTag, startDate: bank.startDate, days: bank.entries.length, root: bank.root };
}

/** Structural + cryptographic check: entries are dense, well-formed and hash to `root`. */
export function validateBank(raw: unknown): DailySeedBank | null {
  const b = raw as DailySeedBank;
  if (!b || b.v !== 1 || b.leafTag !== DAILY_LEAF_TAG || !isUtcDate(b.startDate) || !HEX32.test(b.root ?? '')) return null;
  if (!Array.isArray(b.entries) || b.entries.length === 0) return null;
  for (let i = 0; i < b.entries.length; i++) {
    const e = b.entries[i];
    if (!e || e.day !== i || !Number.isInteger(e.seed) || e.seed < 0 || e.seed > 0xffffffff) return null;
    if (!HEX32.test(e.salt ?? '') || e.attestation?.provider !== 'moth' || typeof e.attestation.jobId !== 'string') return null;
  }
  if (merkleRoot(b.entries.map(dailyLeaf)).toLowerCase() !== b.root.toLowerCase()) return null;
  return b;
}

/**
 * Reveal the entry for `date`, or null when the date is outside the bank or
 * still in the future relative to `today`. Future days are never revealed.
 */
export function revealDay(bank: DailySeedBank, date: string, today: string): DailySeedReveal | null {
  if (!isUtcDate(date) || !isUtcDate(today) || date > today) return null;
  const day = dayIndex(bank.startDate, date);
  const entry = bank.entries[day];
  if (!entry || day < 0) return null;
  const leaves = bank.entries.map(dailyLeaf);
  return {
    day,
    date,
    seed: entry.seed,
    salt: entry.salt,
    attestation: entry.attestation,
    proof: merkleProof(leaves, day),
    root: bank.root,
    startDate: bank.startDate,
  };
}

let cached: { key: string; bank: DailySeedBank | null } | null = null;

/**
 * Load the bank from DAILY_SEED_BANK_PATH (a JSON file) or DAILY_SEED_BANK_JSON
 * (inline / base64 JSON, for hosts without a writable disk). Never throws: a
 * missing or invalid bank disables the daily QPU seed (clients fall back).
 * DAILY_SEED_BANK_ROOT, when set, must match — guards against deploying the
 * wrong bank under a published root.
 */
export function loadDailySeedBank(envv: NodeJS.ProcessEnv = process.env): DailySeedBank | null {
  const key = `${envv.DAILY_SEED_BANK_PATH ?? ''}|${(envv.DAILY_SEED_BANK_JSON ?? '').length}|${envv.DAILY_SEED_BANK_ROOT ?? ''}`;
  if (cached && cached.key === key) return cached.bank;
  let bank: DailySeedBank | null = null;
  try {
    let text: string | undefined;
    if (envv.DAILY_SEED_BANK_PATH) text = readFileSync(envv.DAILY_SEED_BANK_PATH, 'utf8');
    else if (envv.DAILY_SEED_BANK_JSON) {
      const raw = envv.DAILY_SEED_BANK_JSON.trim();
      text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    }
    if (text) bank = validateBank(JSON.parse(text));
    if (bank && envv.DAILY_SEED_BANK_ROOT && envv.DAILY_SEED_BANK_ROOT.toLowerCase() !== bank.root.toLowerCase()) bank = null;
  } catch {
    bank = null;
  }
  cached = { key, bank };
  return bank;
}

export function resetDailySeedBankCache(): void {
  cached = null;
}

/**
 * Verifier hook: a replay that claims to be a daily run must carry exactly
 * the revealed seed for a day that has already been revealed.
 */
export function checkDailyReplay(
  digest: { seed?: unknown; daily?: unknown },
  bank: DailySeedBank | null,
  today: string,
): string[] {
  const d = digest.daily as { date?: unknown; day?: unknown; root?: unknown } | undefined;
  if (d === undefined) return [];
  if (!d || typeof d !== 'object' || !isUtcDate(d.date)) return ['REPLAY_DAILY_MALFORMED'];
  if (!bank) return ['REPLAY_DAILY_BANK_UNAVAILABLE'];
  if (typeof d.root === 'string' && d.root.toLowerCase() !== bank.root.toLowerCase()) return ['REPLAY_DAILY_ROOT_MISMATCH'];
  const reveal = revealDay(bank, d.date, today);
  if (!reveal) return ['REPLAY_DAILY_DAY_UNREVEALED'];
  if (d.day !== undefined && d.day !== reveal.day) return ['REPLAY_DAILY_DAY_MISMATCH'];
  return digest.seed === reveal.seed ? [] : ['REPLAY_DAILY_SEED_MISMATCH'];
}
