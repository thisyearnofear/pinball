import { describe, it, expect, vi, beforeEach } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { get: axiosGet } }));
vi.mock("@/config/app-config", () => ({ getAppConfig: () => ({ backend: { baseUrl: "https://api.test" } }) }));

// Shared vector with backend/tests/daily-seed-bank.test.ts: 5 days from
// 2026-10-07, seed 1000+i, salt i+1, jobs "job-0"/"job-1".
const VECTOR = vi.hoisted(() => ({
    root: "0x8e8d5e96769e239846db5ded3e43a69618411c537c6221dd96ebfce300784a87",
    leaf0: "0x0fe58e14cad5ed6ba8283d4c1c80c2fb1eb5c8d053daccdd6b018742410c4728",
}));
vi.mock("@/config/daily-seed-commitment", () => ({
    DAILY_SEED_COMMITMENT: { v: 1, leafTag: "kamikaze-daily-v1", startDate: "2026-10-07", days: 5, root: VECTOR.root },
}));

import { keccak256, concat, getBytes } from "ethers";
import { dailyLeaf, verifyDailyReveal, verifyMerkleProof, fetchDailySeed, resetDailySeedCache } from "@/services/daily-seed";

const COMMITMENT = { v: 1 as const, leafTag: "kamikaze-daily-v1" as const, startDate: "2026-10-07", days: 5, root: VECTOR.root };
const salt = (i: number) => `0x${i.toString(16).padStart(64, "0")}`;
const att = (jobId: string, mode: "qpu" | "emu" = "qpu") => ({ provider: "moth", engine: "comet-qrng-v1", mode, jobId, pulseHash: "ab".repeat(32), backend: mode === "qpu" ? "ibm_torino" : "aer", bellViolation: true });

function pair(a: string, b: string) {
    return a.toLowerCase() < b.toLowerCase() ? keccak256(concat([getBytes(a), getBytes(b)])) : keccak256(concat([getBytes(b), getBytes(a)]));
}
const leaves = Array.from({ length: 5 }, (_, i) => dailyLeaf({ day: i, seed: 1000 + i, salt: salt(i + 1), jobId: `job-${Math.floor(i / 4)}`, pulseHash: "ab".repeat(32), mode: "qpu" as const, backend: "ibm_torino" }));
// 5 leaves: L1 = [p01, p23, l4]; L2 = [p(p01,p23), l4]; root = p(L2).
const p01 = pair(leaves[0], leaves[1]);
const p23 = pair(leaves[2], leaves[3]);
const proofs: Record<number, string[]> = {
    2: [leaves[3], p01, leaves[4]],
    4: [pair(p01, p23)],
};

function reveal(day: number, over: Record<string, unknown> = {}) {
    const date = `2026-10-${String(7 + day).padStart(2, "0")}`;
    return { day, date, seed: 1000 + day, salt: salt(day + 1), attestation: att(`job-${Math.floor(day / 4)}`), proof: proofs[day], root: VECTOR.root, startDate: "2026-10-07", ...over };
}

describe("daily seed: commitment checks", () => {
    it("matches the backend leaf encoding and root", () => {
        expect(leaves[0]).toBe(VECTOR.leaf0);
        expect(verifyMerkleProof(leaves[2], proofs[2], VECTOR.root)).toBe(true);
        expect(verifyMerkleProof(leaves[4], proofs[4], VECTOR.root)).toBe(true);
    });

    it("accepts a valid reveal and labels it from the attestation", () => {
        const v = verifyDailyReveal(reveal(2), "2026-10-09", COMMITMENT)!;
        expect(v).toMatchObject({ date: "2026-10-09", day: 2, seed: 1002, source: "moth-qpu", root: VECTOR.root });
        expect(v.attestation.backend).toBe("ibm_torino");
    });

    it("rejects a swapped seed, salt, job, day, date, root or proof", () => {
        const date = "2026-10-09";
        expect(verifyDailyReveal(reveal(2, { seed: 7 }), date, COMMITMENT)).toBeNull();
        expect(verifyDailyReveal(reveal(2, { salt: salt(9) }), date, COMMITMENT)).toBeNull();
        expect(verifyDailyReveal(reveal(2, { attestation: att("job-9") }), date, COMMITMENT)).toBeNull();
        expect(verifyDailyReveal(reveal(2, { day: 3 }), date, COMMITMENT)).toBeNull();
        expect(verifyDailyReveal(reveal(2), "2026-10-10", COMMITMENT)).toBeNull();
        expect(verifyDailyReveal(reveal(2, { root: `0x${"1".repeat(64)}` }), date, COMMITMENT)).toBeNull();
        expect(verifyDailyReveal(reveal(2, { proof: [leaves[3]] }), date, COMMITMENT)).toBeNull();
        expect(verifyDailyReveal(reveal(2, { proof: "nope" }), date, COMMITMENT)).toBeNull();
        expect(verifyDailyReveal(null, date, COMMITMENT)).toBeNull();
        expect(verifyDailyReveal(reveal(2), date, null)).toBeNull();
    });

    it("mode and backend are committed: relabelling a QPU seed as emu (or vice versa) breaks the proof", () => {
        expect(verifyDailyReveal(reveal(2, { attestation: att("job-0", "emu") }), "2026-10-09", COMMITMENT)).toBeNull();
        expect(verifyDailyReveal(reveal(2, { attestation: { ...att("job-0"), backend: "ibm_kyiv" } }), "2026-10-09", COMMITMENT)).toBeNull();
    });
});

describe("daily seed: fetch", () => {
    beforeEach(() => {
        resetDailySeedCache();
        axiosGet.mockReset();
    });

    it("returns the verified seed and de-duplicates per date", async () => {
        axiosGet.mockResolvedValue({ data: reveal(2) });
        const [a, b] = await Promise.all([fetchDailySeed("2026-10-09"), fetchDailySeed("2026-10-09")]);
        expect(a?.seed).toBe(1002);
        expect(b).toEqual(a);
        expect(axiosGet).toHaveBeenCalledTimes(1);
        expect(axiosGet.mock.calls[0][1]).toMatchObject({ params: { date: "2026-10-09" } });
    });

    it("never throws: network errors and bad proofs resolve null and are retried later", async () => {
        axiosGet.mockRejectedValueOnce(new Error("offline"));
        await expect(fetchDailySeed("2026-10-09")).resolves.toBeNull();
        axiosGet.mockResolvedValueOnce({ data: reveal(2, { seed: 1 }) });
        await expect(fetchDailySeed("2026-10-09")).resolves.toBeNull();
        axiosGet.mockResolvedValueOnce({ data: reveal(2) });
        await expect(fetchDailySeed("2026-10-09")).resolves.toMatchObject({ seed: 1002 });
        expect(axiosGet).toHaveBeenCalledTimes(3);
    });
});
