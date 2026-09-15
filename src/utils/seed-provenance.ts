/**
 * Seed provenance — where a run's RNG seed came from.
 *
 * Every run is deterministic from one seed (mulberry32) and that seed is recorded
 * in the replay digest, so its ORIGIN is auditable without weakening
 * verifiability (see docs/QUANTUM_SEEDS.md). This is the single place that turns
 * the recorded value into player-facing copy + colour, so the lobby, the
 * celebration seal and the share card never disagree.
 *
 * Copy is deliberately plain: we say where the entropy came from, never that a
 * quantum seed makes the run fairer or the score stronger.
 */

export type SeedSource = "qrng" | "csprng" | "local";

export type SeedProvenance = {
    /** Machine value as recorded in the replay (`unrecorded` when absent). */
    source: string;
    symbol: string;
    /** Uppercase chip label. */
    label: string;
    /** Sentence-case phrase for prose / share text. */
    phrase: string;
    /** Accent colour for UI + canvas. */
    color: string;
    tone: "quantum" | "server" | "device" | "unknown";
};

const QUANTUM: SeedProvenance = {
    source: "qrng",
    symbol: "⚛",
    label: "QUANTUM-SEEDED",
    phrase: "quantum RNG",
    color: "#fbbf24",
    tone: "quantum",
};

const SERVER: SeedProvenance = {
    source: "csprng",
    symbol: "◈",
    label: "SERVER ENTROPY",
    phrase: "server CSPRNG",
    color: "#67e8f9",
    tone: "server",
};

const DEVICE: SeedProvenance = {
    source: "local",
    symbol: "◇",
    label: "DEVICE ENTROPY",
    phrase: "device CSPRNG",
    color: "#9ca3af",
    tone: "device",
};

const UNKNOWN: SeedProvenance = {
    source: "unrecorded",
    symbol: "○",
    label: "PROVENANCE UNRECORDED",
    phrase: "unrecorded",
    color: "#9ca3af",
    tone: "unknown",
};

export function describeSeedProvenance(source?: string | null): SeedProvenance {
    if (source === "qrng") return QUANTUM;
    if (source === "csprng") return SERVER;
    if (source === "local") return DEVICE;
    return UNKNOWN;
}

/** One-line proof string for prose / share text; "" when provenance is unknown. */
export function seedProvenanceLine(source?: string | null): string {
    const p = describeSeedProvenance(source);
    return p.tone === "unknown" ? "" : `${p.symbol} ${p.phrase}`;
}
