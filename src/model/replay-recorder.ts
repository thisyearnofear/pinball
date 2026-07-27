/**
 * Deterministic run recording.
 *
 * Records the RNG seed plus every player input keyed to the fixed-timestep
 * tick counter. Together with the seeded PRNG this makes a run reproducible
 * by a future verification engine. The full replay is shipped to the backend;
 * its keccak hash travels inside the signed score metadata, binding the two.
 */

export type ReplayEventType =
    | "L+" | "L-"   // left flipper down/up
    | "R+" | "R-"   // right flipper down/up
    | "bump"        // table bump
    | "nudge"       // kamikaze tap-to-nudge (x/y = tap position)
    | "spawn"       // ball spawned
    | "drain";      // ball drained

export type ReplayEvent = {
    t: number; // engine tick
    e: ReplayEventType;
    x?: number;
    y?: number;
};

export type ReplayDigest = {
    v: 1;
    seed: number;
    table: number;
    mode: "classic" | "kamikaze";
    aiDifficulty?: string;
    tickCount: number;
    finalScore: number;
    truncated: boolean;
    events: ReplayEvent[];
    /** Flat [tick, x, y, ...] ball position samples for ghost playback. */
    trace?: number[];
};

// ~50KB cap: events are ~20 bytes serialized; hard stop instead of dropping
// oldest (a replay with a hole at the start is useless for verification).
const MAX_EVENTS = 2500;

// Position samples every 4 engine ticks (~15Hz) — smooth enough for ghost
// playback with interpolation; ~10 bytes/sample keeps 5-minute runs < 50KB.
const TRACE_INTERVAL_TICKS = 4;
const MAX_TRACE_SAMPLES = 4500;

let recording = false;
let truncated = false;
let seed = 0;
let table = 0;
let mode: "classic" | "kamikaze" = "classic";
let aiDifficulty: string | undefined;
let events: ReplayEvent[] = [];
let trace: number[] = [];
let lastTraceTick = -Infinity;

export function startReplayRecording(opts: {
    seed: number;
    table: number;
    mode: "classic" | "kamikaze";
    aiDifficulty?: string;
}): void {
    recording = true;
    truncated = false;
    seed = opts.seed;
    table = opts.table;
    mode = opts.mode;
    aiDifficulty = opts.aiDifficulty;
    events = [];
    trace = [];
    lastTraceTick = -Infinity;
}

export function recordReplayEvent(tick: number, e: ReplayEventType, x?: number, y?: number): void {
    if (!recording) return;
    if (events.length >= MAX_EVENTS) {
        truncated = true;
        return;
    }
    const event: ReplayEvent = { t: tick, e };
    if (x !== undefined) event.x = Math.round(x);
    if (y !== undefined) event.y = Math.round(y);
    events.push(event);
}

export function isReplayRecording(): boolean {
    return recording;
}

/**
 * Sample the main ball position for ghost playback. Call every engine tick;
 * the recorder downsamples internally.
 */
export function recordReplayTraceSample(tick: number, x: number, y: number): void {
    if (!recording) return;
    if (tick - lastTraceTick < TRACE_INTERVAL_TICKS) return;
    if (trace.length >= MAX_TRACE_SAMPLES * 3) return;
    lastTraceTick = tick;
    trace.push(tick, Math.round(x), Math.round(y));
}

/**
 * Finish the recording and return the digest. Returns null when nothing
 * was being recorded (e.g. practice run started before recording existed).
 */
export function finishReplayRecording(finalScore: number, tickCount: number): ReplayDigest | null {
    if (!recording) return null;
    recording = false;
    return {
        v: 1,
        seed,
        table,
        mode,
        ...(aiDifficulty ? { aiDifficulty } : {}),
        tickCount,
        finalScore,
        truncated,
        events,
        ...(trace.length ? { trace } : {}),
    };
}

export function encodeReplay(digest: ReplayDigest): string {
    return JSON.stringify(digest);
}

export function decodeReplay(encoded: string): ReplayDigest {
    return JSON.parse(encoded) as ReplayDigest;
}
