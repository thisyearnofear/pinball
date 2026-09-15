import { describe, it, expect } from "vitest";
import {
    coachScript,
    currentCue,
    extraControlLines,
    noObservations,
    type CoachObservations,
} from "@/config/table-coach";

// The decorative emoji the review asked us to drop from teaching surfaces.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
const MONEY_WORDS = ["usdt", "nim", "polygon", "nft", "onchain", "entry fee", "payout"];
const WALLET_PITCH = /(connect|link|add|open|create|set up) (a |your )?wallet/i;

const none = new Set<string>();
const obs = (partial: Partial<CoachObservations> = {}): CoachObservations => ({ ...noObservations(), ...partial });

describe("table-coach — the first run is taught on the table", () => {
    it("opens with one card: the inversion and the verb that wins, together", () => {
        const cue = currentCue(coachScript("kamikaze", true), noObservations(), none);
        expect(cue?.id).toBe("inversion");
        const copy = cue!.lines.join(" ");
        // The rule and the winning move have to land in the same card — a
        // four-second run cannot afford a second screen.
        expect(copy).toContain("SAVE");
        expect(copy).toContain("DRAIN");
        expect(copy).toContain("DIVE");
    });

    it("adapts the dive instruction to the input device", () => {
        expect(currentCue(coachScript("kamikaze", true), noObservations())!.lines.join(" ")).toContain("SWIPE DOWN");
        expect(currentCue(coachScript("kamikaze", false), noObservations())!.lines.join(" ")).toContain("↓");
    });

    it("stops teaching the rule once the player has actually dived", () => {
        const script = coachScript("kamikaze", true);
        expect(currentCue(script, obs({ dived: true }), none)).toBeNull();
    });

    it("explains the time tax the moment it is paid, not before", () => {
        const script = coachScript("kamikaze", true);
        // Before the hit there is nothing to explain…
        expect(currentCue(script, noObservations(), none)?.id).toBe("inversion");
        // …and after it, the callout outranks the standing rule.
        expect(currentCue(script, obs({ taxed: true }), none)?.id).toBe("tax");
        // Once waved away, the standing rule comes back rather than the callout.
        expect(currentCue(script, obs({ taxed: true }), new Set(["tax"]))?.id).toBe("inversion");
    });

    it("leaves nothing behind once every cue is satisfied or dismissed", () => {
        const script = coachScript("kamikaze", true);
        expect(currentCue(script, obs({ dived: true, taxed: true }), new Set(["tax"]))).toBeNull();
    });

    it("replays from the top when asked, instead of resuming the old callout", () => {
        const script = coachScript("kamikaze", true);
        const afterRun = obs({ dived: true, taxed: true });
        // A finished first run has nothing left to say…
        expect(currentCue(script, afterRun, new Set(["tax"]))).toBeNull();
        // …and asking for the tips again wipes that history and starts over.
        expect(currentCue(script, noObservations(), new Set())?.id).toBe("inversion");
    });

    it("gives every cue a finite lifetime on a live table", () => {
        for (const cue of [...coachScript("kamikaze", true), ...coachScript("classic", false)]) {
            expect(cue.autoDismissSec).toBeGreaterThan(0);
            expect(cue.autoDismissSec).toBeLessThanOrEqual(12);
        }
    });

    it("teaches classic with one card covering flippers and the bump", () => {
        const script = coachScript("classic", false);
        expect(script).toHaveLength(1);
        const copy = script[0].lines.join(" ").toLowerCase();
        expect(copy).toContain("flipper");
        expect(copy).toContain("bump");
        expect(currentCue(script, noObservations())?.id).toBe("flippers");
    });

    it("keeps the rule centred and drops callouts clear of the HUD", () => {
        const script = coachScript("kamikaze", true);
        expect(script.find((c) => c.id === "inversion")!.anchor).toBe("center");
        // Never the top: that is where the HUD and the power-up bar live, and a
        // tip must not cover the readout it is explaining.
        expect(script.find((c) => c.id === "tax")!.anchor).toBe("bottom");
        for (const cue of [...script, ...coachScript("classic", true)]) {
            expect(["center", "bottom"]).toContain(cue.anchor);
        }
    });

    it("marks every cue with kanji and real sentences", () => {
        for (const cue of [...coachScript("kamikaze", true), ...coachScript("classic", true)]) {
            expect(cue.kanji.length).toBeGreaterThan(0);
            expect(cue.kanji).not.toMatch(EMOJI);
            expect(cue.lines.length).toBeGreaterThan(0);
            for (const line of cue.lines) {
                expect(line.length).toBeGreaterThan(20);
                expect(line).not.toMatch(EMOJI);
            }
        }
    });

    it("sells nothing before the player has felt the machine", () => {
        const copy = [
            ...coachScript("kamikaze", true).flatMap((c) => c.lines),
            ...coachScript("classic", true).flatMap((c) => c.lines),
        ]
            .join(" ")
            .toLowerCase();
        for (const word of MONEY_WORDS) {
            expect(copy).not.toContain(word);
        }
        expect(copy).not.toMatch(WALLET_PITCH);
    });
});

describe("table-coach — the reference keeps the secondary verbs off the table", () => {
    it("keeps the exhaustive verbs out of the critical path", () => {
        const coachCopy = coachScript("kamikaze", true)
            .flatMap((c) => c.lines)
            .join(" ");
        expect(coachCopy).not.toContain("TILT-LOCK");
        expect(coachCopy).not.toContain("munitions");

        const lines = extraControlLines("kamikaze", true);
        expect(lines).toHaveLength(3);
        const joined = lines.join(" ");
        expect(joined).toContain("power nudge");
        expect(joined).toContain("munition");
        expect(joined).toContain("TILT-LOCK");
    });

    it("adapts the secondary verbs to the input device", () => {
        expect(extraControlLines("kamikaze", true).join(" ")).toContain("DOUBLE-TAP");
        expect(extraControlLines("kamikaze", false).join(" ")).toContain("Press D");
    });

    it("has nothing extra to disclose for classic", () => {
        expect(extraControlLines("classic", true)).toEqual([]);
    });
});
