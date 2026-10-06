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

// 366 seeds from 23 MOTH comet-qrng-v1 QPU jobs (ibm_boston, ibm_miami), banked 2026-10-06.
export const DAILY_SEED_COMMITMENT: DailySeedCommitment | null = {
    v: 1,
    leafTag: "kamikaze-daily-v1",
    startDate: "2026-10-07",
    days: 366,
    root: "0x51b28d1cf4bd0e26d7ba21d3d83be3330dfea5b7822e101b1b30619ea6d827d5",
};
