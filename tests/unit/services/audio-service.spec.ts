import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { enqueueTrack, init, pulseBpmForMood, shouldFetchMusic, startMachinePulse, stop, stopMachinePulse, type ConnectionHint } from "@/services/audio-service";

function setConnection( hint: ConnectionHint | undefined ): void {
    if ( hint === undefined ) {
        delete ( navigator as Navigator & { connection?: ConnectionHint } ).connection;
    } else {
        ( navigator as Navigator & { connection?: ConnectionHint } ).connection = hint;
    }
}

describe("audio service (B3)", () => {

    afterEach(() => {
        stopMachinePulse();
    });

    describe("pulseBpmForMood()", () => {
        it("should beat slowly when calm", () => {
            expect(pulseBpmForMood("calm")).toEqual(60);
            expect(pulseBpmForMood("smug")).toEqual(60);
        });

        it("should quicken as the machine destabilizes", () => {
            expect(pulseBpmForMood("wary")).toEqual(90);
            expect(pulseBpmForMood("desperate")).toEqual(120);
            expect(pulseBpmForMood("enraged")).toEqual(120);
        });

        it("should stop the heartbeat when grieving", () => {
            expect(pulseBpmForMood("grieving")).toEqual(0);
        });

        it("should fall back to the calm tempo for an unknown mood", () => {
            expect(pulseBpmForMood("???")).toEqual(60);
        });
    });

    describe("shouldFetchMusic()", () => {
        it("should fetch when the browser exposes no connection info (iOS Safari)", () => {
            expect(shouldFetchMusic(undefined)).toBe(true);
            expect(shouldFetchMusic(null)).toBe(true);
        });

        it("should not fetch when the player asked to save data", () => {
            // The one case where spending the bytes is simply the wrong call —
            // on a fast link as much as a slow one, because it is the user's
            // stated preference rather than a guess about their connection.
            expect(shouldFetchMusic({ saveData: true, effectiveType: "4g" })).toBe(false);
        });

        it("should fetch on a normal link", () => {
            expect(shouldFetchMusic({ saveData: false, effectiveType: "4g" })).toBe(true);
            expect(shouldFetchMusic({ saveData: false, effectiveType: "3g" })).toBe(true);
        });

        it("should not fetch on a link too slow to carry a music track", () => {
            expect(shouldFetchMusic({ effectiveType: "2g" })).toBe(false);
            expect(shouldFetchMusic({ effectiveType: "slow-2g" })).toBe(false);
        });

        it("should fetch when the hint is present but says nothing useful", () => {
            expect(shouldFetchMusic({} as ConnectionHint)).toBe(true);
        });
    });

    describe("enqueueTrack() and the connection gate", () => {
        // A queued track creates a detached <audio>, so there is nothing to
        // query in the document — the creation itself is the observable effect.
        // (jsdom has no AudioContext, so `init` skips the Web Audio setup and
        // the src on the created element is the only side effect to read.)
        let created: HTMLAudioElement[] = [];

        beforeEach(() => {
            created = [];
            // jsdom doesn't implement media playback; stub it so the suite's
            // stderr stays readable — whether play/pause is called is not what
            // is under test here, only whether the track was fetched at all.
            vi.spyOn( window.HTMLMediaElement.prototype, "play" ).mockImplementation(() => Promise.resolve());
            vi.spyOn( window.HTMLMediaElement.prototype, "pause" ).mockImplementation(() => {});
            const realCreate = document.createElement.bind( document );
            vi.spyOn( document, "createElement" ).mockImplementation(( ( tag: string ) => {
                const el = realCreate( tag as keyof HTMLElementTagNameMap );
                if ( tag === "audio" ) {
                    created.push( el as HTMLAudioElement );
                }
                return el;
            }) as typeof document.createElement );
        });

        afterEach(() => {
            stop();
            vi.restoreAllMocks();
            setConnection( undefined );
        });

        const fetchedTracks = () => created
            .map(( el ) => el.getAttribute( "src" ) ?? "" )
            .filter(( src ) => src.includes( "music_" ));

        it("should fetch a track on an ordinary connection", async () => {
            // Positive control: without it the assertions below would pass for
            // the wrong reason (nothing fetched at all).
            setConnection( undefined );
            init();
            await enqueueTrack("1566338341");
            expect(fetchedTracks()).toEqual(["./assets/audio/music_1566338341.mp3"]);
        });

        it("should not fetch a track when the player asked to save data", async () => {
            setConnection({ saveData: true, effectiveType: "4g" });
            init();
            await enqueueTrack("1586238075");
            expect(fetchedTracks()).toEqual([]);
        });

        it("should not fetch a track over a link too slow to carry one", async () => {
            setConnection({ saveData: false, effectiveType: "2g" });
            init();
            await enqueueTrack("1566338341");
            expect(fetchedTracks()).toEqual([]);
        });
    });

    describe("machine pulse lifecycle", () => {
        it("should start and stop without throwing when audio is not inited", () => {
            expect(() => startMachinePulse(() => "calm")).not.toThrow();
            expect(() => stopMachinePulse()).not.toThrow();
        });

        it("should make stop idempotent", () => {
            startMachinePulse(() => "desperate");
            stopMachinePulse();
            expect(() => stopMachinePulse()).not.toThrow();
        });
    });
});

describe("sound density (cosmetic mix)", () => {
    it("cycles variants round-robin without repeating back to back", async () => {
        const { nextFxVariant, FX_VARIANTS } = await import("@/services/audio-service");
        const { GameSounds } = await import("@/definitions/game");
        const n = FX_VARIANTS[GameSounds.BUMPER]!.length;
        const picks = Array.from({ length: n * 2 }, () => nextFxVariant(GameSounds.BUMPER));
        for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
        expect(new Set(picks).size).toBe(n);
        expect(nextFxVariant(GameSounds.BALL_OUT)).toBeUndefined();
    });

    it("scales gain, pitch and brightness with impact and clamps bad input", async () => {
        const { impactMix } = await import("@/services/audio-service");
        const soft = impactMix(0.1), hard = impactMix(1);
        expect(hard.gain).toBeGreaterThan(soft.gain);
        expect(hard.detune).toBeGreaterThan(soft.detune);
        expect(hard.brightness).toBeGreaterThan(soft.brightness);
        expect(hard.gain).toBeLessThanOrEqual(1);
        expect(impactMix(5)).toEqual(impactMix(1));
        expect(impactMix(Number.NaN)).toEqual(impactMix(0));
    });

    it("pans by table x, kept off the hard edges", async () => {
        const { panForX } = await import("@/services/audio-service");
        expect(panForX(0, 600)).toBeCloseTo(-0.8);
        expect(panForX(300, 600)).toBeCloseTo(0);
        expect(panForX(600, 600)).toBeCloseTo(0.8);
        expect(panForX(9999, 600)).toBeCloseTo(0.8);
        expect(panForX(100, 0)).toBe(0);
        expect(panForX(Number.NaN, 600)).toBe(0);
    });

    it("maps ball speed to a 0..1 intensity", async () => {
        const { intensityForSpeed } = await import("@/services/audio-service");
        expect(intensityForSpeed(0, 0)).toBe(0);
        expect(intensityForSpeed(11, 0)).toBeCloseTo(0.5);
        expect(intensityForSpeed(30, 40)).toBe(1);
    });
});
