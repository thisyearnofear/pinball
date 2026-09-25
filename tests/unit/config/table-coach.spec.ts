import { describe, it, expect } from "vitest";
import {
    coachScript,
    currentCue,
    extraControlLines,
    noObservations,
    type CoachObservations,
} from "@/config/table-coach";
import { CHAPTERS } from "@/model/chapters";

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

    it("teaches classic with one card covering flippers and the launch verb", () => {
        const script = coachScript("classic", false);
        expect(script).toHaveLength(1);
        const copy = script[0].lines.join(" ").toLowerCase();
        expect(copy).toContain("flipper");
        expect(copy).toContain("launch");
        expect(copy).toContain("charged hold");
        // The retired bump verb must never resurface — Space now launches.
        expect(copy).not.toContain("bump");
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

describe("table-coach — story teaches by consequence, not by lecture", () => {
    it("opens with the verb card and retires it once Water has been armed", () => {
        const script = coachScript("story", true);
        expect(currentCue(script, noObservations(), none)?.id).toBe("flippers");
        // The card stays until the arm verb is proven…
        expect(currentCue(script, obs({ engaged: true }), none)?.id).toBe("flippers");
        // …then the story's own cues own the teaching.
        expect(currentCue(script, obs({ engaged: true, armed: true }), none)).toBeNull();
    });

    it("explains the shrine on first capture and stops once the blessing is learned", () => {
        const script = coachScript("story", true);
        expect(currentCue(script, obs({ captured: true }), none)?.id).toBe("shrine");
        expect(currentCue(script, obs({ captured: true, learned: true }), none)?.id).toBe("flippers");
    });

    it("names the burn the moment it hurts and retires when the lesson lands", () => {
        const script = coachScript("story", false);
        expect(currentCue(script, obs({ burned: true }), none)?.id).toBe("burn");
        // Keyboard copy names the W verb.
        expect(currentCue(script, obs({ burned: true }), none)!.lines.join(" ")).toContain("W to arm");
        // Armed + a quenched seal = the counter-play was demonstrated.
        expect(currentCue(script, obs({ burned: true, armed: true, sealsQuenched: 1 }), none)).toBeNull();
    });

    it("names the drain and retires after a deliberate save", () => {
        const script = coachScript("story", true);
        expect(currentCue(script, obs({ drained: true }), none)?.id).toBe("drain");
        // Once satisfied the standing verb card comes back (it only retires on
        // arm), so dismiss it to isolate the contextual layer.
        const sansCard = new Set(["flippers"]);
        expect(currentCue(script, obs({ drained: true, saved: true }), sansCard)).toBeNull();
        // Touch copy must not leak keyboard phrasing.
        expect(currentCue(script, obs({ drained: true }), none)!.lines.join(" ")).not.toContain("SPACE");
    });

    it("announces the open torii and retires on the win", () => {
        const script = coachScript("story", true);
        expect(currentCue(script, obs({ gateOpen: true }), none)?.id).toBe("finish");
        expect(currentCue(script, obs({ gateOpen: true, won: true }), new Set(["flippers"]))).toBeNull();
    });

    it("keeps story copy device-correct, emoji-free, and within the card lifetime budget", () => {
        const script = coachScript("story", false);
        for (const cue of script) {
            expect(cue.kanji.length).toBeGreaterThan(0);
            expect(cue.kanji).not.toMatch(EMOJI);
            for (const line of cue.lines) {
                expect(line.length).toBeGreaterThan(20);
                expect(line).not.toMatch(EMOJI);
            }
            expect(cue.autoDismissSec).toBeGreaterThan(0);
            expect(cue.autoDismissSec).toBeLessThanOrEqual(12);
            expect(["center", "bottom"]).toContain(cue.anchor);
        }
    });

    it("sells nothing in story mode either", () => {
        const copy = coachScript("story", true).flatMap((c) => c.lines).join(" ").toLowerCase();
        for (const word of MONEY_WORDS) {
            expect(copy).not.toContain(word);
        }
        expect(copy).not.toMatch(WALLET_PITCH);
    });
});

describe("table-coach — story cues read from the chapter config", () => {
    const wind = CHAPTERS["wind-ridge"];

    it("chapter 2 cues teach Wind with the ridge's own nouns", () => {
        const script = coachScript("story", false, wind);
        const shrine = script.find((c) => c.id === "shrine")!;
        expect(shrine.lines[0]).toContain("wind shrine");
        expect(shrine.kanji).toBe("風");
        const burn = script.find((c) => c.id === "burn")!;
        expect(burn.lines.join(" ")).toContain("Wind");
        expect(burn.lines.join(" ")).not.toContain("Water");
        expect(burn.lines.join(" ")).toContain("chime");
        const finish = script.find((c) => c.id === "finish")!;
        expect(finish.lines[0]).toContain("chimes rung");
        expect(finish.kanji).toBe("峠");
    });

    it("the standing verb card arms the current chapter's blessing", () => {
        const touchWater = coachScript("story", true).find((c) => c.id === "flippers")!;
        expect(touchWater.lines.join(" ")).toContain("arm Water");
        const touchWind = coachScript("story", true, wind).find((c) => c.id === "flippers")!;
        expect(touchWind.lines.join(" ")).toContain("arm Wind");
    });

    it("defaults to chapter 1 so unparameterized callers keep the water copy", () => {
        const script = coachScript("story", false);
        expect(script.find((c) => c.id === "shrine")!.lines[0]).toContain("water shrine");
    });
});
