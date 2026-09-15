import type { MachineMood } from "@/definitions/game";

/**
 * Palette per mood. Calm reads as the classic adversary red; as MAMORU
 * destabilizes the palette shifts toward amber (desperate), white-hot
 * (enraged), and dim indigo (grieving).
 */
export const MOOD_COLORS: Record<MachineMood, { color: string; border: string }> = {
    calm:      { color: "#ff4444", border: "rgba(255,68,68,0.4)" },
    smug:      { color: "#ff6b6b", border: "rgba(255,107,107,0.5)" },
    wary:      { color: "#fbbf24", border: "rgba(251,191,36,0.5)" },
    desperate: { color: "#f59e0b", border: "rgba(245,158,11,0.6)" },
    enraged:   { color: "#ffffff", border: "rgba(255,255,255,0.8)" },
    grieving:  { color: "#818cf8", border: "rgba(129,140,248,0.5)" },
};

export type MoodDisplay = {
    /** Uppercase state word for the HUD. */
    label: string;
    /** One line of what the state means — the "why" behind the difficulty. */
    meaning: string;
    color: string;
    border: string;
};

/**
 * Human-readable copy for a mood state.
 *
 * The machine's difficulty is rubber-banded, so without a name attached it
 * reads as the game cheating. Naming the state — and saying why MAMORU is in it
 * — turns the same escalation into legible character: it isn't getting harder,
 * it's getting *scared*.
 */
export function describeMood(mood: string | null | undefined): MoodDisplay {
    const key = isMood(mood) ? mood : "calm";
    const palette = MOOD_COLORS[key];
    return { label: MOOD_LABELS[key], meaning: MOOD_MEANINGS[key], ...palette };
}

const MOOD_LABELS: Record<MachineMood, string> = {
    calm: "CALM",
    smug: "SMUG",
    wary: "WARY",
    desperate: "DESPERATE",
    enraged: "ENRAGED",
    grieving: "GRIEVING",
};

const MOOD_MEANINGS: Record<MachineMood, string> = {
    calm: "Reading the table. Full grip on the flippers.",
    smug: "It just caught one — and it knows.",
    wary: "You keep coming back. It is watching you now.",
    desperate: "Over-committing to saves. Holds the flippers too long.",
    enraged: "White-hot and sloppy — accuracy is dropping.",
    grieving: "The ball is gone. It is not fighting any more.",
};

function isMood(mood: string | null | undefined): mood is MachineMood {
    return typeof mood === "string" && mood in MOOD_COLORS;
}
