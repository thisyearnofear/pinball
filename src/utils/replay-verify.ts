/**
 * Replay ↔ score-metadata binding check.
 *
 * The backend verifies `keccak256(utf8Bytes(replayJson))` against the
 * `replayHash` carried inside the signed score metadata before it signs anything
 * (`backend/src/lib/replay-verifier.ts`, failure `HASH_MISMATCH`). This module
 * performs the *same* comparison on the client so a viewer can check the replay
 * they are watching against the payload that was actually submitted.
 *
 * The replay's hash is always recomputed here from the digest being viewed — we
 * never trust a supplied hash as the basis of the check. The metadata's hash is
 * what the check compares against; when no metadata is available (a practice
 * run, or a legacy digest) the result is honestly `unavailable`, not a pass.
 */

import type { ReplayDigest } from "@/model/replay-recorder";
import { encodeReplay } from "@/model/replay-recorder";
import { isAuditHash, replayHashOf } from "./seed-audit";

/** The subset of the signed score metadata this check reads. */
export type ScoreMetadata = {
    replayHash?: string;
    mode?: string;
    table?: number;
    aiDifficulty?: string;
    [key: string]: unknown;
};

/** Parse a score metadata payload (JSON string or object) leniently. */
export function parseScoreMetadata(metadata?: string | ScoreMetadata | null): ScoreMetadata | null {
    if (!metadata) return null;
    if (typeof metadata === "string") {
        const trimmed = metadata.trim();
        if (!trimmed) return null;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as ScoreMetadata;
            }
            return null;
        } catch {
            return null;
        }
    }
    return typeof metadata === "object" ? metadata : null;
}

/** The replay hash a score metadata payload committed to; null when absent/malformed. */
export function signedReplayHashFromMetadata(metadata?: string | ScoreMetadata | null): string | null {
    const hash = parseScoreMetadata(metadata)?.replayHash;
    return isAuditHash(hash) ? (hash as string).toLowerCase() : null;
}

export type ReplayBindingStatus = "match" | "mismatch" | "unavailable";

export type ReplayBinding = {
    status: ReplayBindingStatus;
    /** keccak256 recomputed from the replay being viewed. */
    actual: string;
    /** Hash recorded in the score metadata; null when there is nothing to check. */
    expected: string | null;
    /** Human-readable warnings (field inconsistencies, recorded-hash drift). */
    notes: string[];
};

/**
 * Compare an already-computed replay hash against the hash the score metadata
 * committed to. Used for ghost replays, where the hash of the *stored payload*
 * is the true submission binding (re-encoding the decoded digest is not assumed
 * to reproduce it byte-for-byte).
 *
 * @param replay Optional digest, used only for field-consistency notes.
 * @param recordedHash Optional hash the app recorded for this replay. A mismatch
 *   against the checked value is reported as a note — the checked value is still
 *   what the binding check uses.
 */
export function verifyReplayHash(
    actualHash: string,
    metadata?: string | ScoreMetadata | null,
    recordedHash?: string | null,
    replay?: ReplayDigest | null,
): ReplayBinding {
    const expected = signedReplayHashFromMetadata(metadata);
    const notes = collectNotes(replay ?? null, parseScoreMetadata(metadata), recordedHash, actualHash);
    const status: ReplayBindingStatus = !expected
        ? "unavailable"
        : actualHash.toLowerCase() === expected
          ? "match"
          : "mismatch";
    return { status, actual: actualHash, expected, notes };
}

/**
 * Compare the hash of `replay` against the hash the score metadata committed to.
 *
 * @param recordedHash Optional hash the app recorded for this replay. A mismatch
 *   against the recomputed value is reported as a note — the recomputed value is
 *   still what the binding check uses.
 */
export function verifyReplayBinding(
    replay: ReplayDigest,
    metadata?: string | ScoreMetadata | null,
    recordedHash?: string | null,
): ReplayBinding {
    return verifyReplayHash(replayHashOf(encodeReplay(replay)), metadata, recordedHash, replay);
}

function collectNotes(
    replay: ReplayDigest | null,
    metadata: ScoreMetadata | null,
    recordedHash: string | null | undefined,
    actual: string,
): string[] {
    const notes: string[] = [];
    if (isAuditHash(recordedHash) && (recordedHash as string).toLowerCase() !== actual.toLowerCase()) {
        notes.push("recorded replay hash differs from the recomputed hash");
    }
    if (!metadata) return notes;

    // Field-consistency notes need the digest; the hash check does not.
    if (!replay) return notes;

    if (typeof metadata.mode === "string" && metadata.mode !== replay.mode) {
        notes.push(`metadata mode "${metadata.mode}" ≠ replay mode "${replay.mode}"`);
    }
    if (typeof metadata.table === "number" && metadata.table !== replay.table) {
        notes.push(`metadata table ${metadata.table} ≠ replay table ${replay.table}`);
    }
    if (
        typeof metadata.aiDifficulty === "string" &&
        replay.aiDifficulty &&
        metadata.aiDifficulty !== replay.aiDifficulty
    ) {
        notes.push(`metadata AI "${metadata.aiDifficulty}" ≠ replay AI "${replay.aiDifficulty}"`);
    }
    return notes;
}
