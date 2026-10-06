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

export type SeedSource = "qrng" | "moth-qpu" | "moth-emu" | "csprng" | "local";

/**
 * Public provenance for a MOTH comet-qrng-v1 seed: the job and beacon pulse it
 * came from. Recorded in the replay digest beside the seed (so the replay hash
 * commits to it) — but it is a *claim* the verifier does not cross-check with
 * MOTH; anyone with MOTH access can look the job up.
 */
export type SeedAttestation = {
    provider: "moth";
    engine?: string;
    /** "emu" = Aer simulator; "qpu" = quantum hardware. */
    mode: "emu" | "qpu";
    jobId: string;
    /** Beacon pulse hash (64 hex chars, no 0x). */
    pulseHash?: string;
    /** Device that produced the outcomes (`aer` for emu, e.g. `ibm_torino`). */
    backend?: string;
    /** CHSH Bell witness: violated the classical bound at 3σ. */
    bellViolation?: boolean;
};

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const HEX64 = /^[0-9a-f]{64}$/i;

/**
 * Accept an attestation from the wire or a stored replay only if it is
 * well-formed; drop anything else rather than render untrusted strings.
 */
export function sanitizeSeedAttestation(value: unknown): SeedAttestation | undefined {
    if (!value || typeof value !== "object") return undefined;
    const v = value as Record<string, unknown>;
    if (v.provider !== "moth") return undefined;
    if (v.mode !== "emu" && v.mode !== "qpu") return undefined;
    if (typeof v.jobId !== "string" || !SAFE_ID.test(v.jobId)) return undefined;
    return {
        provider: "moth",
        ...(typeof v.engine === "string" && SAFE_ID.test(v.engine) ? { engine: v.engine } : {}),
        mode: v.mode,
        jobId: v.jobId,
        ...(typeof v.pulseHash === "string" && HEX64.test(v.pulseHash) ? { pulseHash: v.pulseHash.toLowerCase() } : {}),
        ...(typeof v.backend === "string" && SAFE_ID.test(v.backend) ? { backend: v.backend } : {}),
        ...(typeof v.bellViolation === "boolean" ? { bellViolation: v.bellViolation } : {}),
    };
}

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
    tone: "quantum" | "simulator" | "server" | "device" | "unknown";
};

const QUANTUM: SeedProvenance = {
    source: "qrng",
    symbol: "⚛",
    label: "QUANTUM-SEEDED",
    phrase: "quantum RNG",
    color: "#fbbf24",
    tone: "quantum",
};

/** MOTH comet-qrng-v1 on quantum hardware (the result reported a real device). */
const QPU: SeedProvenance = {
    source: "moth-qpu",
    symbol: "⚛",
    label: "QPU-SEEDED",
    phrase: "quantum hardware (MOTH QPU)",
    color: "#fb923c",
    tone: "quantum",
};

/**
 * MOTH comet-qrng-v1 in emu mode: the same circuit sampled on the Aer
 * simulator. Classical output — it must never read as hardware-quantum.
 */
const SIMULATED: SeedProvenance = {
    source: "moth-emu",
    symbol: "◎",
    label: "SIMULATED QRNG",
    phrase: "quantum-circuit simulator (MOTH emu)",
    color: "#f0abfc",
    tone: "simulator",
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
    if (source === "moth-qpu") return QPU;
    if (source === "moth-emu") return SIMULATED;
    if (source === "csprng") return SERVER;
    if (source === "local") return DEVICE;
    return RECORDED;
}

/** One-line proof string for prose / share text; "" when the source is unlabelled. */
export function seedProvenanceLine(source?: string | null): string {
    const p = describeSeedProvenance(source);
    return p.tone === "unknown" ? "" : `${p.symbol} ${p.phrase}`;
}
