import { describe, it, expect } from "vitest";
import {
    startReplayRecording, recordReplayEvent, isReplayRecording,
    finishReplayRecording, encodeReplay, decodeReplay, recordReplayTraceSample,
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

    it("should downsample the position trace to every 4th tick", () => {
        startReplayRecording({ seed: 5, table: 0, mode: "kamikaze" });
        for (let tick = 0; tick < 10; tick++) {
            recordReplayTraceSample(tick, 100.4 + tick, 200.6 + tick);
        }
        const digest = finishReplayRecording(9000, 10)!;
        expect(digest.trace).toEqual([0, 100, 201, 4, 104, 205, 8, 108, 209]);
    });

    it("should omit the trace field when no samples were recorded", () => {
        startReplayRecording({ seed: 5, table: 0, mode: "classic" });
        const digest = finishReplayRecording(100, 1)!;
        expect("trace" in digest).toBe(false);
    });

    it("should ignore trace samples when not recording", () => {
        finishReplayRecording(0, 0);
        recordReplayTraceSample(0, 1, 2);
        startReplayRecording({ seed: 5, table: 0, mode: "classic" });
        const digest = finishReplayRecording(100, 1)!;
        expect(digest.trace).toBeUndefined();
    });

    it("should cap trace samples without corrupting triples", () => {
        startReplayRecording({ seed: 5, table: 0, mode: "classic" });
        for (let tick = 0; tick < 30000; tick += 4) {
            recordReplayTraceSample(tick, tick, tick);
        }
        const digest = finishReplayRecording(1, 30000)!;
        expect(digest.trace!.length).toBeLessThanOrEqual(4500 * 3);
        expect(digest.trace!.length % 3).toBe(0);
    });

    it("should include the world in the digest when provided (A4)", () => {
        startReplayRecording({ seed: 7, table: 0, mode: "kamikaze", world: "pirate-ship" });
        const digest = finishReplayRecording(1000, 60)!;
        expect(digest.world).toEqual("pirate-ship");
    });

    it("should omit the world field when no world is set", () => {
        startReplayRecording({ seed: 7, table: 0, mode: "classic" });
        const digest = finishReplayRecording(1000, 60)!;
        expect(digest.world).toBeUndefined();
    });
});
