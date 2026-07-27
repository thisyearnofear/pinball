import { describe, it, expect } from "vitest";
import {
    startReplayRecording, recordReplayEvent, isReplayRecording,
    finishReplayRecording, encodeReplay, decodeReplay,
} from "@/model/replay-recorder";

describe("replay recorder", () => {
    it("should return null when finishing without an active recording", () => {
        // ensure any previous recording is closed
        finishReplayRecording(0, 0);
        expect(finishReplayRecording(1000, 60)).toBeNull();
    });

    it("should record events between start and finish", () => {
        startReplayRecording({ seed: 42, table: 0, mode: "kamikaze", aiDifficulty: "hard" });
        expect(isReplayRecording()).toBe(true);

        recordReplayEvent(1, "spawn");
        recordReplayEvent(10, "nudge", 123.6, 456.4);
        recordReplayEvent(200, "drain");

        const digest = finishReplayRecording(3200, 250);
        expect(isReplayRecording()).toBe(false);
        expect(digest).toEqual({
            v: 1,
            seed: 42,
            table: 0,
            mode: "kamikaze",
            aiDifficulty: "hard",
            tickCount: 250,
            finalScore: 3200,
            truncated: false,
            events: [
                { t: 1, e: "spawn" },
                { t: 10, e: "nudge", x: 124, y: 456 },
                { t: 200, e: "drain" },
            ],
        });
    });

    it("should omit aiDifficulty for classic runs", () => {
        startReplayRecording({ seed: 7, table: 0, mode: "classic" });
        recordReplayEvent(5, "L+");
        recordReplayEvent(8, "L-");
        const digest = finishReplayRecording(15000, 100)!;
        expect(digest.mode).toEqual("classic");
        expect("aiDifficulty" in digest).toBe(false);
    });

    it("should ignore events when not recording", () => {
        recordReplayEvent(1, "bump");
        startReplayRecording({ seed: 1, table: 0, mode: "classic" });
        const digest = finishReplayRecording(0, 0)!;
        expect(digest.events).toHaveLength(0);
    });

    it("should stop recording events past the cap and flag truncation", () => {
        startReplayRecording({ seed: 1, table: 0, mode: "classic" });
        for (let i = 0; i < 2600; i++) {
            recordReplayEvent(i, "R+");
        }
        const digest = finishReplayRecording(99, 2600)!;
        expect(digest.events).toHaveLength(2500);
        expect(digest.truncated).toBe(true);
        // events must keep the beginning of the run, not the end
        expect(digest.events[0].t).toEqual(0);
        expect(digest.events[digest.events.length - 1].t).toEqual(2499);
    });

    it("should roundtrip through encode/decode", () => {
        startReplayRecording({ seed: 999, table: 1, mode: "kamikaze", aiDifficulty: "easy" });
        recordReplayEvent(3, "spawn");
        recordReplayEvent(44, "nudge", 10, 20);
        const digest = finishReplayRecording(1234, 80)!;
        expect(decodeReplay(encodeReplay(digest))).toEqual(digest);
    });
});
