import { describe, it, expect } from "vitest";
import { describeMood, MOOD_COLORS } from "@/utils/mood-display";
import type { MachineMood } from "@/definitions/game";

const MOODS: MachineMood[] = ["calm", "smug", "wary", "desperate", "enraged", "grieving"];

describe("describeMood", () => {
    it("names the state in the HUD and explains why it is in it", () => {
        const calm = describeMood("calm");
        expect(calm.label).toBe("CALM");
        expect(calm.meaning).toContain("Reading the table");
        expect(calm.color).toBe(MOOD_COLORS.calm.color);
        expect(calm.border).toBe(MOOD_COLORS.calm.border);
    });

    it("falls back to calm for an unrecorded or unknown mood (never throws)", () => {
        for (const value of [undefined, null, "", "furious", "CALM"]) {
            const display = describeMood(value as string | null | undefined);
            expect(display.label).toBe("CALM");
            expect(display.color).toBe(MOOD_COLORS.calm.color);
        }
    });

    it("gives every mood a distinct label, meaning and colour", () => {
        const displays = MOODS.map((m) => describeMood(m));
        const labels = displays.map((d) => d.label);
        const meanings = displays.map((d) => d.meaning);
        const colors = displays.map((d) => d.color);
        expect(new Set(labels).size).toBe(MOODS.length);
        expect(new Set(meanings).size).toBe(MOODS.length);
        expect(new Set(colors).size).toBe(MOODS.length);
    });

    it("keeps every label short enough for a phone-sized HUD", () => {
        for (const mood of MOODS) {
            const { label, meaning } = describeMood(mood);
            expect(label).toBe(label.toUpperCase());
            expect(label.length).toBeLessThanOrEqual(10);
            expect(meaning.length).toBeGreaterThan(0);
        }
    });

    it("escalates: the states explain why the machine is getting harder to beat", () => {
        expect(describeMood("wary").meaning).toContain("watching");
        expect(describeMood("desperate").meaning).toContain("Over-committing");
        expect(describeMood("enraged").meaning).toContain("accuracy is dropping");
        expect(describeMood("grieving").meaning).toContain("not fighting");
    });
});
