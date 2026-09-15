/**
 * Seed provenance — where a run's RNG seed came from.
 *
 * Every run is deterministic from one seed (mulberry32) and that seed is recorded
 * in the replay digest, so its ORIGIN is auditable without weakening
 * verifiability (see docs/QUANTUM_SEEDS.md). This is the single place that turns
 * the recorded value into player-facing copy + colour, so the lobby, the
 * celebration seal and the share card never disagree.
 *
 * Copy is deliberately plain and neutral-positive: we say where the entropy came
 * from, never that a quantum seed makes the run fairer or the score stronger —
 * and a source we did not label reads as a fact, not as something missing.
 */

export type SeedSource = "qrng" | "csprng" | "local";

export type SeedProvenance = {
    /** Machine value as recorded in the replay (`unrecorded` = source unlabelled). */
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

/**
 * A run whose seed *origin label* was not recorded (practice/legacy digests).
 *
 * The seed itself IS on record here — only its source is unlabelled — so this
 * state must read as a neutral fact, never as a warning. The default state of an
 * audit surface is the state most players will see first, and a trust feature
 * that opens on "unrecorded"/"unverified" undercuts its own purpose.
 */
const RECORDED: SeedProvenance = {
    source: "unrecorded",
    symbol: "◆",
    label: "SEED ON RECORD",
    phrase: "recorded at run start",
    color: "#a5b4fc",
    tone: "unknown",
};

export function describeSeedProvenance(source?: string | null): SeedProvenance {
    if (source === "qrng") return QUANTUM;
    if (source === "csprng") return SERVER;
    if (source === "local") return DEVICE;
    return RECORDED;
}

/** One-line proof string for prose / share text; "" when the source is unlabelled. */
export function seedProvenanceLine(source?: string | null): string {
    const p = describeSeedProvenance(source);
    return p.tone === "unknown" ? "" : `${p.symbol} ${p.phrase}`;
}
