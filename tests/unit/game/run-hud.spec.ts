import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RunHud, type RunHudProps } from "@/game/ui/RunHud";
import { describeMood } from "@/utils/mood-display";

/**
 * The readout has two layouts: an overlay panel on desktop and a slim strip on
 * phones. The strip exists because the overlay is ~200×300 and a phone table is
 * ~358×477 — so the thing that must never regress is the strip growing back
 * into the overlay's full row list.
 */
function runHudProps(over: Partial<RunHudProps> = {}): RunHudProps {
    return {
        kamikazeActive: true,
        hud: { score: 4310, balls: 2, multiplier: 1 },
        mood: describeMood("wary"),
        bestDrainMs: 3980,
        drainStreak: 0,
        penaltyBumper: 0,
        penaltyTrigger: 0,
        stability: 0.42,
        machineSaving: false,
        momentum: 0.6,
        storedMunition: null,
        underworldCharge: 0,
        chargePower: null,
        powerUps: [],
        shotCalling: false,
        coached: false,
        paused: false,
        variant: "overlay",
        ...over,
    };
}

const html = (over: Partial<RunHudProps> = {}) =>
    renderToStaticMarkup(React.createElement(RunHud, runHudProps(over)));

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("RunHud", () => {
    it("leads with the drain time and MAMORU's named state on both layouts", () => {
        const overlay = html({ variant: "overlay" });
        const strip = html({ variant: "strip" });

        expect(overlay).toContain("4.3s"); // score 4310ms as a drain time
        expect(strip).toContain("4.3s");
        expect(overlay).toContain("守 MAMORU · WARY");
        expect(strip).toContain("守 WARY"); // the strip drops the latin name, not the state
        for (const markup of [overlay, strip]) {
            // The state has to be explainable, or the rubber-banding reads as
            // the game quietly cheating.
            expect(markup).toContain(describeMood("wary").meaning);
        }
    });

    it("spends one petal per ball left, and names the ball in the session line", () => {
        const markup = html();
        expect(count(markup, "🌸")).toBe(3); // BALLS_PER_GAME, faded ones included
        expect(markup).toContain("BEST OF 3 · BALL 2");
        expect(markup).toContain("BEST 4.0s");
    });

    it("keeps the phone strip to the headline rows the overlay spends space on", () => {
        // First ball, so the overlay's cheat-sheet row is actually in play.
        const hud = { score: 4310, balls: 3, multiplier: 1 };
        const overlay = html({ hud, variant: "overlay" });
        const strip = html({ hud, variant: "strip" });

        // The overlay's labelled meters and first-ball cheat-sheet are exactly
        // the rows a 358px-wide table cannot afford.
        expect(overlay).toContain("MOMENTUM");
        expect(overlay).toContain("HOLD charge · SWIPE↓ dive · SWIPE↑ tilt-lock");
        expect(strip).not.toContain("MOMENTUM");
        expect(strip).not.toContain("HOLD charge");

        // ...but it still carries the numbers, not just the vibes.
        expect(strip).toContain("BALL 1/3");
    });

    it("collapses the penalty breakdown to one line on the strip", () => {
        const taxed = { penaltyBumper: 3, penaltyTrigger: 1 };
        const overlay = html({ ...taxed, variant: "overlay" });
        const strip = html({ ...taxed, variant: "strip" });

        expect(overlay).toContain("番兵 bumpers ×3");
        expect(overlay).toContain("門 trigger groups ×1");
        expect(strip).not.toContain("番兵 bumpers");
        // 3×150ms + 1×750ms, as a single terse figure.
        expect(strip).toContain("番兵×3 門×1 · +1.2s");
    });

    it("renders live power-ups inline on the strip instead of the desktop column", () => {
        const powerUps = [{ name: "SAVE", side: "player" as const, remainingMs: 2500 }];
        const strip = html({ variant: "strip", powerUps });
        const overlay = html({ variant: "overlay", powerUps });

        expect(strip).toContain("YOU · SAVE");
        // The overlay gets these from GameMount's own top-right column.
        expect(overlay).not.toContain("YOU · SAVE");
    });

    it("says what the player can do right now, ahead of the standing hint", () => {
        const hud = { score: 4310, balls: 3, multiplier: 1 };
        const overlay = html({ hud, storedMunition: "TILT LOCK", variant: "overlay" });
        const strip = html({ hud, storedMunition: "TILT LOCK", variant: "strip" });

        for (const markup of [overlay, strip]) {
            expect(markup).toContain("TILT LOCK banked — double-tap to deploy");
        }
        // The banked line replaces the cheat-sheet rather than stacking under it.
        expect(overlay).not.toContain("HOLD charge");
    });

    it("falls back to score, balls and multiplier outside kamikaze mode", () => {
        const markup = html({ kamikazeActive: false });
        expect(markup).toContain("Score: 4310");
        expect(markup).toContain("Balls: 2");
        expect(markup).toContain("Multiplier: 1x");
        expect(markup).not.toContain("MAMORU");
        expect(markup).not.toContain("🌸");
    });

    it("surfaces a paused run without losing the readout", () => {
        expect(html({ paused: true })).toContain("Paused");
        expect(html({ paused: false })).not.toContain("Paused");
    });
});
