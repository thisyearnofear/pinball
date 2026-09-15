/**
 * Seed audit handles — compact, recomputable fingerprints for a run.
 *
 * A run is fully determined by its seed (`mulberry32`, see src/utils/rng.ts) and
 * that seed lives inside the replay digest, so anyone viewing a rival's ghost or
 * replay can recompute these handles from the digest alone. That is the whole
 * point: they make the run's provenance *checkable* without weakening the
 * verifier (see docs/QUANTUM_SEEDS.md).
 *
 * Two distinct handles are exposed, and they are NOT interchangeable:
 *
 * - `seedFingerprint` — a namespaced keccak of the seed. A derived, human-sized
 *   handle for comparing seeds across runs. It is not what the chain signs.
 * - `replayHash` (passed in, not computed here) — keccak256 of the encoded replay
 *   JSON. This is the value bound into the signed score metadata, so it is the
 *   handle that actually ties a replay to a scored submission.
 *
 * The UI renders both with distinct labels so the readout never overstates what
 * a seed hash proves.
 */

import { keccak256, toUtf8Bytes } from "ethers";
import { describeSeedProvenance } from "./seed-provenance";

/** Namespace + version so a seed hash can never be confused with another keccak. */
export const SEED_FINGERPRINT_PREFIX = "KB_SEED:v1";

/** The exact bytes hashed for a seed fingerprint — exported so it is testable. */
export function seedFingerprintPreimage(seed: number): string {
    return `${SEED_FINGERPRINT_PREFIX}:${seed}`;
}

/** Full `0x`-prefixed keccak256 of the seed. Deterministic for a given seed. */
export function seedFingerprint(seed: number): string {
    return keccak256(toUtf8Bytes(seedFingerprintPreimage(seed)));
}

/**
 * Short display form of an `0x` hash: `0x` + the first `hexChars` hex digits,
 * with an ellipsis when truncated. Passes malformed input through unchanged so
 * callers never render a fabricated-looking fragment.
 */
export function shortHash(hash: string | undefined | null, hexChars = 8): string {
    if (!hash) return "";
    const m = /^0x([0-9a-fA-F]+)$/.exec(hash.trim());
    if (!m) return hash;
    const body = m[1];
    return body.length > hexChars ? `0x${body.slice(0, hexChars)}…` : hash;
}

/** Short display form of a seed fingerprint (e.g. `0x1a2b3c4d…`). */
export function shortSeedFingerprint(seed: number, hexChars = 8): string {
    return shortHash(seedFingerprint(seed), hexChars);
}

/** True when a value looks like a well-formed `0x` hash (for gating the UI). */
export function isAuditHash(value: string | undefined | null): boolean {
    return typeof value === "string" && /^0x[0-9a-fA-F]{8,}$/.test(value.trim());
}

/**
 * keccak256 of an encoded replay JSON — the exact binding the backend verifies
 * (`keccak256(toUtf8Bytes(replayJson))`) and the score signature commits to.
 * Recomputing it here is what lets a viewer tie a ghost to a scored run.
 */
export function replayHashOf(encodedReplay: string): string {
    return keccak256(toUtf8Bytes(encodedReplay));
}

/**
 * Whether a digest carries anything worth showing in an audit readout — a
 * recorded seed or a replay hash. Lets callers skip the whole block (and its
 * padding) for legacy/practice digests instead of rendering an empty shell.
 */
export function hasSeedAudit(seed?: number | null, replayHash?: string | null): boolean {
    return (typeof seed === "number" && Number.isFinite(seed)) || isAuditHash(replayHash);
}

/**
 * Paste-ready audit block for a run: one `field: value` per line, only for the
 * values actually recorded. This is what "copy" yields — a rival can paste it
 * straight back to reproduce/verify the run.
 */
export function formatSeedAuditSummary(opts: {
    seed?: number | null;
    seedSource?: string | null;
    replayHash?: string | null;
}): string {
    const lines = ["Kamikaze Ball · seed audit"];
    const provenance = describeSeedProvenance(opts.seedSource);
    if (provenance.tone !== "unknown") lines.push(`source: ${provenance.phrase}`);
    if (typeof opts.seed === "number" && Number.isFinite(opts.seed)) {
        lines.push(`seed: ${opts.seed}`);
        lines.push(`seed hash: ${seedFingerprint(opts.seed)}`);
    }
    if (isAuditHash(opts.replayHash)) lines.push(`replay hash: ${opts.replayHash}`);
    return lines.join("\n");
}
