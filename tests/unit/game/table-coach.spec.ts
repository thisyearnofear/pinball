import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
    TableCoach,
    CoachReplayChip,
    consumeCoachReplayClick,
    coachChipTransition,
    COACH_HOLD_MS,
    type CoachChipEvent,
    type CoachChipState,
} from "@/game/ui/TableCoach";
import { coachScript } from "@/config/table-coach";

const rule = coachScript("kamikaze", false)[0];
const tax = coachScript("kamikaze", false)[1];

const html = (cue = rule) => renderToStaticMarkup(React.createElement(TableCoach, { cue, onDismiss: () => {} }));

describe("TableCoach — teaches on the table, never blocks it", () => {
    it("renders the rule and the winning move as text on the playfield", () => {
        const markup = html();
        expect(markup).toContain("HOW TO WIN");
        expect(markup).toContain("SAVE");
        expect(markup).toContain("DRAIN");
        expect(markup).toContain("DIVE");
        // The kanji mark and the copy share one card; there is nothing to page.
        expect(markup).toContain("神風");
    });

    it("is transparent to taps, so a tip can never eat the nudge it asks for", () => {
        expect(html()).toContain("pointer-events:none");
    });

    it("gives the player one way out, with an accessible name", () => {
        const markup = html();
        expect(markup).toContain('aria-label="Dismiss tip"');
        expect(markup).toContain("pointer-events:auto");
    });

    it("announces itself to screen readers instead of only drawing the card", () => {
        const markup = html();
        expect(markup).toContain('role="status"');
        expect(markup).toContain('aria-live="polite"');
    });

    it("puts the rule dead centre and the callout out of the HUD's way", () => {
        expect(html(rule)).toContain("translate(-50%, -50%)");
        expect(html(tax)).toContain("bottom:11%");
    });

    it("renders the contextual callout's own copy", () => {
        const markup = html(tax);
        expect(markup).toContain("TIME");
        expect(markup).not.toContain("神風");
    });
});

const chipHtml = (props: Partial<React.ComponentProps<typeof CoachReplayChip>> = {}) =>
    renderToStaticMarkup(React.createElement(CoachReplayChip, { onReplay: () => {}, ...props }));

/** Drive the pure gesture rule through a sequence of events. */
function gesture(...events: CoachChipEvent[]) {
    let state: CoachChipState = { pressed: false, held: false };
    const effects: string[] = [];
    for (const event of events) {
        const result = coachChipTransition(state, event);
        state = result.state;
        effects.push(result.effect);
    }
    return effects;
}

describe("CoachReplayChip — the tips can be asked for again", () => {
    it("names both gestures, in words and to assistive tech", () => {
        const markup = chipHtml({ onOpenGuide: () => {} });
        expect(markup).toContain("How to win");
        expect(markup).toContain("tap to replay the table tips, hold for the full guide");
        expect(markup).toContain("Hold: full guide");
        expect(markup).toContain('type="button"');
    });

    it("promises no hold when there is nowhere for it to go", () => {
        const markup = chipHtml();
        expect(markup).not.toContain("hold for the full guide");
        expect(markup).toContain('aria-label="How to win — tap to replay the table tips"');
    });

    it("is clickable even though it sits on a playfield that ignores pointer events", () => {
        expect(chipHtml()).toContain("pointer-events:auto");
    });

    it("swallows the tap before replaying, so asking for help is never a nudge", () => {
        const stopPropagation = vi.fn();
        const replay = vi.fn();
        consumeCoachReplayClick({ stopPropagation }, replay);
        expect(stopPropagation).toHaveBeenCalledTimes(1);
        expect(replay).toHaveBeenCalledTimes(1);
    });
});

describe("coach chip gesture — tap replays, hold opens the guide", () => {
    it("replays the tips on a tap", () => {
        expect(gesture("press", "release", "tapped")).toEqual(["arm", "disarm", "replay"]);
    });

    it("opens the guide when the hold wins, and eats the click that follows", () => {
        // A hold is one gesture: the click it produces must not also replay.
        expect(gesture("press", "held", "tapped")).toEqual(["arm", "guide", "none"]);
    });

    it("lets the next tap replay again after a hold", () => {
        expect(gesture("press", "held", "tapped", "press", "release", "tapped")).toEqual([
            "arm", "guide", "none", "arm", "disarm", "replay",
        ]);
    });

    it("treats a drag off the chip as a release, not a hold", () => {
        expect(gesture("press", "release", "release", "tapped")).toEqual(["arm", "disarm", "none", "replay"]);
    });

    it("ignores a stray timer that never had a press behind it", () => {
        // Otherwise a timer surviving an unmount could open a modal unasked.
        expect(gesture("held")).toEqual(["none"]);
        expect(gesture("release", "tapped")).toEqual(["none", "replay"]);
    });

    it("holds long enough to be deliberate, but not long enough to feel broken", () => {
        expect(COACH_HOLD_MS).toBeGreaterThanOrEqual(400);
        expect(COACH_HOLD_MS).toBeLessThanOrEqual(800);
    });
});
