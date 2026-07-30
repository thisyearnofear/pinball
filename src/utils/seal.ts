/**
 * Hash-sealed verdict stamp (Immersion A3).
 *
 * The north star is a *verifiable arcade*; this makes the proof visible. The
 * kanji verdict carries a hanko (印) seal derived from the keccak256 hash of
 * the run's replay — so the stamp literally IS the proof. Every player's seal
 * is unique and verifiable: the fragment is the hash's first four hex chars,
 * and the ring's imperfection is derived from the hash too, so a sealed run
 * and its replay are bound into one aesthetic object no one can fake.
 *
 * See docs/IMMERSION_SPEC.md (A3).
 */

export type Seal = {
    /** First four hex chars of the replay hash (e.g. "a6f3"). */
    fragment: string;
    /** 0–4 index selecting one of five hanko ring imperfections. */
    ring: number;
};

/**
 * The vermillion used for the hanko ring, shared by the DOM overlay and the
 * canvas share card so the seal reads identically everywhere. (#e34234)
 */
export const SEAL_VERMILLION = "#e34234";

/**
 * Five hand-tuned ring rotations (degrees) giving each seal a slightly
 * hand-stamped, imperfect feel — selected deterministically from the hash.
 */
export const SEAL_RING_ROTATIONS = [-4, -1.5, 2, 4.5, -3];

export function sealRotation(ring: number): number {
    return SEAL_RING_ROTATIONS[((ring % 5) + 5) % 5];
}

/**
 * Derive a seal from a replay hash. Pure and deterministic. Returns null for
 * a missing or malformed hash (e.g. an unsealed practice run with no
 * recording) — the absence is itself meaningful: the UI renders an outline
 * ring with "unsealed · practice".
 */
export function sealFromReplayHash(hash: string | undefined | null): Seal | null {
    if (!hash || !/^0x[0-9a-fA-F]{8,}$/.test(hash)) return null;
    const fragment = hash.slice(2, 6).toLowerCase();
    const ring = parseInt(hash.slice(2, 4), 16) % 5;
    return { fragment, ring };
}
