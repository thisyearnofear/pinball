import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { RunHud, type RunHudProps } from "@/game/ui/RunHud";
import { describeMood } from "@/utils/mood-display";

/** RunHud's render body is observed through work it cannot skip: formatting the
 *  drain time. The counters live in a hoisted object because vi.mock's factory
 *  is lifted above the imports. */
const counters = vi.hoisted(() => ({ formats: 0 }));
vi.mock("@/utils/score-format", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/utils/score-format")>();
    return {
        ...actual,
        formatGameScore: (score: number, kamikaze: boolean) => {
            counters.formats++;
            return actual.formatGameScore(score, kamikaze);
        },
    };
});

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

    /**
     * The readout is sampled ~20 times a second, so a sample that changes
     * nothing must not reconcile the panel. React.memo is what buys that, and
     * it is shallow: every non-primitive prop has to keep its identity while
     * its contents are unchanged, which is why GameMount memoises the mood and
     * why its state writes compare against the previous value first.
     */
    describe("re-render behaviour", () => {
        let container: HTMLDivElement;
        let root: Root;
        let rendered: RunHudProps;

        // A stand-in for GameMount: re-renders on its own schedule and hands
        // RunHud the props it currently holds.
        const Harness = ( props: RunHudProps ) => React.createElement( RunHud, props );

        const rerenderWith = ( over: Partial<RunHudProps> ) => {
            rendered = { ...rendered, ...over };
            act(() => {
                root.render( React.createElement( Harness, rendered ));
            });
        };

        beforeEach(() => {
            // Tells React that act() is legitimate here, so updates flush
            // synchronously and the format counters are deterministic.
            ( globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;
            container = document.createElement( "div" );
            document.body.appendChild( container );
            root = createRoot( container );
            counters.formats = 0;
            rendered = runHudProps();
            act(() => {
                root.render( React.createElement( Harness, rendered ));
            });
        });

        afterEach(() => {
            act(() => root.unmount());
            container.remove();
            ( globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = false;
        });

        it("should not re-render when a sample changes nothing", () => {
            const before = counters.formats;
            rerenderWith({}); // a fresh props object with equal contents
            rerenderWith({}); // ...and again on the next sampled frame
            expect(counters.formats).toBe(before);
        });

        it("should re-render when a sampled value actually moves", () => {
            const before = counters.formats;
            rerenderWith({ stability: 0.8 });
            expect(counters.formats).toBeGreaterThan(before);
        });

        it("should re-render when the mood object is rebuilt instead of memoised", () => {
            // Documents the hazard the GameMount-side useMemo exists to avoid:
            // describeMood() returns a fresh object every call, so passing it
            // straight through would defeat the memo on every single sample.
            const before = counters.formats;
            rerenderWith({ mood: describeMood("wary") });
            expect(counters.formats).toBeGreaterThan(before);
        });
    });
});
