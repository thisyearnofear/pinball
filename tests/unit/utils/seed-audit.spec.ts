import { describe, it, expect } from "vitest";
import { keccak256, toUtf8Bytes } from "ethers";
import {
    SEED_FINGERPRINT_PREFIX,
    seedFingerprint,
    seedFingerprintPreimage,
    shortHash,
    shortSeedFingerprint,
    isAuditHash,
    replayHashOf,
    hasSeedAudit,
    formatSeedAuditSummary,
} from "@/utils/seed-audit";

describe("seedFingerprint", () => {
    it("is a deterministic 32-byte 0x hash namespaced under the version tag", () => {
        const a = seedFingerprint(123456);
        const b = seedFingerprint(123456);
        expect(a).toBe(b);
        expect(a).toMatch(/^0x[0-9a-f]{64}$/);
        expect(seedFingerprintPreimage(123456)).toBe(`${SEED_FINGERPRINT_PREFIX}:123456`);
        expect(a).toBe(keccak256(toUtf8Bytes(`${SEED_FINGERPRINT_PREFIX}:123456`)));
    });

    it("changes with the seed and never collides across a sample", () => {
        const seeds = [0, 1, 2, 123456, 4294967295];
        const hashes = new Set(seeds.map(seedFingerprint));
        expect(hashes.size).toBe(seeds.length);
    });

    it("is not the bare keccak of the seed digits (the namespace is load-bearing)", () => {
        expect(seedFingerprint(42)).not.toBe(keccak256(toUtf8Bytes("42")));
    });
});

describe("shortHash", () => {
    const full = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    it("truncates to 0x + N hex digits with an ellipsis", () => {
        expect(shortHash(full, 8)).toBe("0x12345678…");
        expect(shortHash(full, 10)).toBe("0x1234567890…");
        expect(shortHash(full, 6)).toBe("0x123456…");
    });

    it("returns the whole hash when nothing is truncated", () => {
        expect(shortHash("0xabcd", 8)).toBe("0xabcd");
    });

    it("passes malformed / empty input through rather than inventing a fragment", () => {
        expect(shortHash("")).toBe("");
        expect(shortHash(undefined)).toBe("");
        expect(shortHash("not-a-hash")).toBe("not-a-hash");
    });
});

describe("isAuditHash", () => {
    it("accepts well-formed 0x hashes and rejects the rest", () => {
        expect(isAuditHash("0x1234abcd")).toBe(true);
        expect(isAuditHash("0x" + "ab".repeat(32))).toBe(true);
        expect(isAuditHash("0x12")).toBe(false);
        expect(isAuditHash("1234abcd")).toBe(false);
        expect(isAuditHash(undefined)).toBe(false);
        expect(isAuditHash(null)).toBe(false);
    });
});

describe("shortSeedFingerprint", () => {
    it("is a truncated form of the full fingerprint", () => {
        const seed = 987654321;
        expect(seedFingerprint(seed).startsWith(shortSeedFingerprint(seed, 10).replace("…", ""))).toBe(true);
    });
});

describe("hasSeedAudit", () => {
    it("is true when a seed or a replay hash is present", () => {
        expect(hasSeedAudit(0, null)).toBe(true);
        expect(hasSeedAudit(null, "0x" + "ab".repeat(32))).toBe(true);
        expect(hasSeedAudit(undefined, "0x1234abcd")).toBe(true);
    });

    it("is false when nothing auditable was recorded", () => {
        expect(hasSeedAudit(undefined, undefined)).toBe(false);
        expect(hasSeedAudit(null, null)).toBe(false);
        expect(hasSeedAudit(NaN, "0x12")).toBe(false);
        expect(hasSeedAudit(undefined, "nope")).toBe(false);
    });
});

describe("replayHashOf", () => {
    it("matches the backend verification binding (keccak256 of the UTF-8 bytes)", () => {
        const json = JSON.stringify({ v: 1, seed: 7, tickCount: 20 });
        expect(replayHashOf(json)).toBe(keccak256(toUtf8Bytes(json)));
        expect(replayHashOf(json)).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("changes when any byte of the replay changes", () => {
        const one = replayHashOf('{"seed":7}');
        const two = replayHashOf('{"seed":8}');
        expect(one).not.toBe(two);
    });
});

describe("formatSeedAuditSummary", () => {
    it("serialises provenance, seed, fingerprint and replay hash for pasting", () => {
        const replayHash = "0x" + "ab".repeat(32);
        const summary = formatSeedAuditSummary({ seed: 42, seedSource: "qrng", replayHash });

        expect(summary).toContain("Kamikaze Ball · seed audit");
        expect(summary).toContain("source: quantum RNG");
        expect(summary).toContain("seed: 42");
        expect(summary).toContain(`seed hash: ${seedFingerprint(42)}`);
        expect(summary).toContain(`replay hash: ${replayHash}`);
    });

    it("omits fields that were not recorded instead of writing blanks", () => {
        const summary = formatSeedAuditSummary({ seed: 7 });

        expect(summary).toContain("seed: 7");
        expect(summary).not.toContain("source:");
        expect(summary).not.toContain("replay hash:");
        expect(summary).not.toContain("undefined");
        expect(summary).not.toContain("null");
    });

    it("returns just the header for an empty digest", () => {
        expect(formatSeedAuditSummary({})).toBe("Kamikaze Ball · seed audit");
    });
});
