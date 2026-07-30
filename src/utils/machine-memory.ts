/**
 * B1 — Machine memory (persistent adversary). See docs/IMMERSION_SPEC.md.
 *
 * MAMORU remembers you across sessions. This store drives greeting and habit
 * taunts only — hard rule 2: memory talks, never touches. Nothing here may
 * influence physics or AI in a way that isn't reconstructible from the seeded
 * run, or replays stop being verifiable. The selectors are pure so they test
 * without a browser; load/save sit on the shared `ps_data` blob.
 */
import { getFromStorage, setInStorage } from "./local-storage";

const MEMORY_KEY = "machine_memory";

/** The nemesis threshold: a best drain under this earns the machine's dread. */
export const NEMESIS_DRAIN_MS = 6000;
/** Habit call-outs need at least this many nudges before the machine reads you. */
export const HABIT_MIN_NUDGES = 10;
/** A bucket must be at least this share of nudges to be "predictable". */
export const HABIT_DOMINANCE = 0.6;

export type MachineHabits = {
    left: number;
    center: number;
    right: number;
    dives: number;
    tiltLocks: number;
};

export type MachineMemory = {
    encounters: number;
    firstSeenDay: string;
    lastSeenDay: string;
    bestPlayerDrainMs: number | null;
    lastRunMs: number | null;
    habits: MachineHabits;
};

export function emptyHabits(): MachineHabits {
    return { left: 0, center: 0, right: 0, dives: 0, tiltLocks: 0 };
}

export function emptyMemory(): MachineMemory {
    const today = dayKey();
    return {
        encounters: 0,
        firstSeenDay: today,
        lastSeenDay: today,
        bestPlayerDrainMs: null,
        lastRunMs: null,
        habits: emptyHabits(),
    };
}

function dayKey(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Load memory, defensively merged over the empty shape (forward-compatible). */
export function loadMemory(): MachineMemory {
    const raw = getFromStorage(MEMORY_KEY);
    if (!raw) return emptyMemory();
    try {
        const parsed = JSON.parse(raw);
        const base = emptyMemory();
        return {
            ...base,
            ...parsed,
            habits: { ...base.habits, ...(parsed.habits ?? {}) },
        };
    } catch {
        return emptyMemory();
    }
}

export function saveMemory(memory: MachineMemory): boolean {
    return setInStorage(MEMORY_KEY, JSON.stringify(memory));
}

/**
 * Record a completed run (pure). Bumps encounters, stamps the day, and folds
 * in the run's drain time + habits. `drainMs` is null for a run with no drain.
 */
export function recordRunResult(
    memory: MachineMemory,
    drainMs: number | null,
    runHabits: MachineHabits,
): MachineMemory {
    const today = dayKey();
    const encounters = memory.encounters + 1;
    const firstSeenDay = memory.encounters === 0 ? today : memory.firstSeenDay;
    let bestPlayerDrainMs = memory.bestPlayerDrainMs;
    if (drainMs !== null && (bestPlayerDrainMs === null || drainMs < bestPlayerDrainMs)) {
        bestPlayerDrainMs = drainMs;
    }
    return {
        encounters,
        firstSeenDay,
        lastSeenDay: today,
        bestPlayerDrainMs,
        lastRunMs: drainMs ?? memory.lastRunMs,
        habits: {
            left: memory.habits.left + runHabits.left,
            center: memory.habits.center + runHabits.center,
            right: memory.habits.right + runHabits.right,
            dives: memory.habits.dives + runHabits.dives,
            tiltLocks: memory.habits.tiltLocks + runHabits.tiltLocks,
        },
    };
}

/**
 * The greeting line for the start of a run (pure). Re-skinned by rank (B2):
 * the machine's perception of you scales with your station — dismissive at
 * low ranks, wary mid, strained respect high, and silence at max rank (the
 * punchline: it no longer needs to speak). First meeting and nemesis dread
 * still cut through. `rankName` is the player's current rank (e.g. "Gale").
 */
export function greetingLine(memory: MachineMemory, rankName?: string): string {
    if (isSilentRank(rankName)) {
        return "…"; // silence-as-respect: the machine no longer greets its equal
    }
    if (memory.encounters === 0) {
        return "A new killer. I am 守. I will not let you.";
    }
    if (memory.bestPlayerDrainMs !== null && memory.bestPlayerDrainMs < NEMESIS_DRAIN_MS) {
        return `${(memory.bestPlayerDrainMs / 1000).toFixed(1)}s. I dream about that number.`;
    }
    const address = rankAddress(rankName);
    return memory.lastRunMs !== null
        ? `${address} Last time: ${(memory.lastRunMs / 1000).toFixed(1)}s.`
        : address;
}

// ── B2: relationship-skinned ranks ───────────────────────────────
// The machine's address scales with your rank tier. Same XP math; the
// delivery is what changes. Max rank (Kamikaze) earns silence.

export type RankTier = "dismissive" | "wary" | "respect" | "silence";

const RANK_TIERS: Record<string, RankTier> = {
    Breeze: "dismissive",
    Tailwind: "dismissive",
    Gale: "wary",
    Storm: "wary",
    Tempest: "respect",
    Kamikaze: "silence",
};

export function rankTier(rankName: string | undefined): RankTier {
    return (rankName && RANK_TIERS[rankName]) || "dismissive";
}

export function isSilentRank(rankName: string | undefined): boolean {
    return rankTier(rankName) === "silence";
}

const RANK_ADDRESSES: Record<RankTier, string> = {
    dismissive: "A breeze. Barely worth saving against.",
    wary: "Storm-class. Noted.",
    respect: "I studied your replays. All of them.",
    silence: "…",
};

export function rankAddress(rankName: string | undefined): string {
    return RANK_ADDRESSES[rankTier(rankName)];
}

/** Short, subdued save line for when the machine respects you (max rank). */
export function subduedSaveTaunt(): string {
    return "…not yet.";
}

export type HabitLabel = "left" | "center" | "right";

/**
 * The dominant nudge direction, or null when the player isn't yet readable
 * (fewer than HABIT_MIN_NUDGES nudges, or no bucket reaches HABIT_DOMINANCE).
 */
export function dominantHabit(habits: MachineHabits): HabitLabel | null {
    const total = habits.left + habits.center + habits.right;
    if (total < HABIT_MIN_NUDGES) return null;
    const buckets: [HabitLabel, number][] = [
        ["left", habits.left],
        ["center", habits.center],
        ["right", habits.right],
    ];
    let best: HabitLabel | null = null;
    let bestCount = -1;
    for (const [label, count] of buckets) {
        if (count > bestCount) {
            best = label;
            bestCount = count;
        }
    }
    return best !== null && bestCount / total >= HABIT_DOMINANCE ? best : null;
}

const HABIT_TAUNTS: Record<HabitLabel, string> = {
    left: "Left again? Predictable.",
    center: "Down the middle. How obvious.",
    right: "Right. Always right. I see you.",
};

export function habitTaunt(label: HabitLabel): string {
    return HABIT_TAUNTS[label];
}
