/**
 * Public commitment to the Daily Kami seed bank (see docs/QUANTUM_SEEDS.md).
 *
 * Generated once by `npm run bank-daily` in backend/ and pinned here, so the
 * backend cannot swap a day's seed later: every revealed seed must carry a
 * Merkle proof against this root. `null` = no bank yet (daily runs use a
 * normal run seed).
 */
export type DailySeedCommitment = {
    v: 1;
    leafTag: "kamikaze-daily-v1";
    /** UTC date of day 0 (YYYY-MM-DD). */
    startDate: string;
    days: number;
    root: string;
};

export const DAILY_SEED_COMMITMENT: DailySeedCommitment | null = null;
