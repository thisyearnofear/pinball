/**
 * Daily Kami seed: everyone plays the same QPU-banked seed each UTC day.
 *
 * The backend reveals today's seed with its salt and a Merkle proof; this
 * client checks the proof against the root pinned in
 * `config/daily-seed-commitment`, so a seed the operator didn't commit to
 * before the day is simply rejected. Leaf encoding mirrors
 * backend/src/lib/daily-seed-bank.ts (shared test vector in both suites).
 *
 * Never throws, never blocks: no backend, no bank or a bad proof just means the
 * daily run uses an ordinary run seed.
 */
import axios from "axios";
import { ZeroHash, concat, getBytes, keccak256, solidityPackedKeccak256 } from "ethers";
import { getAppConfig } from "@/config/app-config";
import { DAILY_SEED_COMMITMENT, type DailySeedCommitment } from "@/config/daily-seed-commitment";
import { sanitizeSeedAttestation, type SeedAttestation } from "@/utils/seed-provenance";

export const DAILY_LEAF_TAG = "kamikaze-daily-v1";
const DAY_MS = 86_400_000;
const REQUEST_TIMEOUT_MS = 2500;
const HEX32 = /^0x[0-9a-f]{64}$/i;

/** Recorded in the replay digest so the verifier can check the seed. */
export type DailyRunRef = { date: string; day: number; root: string };

export type VerifiedDailySeed = DailyRunRef & {
    seed: number;
    source: "moth-qpu" | "moth-emu";
    attestation: SeedAttestation;
};

export function dailyLeaf(e: { day: number; seed: number; salt: string; jobId: string; pulseHash?: string; mode: "emu" | "qpu"; backend?: string }): string {
    return solidityPackedKeccak256(
        ["string", "uint32", "uint32", "bytes32", "string", "bytes32", "string", "string"],
        [DAILY_LEAF_TAG, e.day, e.seed, e.salt, e.jobId, e.pulseHash ? `0x${e.pulseHash}` : ZeroHash, e.mode, e.backend ?? ""],
    );
}

export function verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
    let h = leaf;
    for (const p of proof) {
        h = h.toLowerCase() < p.toLowerCase() ? keccak256(concat([getBytes(h), getBytes(p)])) : keccak256(concat([getBytes(p), getBytes(h)]));
    }
    return h.toLowerCase() === root.toLowerCase();
}

export function dayIndexFor(startDate: string, date: string): number {
    return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS);
}

/**
 * Check a `/api/daily/seed` body against the pinned commitment. Pure. Returns
 * null unless the day, root and Merkle proof all check out.
 */
export function verifyDailyReveal(
    body: unknown,
    date: string,
    commitment: DailySeedCommitment | null = DAILY_SEED_COMMITMENT,
): VerifiedDailySeed | null {
    if (!commitment) return null;
    const b = body as Record<string, unknown> | null;
    if (!b || typeof b !== "object") return null;
    const { seed, salt, proof, root, day } = b as { seed: unknown; salt: unknown; proof: unknown; root: unknown; day: unknown };
    if (b.date !== date || typeof root !== "string" || root.toLowerCase() !== commitment.root.toLowerCase()) return null;
    const expectedDay = dayIndexFor(commitment.startDate, date);
    if (day !== expectedDay || expectedDay < 0 || expectedDay >= commitment.days) return null;
    if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    if (typeof salt !== "string" || !HEX32.test(salt)) return null;
    if (!Array.isArray(proof) || proof.length > 64 || !proof.every((p) => typeof p === "string" && HEX32.test(p))) return null;
    // The leaf binds job id, pulse hash, mode and backend, so the QPU/emu label
    // is committed too. Any field the sanitizer would drop fails the check.
    const attestation = sanitizeSeedAttestation(b.attestation);
    if (!attestation) return null;
    const raw = b.attestation as { pulseHash?: unknown; backend?: unknown };
    if ((raw.pulseHash ?? undefined) !== attestation.pulseHash || (raw.backend ?? undefined) !== attestation.backend) return null;
    try {
        const leaf = dailyLeaf({ day: expectedDay, seed, salt, jobId: attestation.jobId, pulseHash: attestation.pulseHash, mode: attestation.mode, backend: attestation.backend });
        if (!verifyMerkleProof(leaf, proof as string[], commitment.root)) return null;
    } catch {
        return null;
    }
    return {
        date,
        day: expectedDay,
        root: commitment.root,
        seed,
        source: attestation.mode === "qpu" ? "moth-qpu" : "moth-emu",
        attestation,
    };
}

const API_BASE = (() => {
    try {
        return getAppConfig().backend.baseUrl;
    } catch {
        return "";
    }
})();

const cache = new Map<string, Promise<VerifiedDailySeed | null>>();

/** Today's (or `date`'s) verified daily seed. Never throws; de-duplicated per date. */
export function fetchDailySeed(date: string): Promise<VerifiedDailySeed | null> {
    if (!API_BASE || !DAILY_SEED_COMMITMENT) return Promise.resolve(null);
    const hit = cache.get(date);
    if (hit) return hit;
    const p = axios
        .get(`${API_BASE}/api/daily/seed`, { params: { date }, timeout: REQUEST_TIMEOUT_MS })
        .then(({ data }) => verifyDailyReveal(data, date))
        .catch(() => null)
        .then((v) => {
            // Don't pin a miss: let a later visit retry.
            if (!v) cache.delete(date);
            return v;
        });
    cache.set(date, p);
    return p;
}

export function resetDailySeedCache(): void {
    cache.clear();
}
