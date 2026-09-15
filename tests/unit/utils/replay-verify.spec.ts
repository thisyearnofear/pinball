import { describe, it, expect } from "vitest";
import {
    parseScoreMetadata,
    signedReplayHashFromMetadata,
    verifyReplayBinding,
    verifyReplayHash,
} from "@/utils/replay-verify";
import { encodeReplay, type ReplayDigest } from "@/model/replay-recorder";
import { replayHashOf } from "@/utils/seed-audit";

const digest: ReplayDigest = {
    v: 1,
    seed: 42,
    table: 1,
    mode: "kamikaze",
    aiDifficulty: "medium",
    controlScheme: "steer",
    seedSource: "qrng",
    tickCount: 120,
    finalScore: 3500,
    truncated: false,
    events: [{ t: 0, e: "spawn" }, { t: 90, e: "drain" }],
    trace: [0, 400, 300, 4, 420, 600],
};

const hash = replayHashOf(encodeReplay(digest));

describe("parseScoreMetadata", () => {
    it("parses a JSON string payload", () => {
        expect(parseScoreMetadata('{"mode":"kamikaze","table":1}')).toEqual({ mode: "kamikaze", table: 1 });
    });

    it("accepts an already-parsed object", () => {
        expect(parseScoreMetadata({ mode: "classic" })).toEqual({ mode: "classic" });
    });

    it("returns null for empty, malformed, non-object or missing payloads", () => {
        expect(parseScoreMetadata(undefined)).toBeNull();
        expect(parseScoreMetadata(null)).toBeNull();
        expect(parseScoreMetadata("")).toBeNull();
        expect(parseScoreMetadata("   ")).toBeNull();
        expect(parseScoreMetadata("not json")).toBeNull();
        expect(parseScoreMetadata("[1,2,3]")).toBeNull();
        expect(parseScoreMetadata("42")).toBeNull();
    });
});

describe("signedReplayHashFromMetadata", () => {
    it("extracts and lowercases the committed replay hash", () => {
        const upper = "0x" + "AB".repeat(32);
        expect(signedReplayHashFromMetadata(JSON.stringify({ replayHash: upper }))).toBe(upper.toLowerCase());
    });

    it("returns null when the hash is absent or malformed", () => {
        expect(signedReplayHashFromMetadata(JSON.stringify({}))).toBeNull();
        expect(signedReplayHashFromMetadata(JSON.stringify({ replayHash: "0x12" }))).toBeNull();
        expect(signedReplayHashFromMetadata(JSON.stringify({ replayHash: 123 }))).toBeNull();
        expect(signedReplayHashFromMetadata(undefined)).toBeNull();
    });
});

describe("verifyReplayBinding", () => {
    it("matches when the metadata committed to the replay's hash", () => {
        const binding = verifyReplayBinding(digest, JSON.stringify({ mode: "kamikaze", table: 1, aiDifficulty: "medium", replayHash: hash }));
        expect(binding.status).toBe("match");
        expect(binding.actual).toBe(hash);
        expect(binding.expected).toBe(hash.toLowerCase());
        expect(binding.notes).toEqual([]);
    });

    it("mismatches when the metadata committed to a different replay", () => {
        const other = "0x" + "cd".repeat(32);
        const binding = verifyReplayBinding(digest, JSON.stringify({ replayHash: other }));
        expect(binding.status).toBe("mismatch");
        expect(binding.actual).toBe(hash);
        expect(binding.expected).toBe(other);
    });

    it("is unavailable without a usable metadata hash (never a false pass)", () => {
        for (const metadata of [undefined, null, "", "{}", "not json", JSON.stringify({ replayHash: "0x12" })]) {
            const binding = verifyReplayBinding(digest, metadata);
            expect(binding.status).toBe("unavailable");
            expect(binding.expected).toBeNull();
            expect(binding.actual).toBe(hash);
        }
    });

    it("recomputes the hash from the replay rather than trusting a supplied one", () => {
        // A recorded hash that disagrees is reported as drift, but the check
        // still uses the recomputed value.
        const binding = verifyReplayBinding(digest, JSON.stringify({ replayHash: hash }), "0x" + "ef".repeat(32));
        expect(binding.status).toBe("match");
        expect(binding.actual).toBe(hash);
        expect(binding.notes.some((n) => n.includes("recorded replay hash differs"))).toBe(true);
    });

    it("compares hashes case-insensitively", () => {
        const upper = "0x" + hash.slice(2).toUpperCase();
        const binding = verifyReplayBinding(digest, JSON.stringify({ replayHash: upper }), upper);
        expect(binding.status).toBe("match");
        expect(binding.notes).toEqual([]);
    });

    it("notes metadata fields that disagree with the replay", () => {
        const binding = verifyReplayBinding(
            digest,
            JSON.stringify({ mode: "classic", table: 7, aiDifficulty: "hard", replayHash: hash }),
        );
        expect(binding.status).toBe("match");
        expect(binding.notes).toHaveLength(3);
        expect(binding.notes.join(" | ")).toContain('metadata mode "classic"');
        expect(binding.notes.join(" | ")).toContain("metadata table 7");
        expect(binding.notes.join(" | ")).toContain('metadata AI "hard"');
    });

    it("does not note an AI mismatch when the replay recorded no difficulty", () => {
        const noAi = { ...digest, aiDifficulty: undefined };
        const binding = verifyReplayBinding(noAi, JSON.stringify({ aiDifficulty: "hard" }));
        expect(binding.notes).toEqual([]);
    });
});

describe("verifyReplayHash", () => {
    const metadata = JSON.stringify({ mode: "kamikaze", table: 1, replayHash: hash });

    it("checks a precomputed payload hash (ghost replays) without re-encoding", () => {
        const binding = verifyReplayHash(hash, metadata, null, digest);
        expect(binding.status).toBe("match");
        expect(binding.actual).toBe(hash);
        expect(binding.expected).toBe(hash.toLowerCase());
    });

    it("matches the digest-based path for the same replay", () => {
        expect(verifyReplayHash(hash, metadata, null, digest)).toEqual(verifyReplayBinding(digest, metadata));
    });

    it("is unavailable without metadata and never a pass", () => {
        expect(verifyReplayHash(hash, undefined, null, digest).status).toBe("unavailable");
        expect(verifyReplayHash(hash, "{}", null, digest).status).toBe("unavailable");
    });

    it("reports a mismatch for a different payload hash", () => {
        const binding = verifyReplayHash("0x" + "cd".repeat(32), metadata, null, digest);
        expect(binding.status).toBe("mismatch");
        expect(binding.expected).toBe(hash.toLowerCase());
    });

    it("still reports hash drift without a digest to compare fields against", () => {
        const binding = verifyReplayHash(hash, metadata, "0x" + "ef".repeat(32));
        expect(binding.status).toBe("match");
        expect(binding.notes).toHaveLength(1);
        expect(binding.notes[0]).toContain("recorded replay hash differs");
    });
});
