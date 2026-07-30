import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/audio-service", () => ({
    playSoundEffect: vi.fn(),
    enqueueTrack: vi.fn(),
    setFrequency: vi.fn(),
}));

import {
    PowerUpType, KAMIKAZE_BUMPER_PENALTY_MS, KAMIKAZE_TRIGGER_PENALTY_MS, AI_FLIPPER_HOLD_MS,
} from "@/definitions/game";
import type { KamikazeState } from "@/definitions/game";
import {
    createKamikazeState, getKamikazeScore, getBestKamikazeScore, updateRubberBand,
    rollPowerUp, activatePowerUp, cleanupPowerUps, hasPowerUp, applyPowerUpEffects,
    isDrainBlocked, shouldSpawnCrate, recordCrateSpawn, getRandomTaunt, nudgeBall,
    updateAIFlippers, rollEmergencySave,
    computeMood, setMood, moodAccuracyDelta, getMoodTaunt,
} from "@/model/kamikaze";
import type { MoodSignals } from "@/model/kamikaze";
import { mulberry32 } from "@/utils/rng";
import { getMockPhysicsEngine } from "../__mocks";

function getState(): KamikazeState {
    const state = createKamikazeState("medium");
    state.roundStartTime = 1000;
    return state;
}

describe("Kamikaze Ball", () => {

    describe("scoring", () => {
        it("should score time alive since round start", () => {
            const state = getState();
            expect(getKamikazeScore(state, 6000)).toEqual(5000);
        });

        it("should add the bumper penalty per hit", () => {
            const state = getState();
            state.totalBumperHits = 3;
            expect(getKamikazeScore(state, 6000)).toEqual(5000 + 3 * KAMIKAZE_BUMPER_PENALTY_MS);
        });

        it("should add the trigger group penalty per completion", () => {
            const state = getState();
            state.totalTriggerGroupCompletions = 2;
            expect(getKamikazeScore(state, 6000)).toEqual(5000 + 2 * KAMIKAZE_TRIGGER_PENALTY_MS);
        });

        it("should never return a negative score", () => {
            const state = getState();
            expect(getKamikazeScore(state, 0)).toEqual(0);
        });

        it("should take the best (lowest) of all completed ball scores", () => {
            const state = getState();
            state.completedBallScores = [4200, 2100, 9800];
            expect(getBestKamikazeScore(state)).toEqual(2100);
        });

        it("should return 0 as best score when no ball completed", () => {
            expect(getBestKamikazeScore(getState())).toEqual(0);
        });
    });

    describe("rubber banding", () => {
        it("should favor the player when the ball survives beyond 15s", () => {
            const state = getState();
            updateRubberBand(state, state.roundStartTime + 15001);
            expect(state.rubberBandBias).toEqual(0.7);
        });

        it("should favor the machine when the ball drains within 5s", () => {
            const state = getState();
            updateRubberBand(state, state.roundStartTime + 4999);
            expect(state.rubberBandBias).toEqual(0.4);
        });

        it("should stay neutral in between", () => {
            const state = getState();
            updateRubberBand(state, state.roundStartTime + 10000);
            expect(state.rubberBandBias).toEqual(0.5);
        });
    });

    describe("power-up rolls", () => {
        it("should roll a player munition when the roll is below the bias", () => {
            const state = getState();
            state.rubberBandBias = 0.5;
            const { side } = rollPowerUp(state, () => 0.49);
            expect(side).toEqual("player");
        });

        it("should roll a machine countermeasure when the roll is above the bias", () => {
            const state = getState();
            state.rubberBandBias = 0.5;
            const { side } = rollPowerUp(state, () => 0.51);
            expect(side).toEqual("machine");
        });

        it("should be deterministic for the same seed", () => {
            const stateA = getState();
            const stateB = getState();
            const rngA = mulberry32(1234);
            const rngB = mulberry32(1234);
            for (let i = 0; i < 25; i++) {
                expect(rollPowerUp(stateA, rngA)).toEqual(rollPowerUp(stateB, rngB));
            }
        });
    });

    describe("power-up lifecycle", () => {
        it("should activate a power-up with an expiry", () => {
            const state = getState();
            activatePowerUp(state, PowerUpType.GHOST_BALL, "player", 1000);
            expect(hasPowerUp(state, PowerUpType.GHOST_BALL, 1001)).toBe(true);
        });

        it("should expire a power-up after its duration", () => {
            const state = getState();
            activatePowerUp(state, PowerUpType.GHOST_BALL, "player", 1000);
            expect(hasPowerUp(state, PowerUpType.GHOST_BALL, 1000 + 3000)).toBe(false);
        });

        it("should allow at most one power-up per side", () => {
            const state = getState();
            activatePowerUp(state, PowerUpType.GHOST_BALL, "player", 1000);
            activatePowerUp(state, PowerUpType.FLIPPER_JAM, "player", 1100);
            activatePowerUp(state, PowerUpType.IRON_DOME, "machine", 1200);
            expect(state.activePowerUps).toHaveLength(2);
            expect(hasPowerUp(state, PowerUpType.GHOST_BALL, 1300)).toBe(false);
            expect(hasPowerUp(state, PowerUpType.FLIPPER_JAM, 1300)).toBe(true);
            expect(hasPowerUp(state, PowerUpType.IRON_DOME, 1300)).toBe(true);
        });

        it("should remove expired power-ups on cleanup", () => {
            const state = getState();
            activatePowerUp(state, PowerUpType.FLIPPER_JAM, "player", 1000);
            cleanupPowerUps(state, 10000);
            expect(state.activePowerUps).toHaveLength(0);
        });

        it("should block draining while Force Field is active", () => {
            const state = getState();
            activatePowerUp(state, PowerUpType.FORCE_FIELD, "machine", 1000);
            expect(isDrainBlocked(state, 1500)).toBe(true);
            expect(isDrainBlocked(state, 1000 + 5000)).toBe(false);
        });

        it("should pull the ball toward the drain while Homing Warhead is active", () => {
            const state = getState();
            const engine = getMockPhysicsEngine();
            const ballBody = { position: { x: 300, y: 400 } } as never;
            activatePowerUp(state, PowerUpType.HOMING_WARHEAD, "player", 1000);
            applyPowerUpEffects(state, engine, ballBody, 800, 1500);
            expect(engine.launchBall).toHaveBeenCalledWith(ballBody, { x: 0, y: 0.3 });
        });
    });

    describe("AI flippers", () => {
        function getFlipper(left = 200, top = 700) {
            return {
                bounds: { left, top, width: 100, height: 30 },
                trigger: vi.fn(),
            } as never;
        }
        const threateningBall = { pos: { x: 250, y: 650 }, vel: { x: 0, y: 5 } };

        it("should trigger a flipper when a ball approaches and the accuracy roll succeeds", () => {
            const state = getState();
            const flipper = getFlipper();
            updateAIFlippers(state, [flipper], [threateningBall], 5000, () => 0);
            expect((flipper as any).trigger).toHaveBeenCalledWith(true);
            expect(state.aiFlipperReleaseAt[0]).toEqual(5000 + AI_FLIPPER_HOLD_MS);
        });

        it("should miss when the accuracy roll fails", () => {
            const state = getState();
            const flipper = getFlipper();
            updateAIFlippers(state, [flipper], [threateningBall], 5000, () => 0.99);
            expect((flipper as any).trigger).not.toHaveBeenCalled();
        });

        it("should not react while Flipper Jam is active", () => {
            const state = getState();
            activatePowerUp(state, PowerUpType.FLIPPER_JAM, "player", 4000);
            const flipper = getFlipper();
            updateAIFlippers(state, [flipper], [threateningBall], 5000, () => 0);
            expect((flipper as any).trigger).not.toHaveBeenCalled();
        });

        it("should be perfect while Iron Dome is active", () => {
            const state = getState();
            state.aiAccuracy = 0.5;
            activatePowerUp(state, PowerUpType.IRON_DOME, "machine", 4000);
            const flipper = getFlipper();
            updateAIFlippers(state, [flipper], [threateningBall], 5000, () => 0.99);
            expect((flipper as any).trigger).toHaveBeenCalledWith(true);
        });

        it("should release a held flipper at its scheduled simulation time", () => {
            const state = getState();
            const flipper = getFlipper();
            updateAIFlippers(state, [flipper], [threateningBall], 5000, () => 0);
            updateAIFlippers(state, [flipper], [], 5000 + AI_FLIPPER_HOLD_MS, () => 0);
            expect((flipper as any).trigger).toHaveBeenLastCalledWith(false);
            expect(state.aiFlipperReleaseAt[0]).toEqual(0);
        });

        it("should defend against any approaching ball during multiball", () => {
            const state = getState();
            const flipper = getFlipper();
            const farBall = { pos: { x: 900, y: 100 }, vel: { x: 0, y: -3 } };
            updateAIFlippers(state, [flipper], [farBall, threateningBall], 5000, () => 0);
            expect((flipper as any).trigger).toHaveBeenCalledWith(true);
        });

        it("should throttle checks to the reaction interval", () => {
            const state = getState();
            const flipper = getFlipper();
            state.aiLastCheck = 5000;
            updateAIFlippers(state, [flipper], [threateningBall], 5000 + state.aiReactionMs - 1, () => 0);
            expect((flipper as any).trigger).not.toHaveBeenCalled();
        });
    });

    describe("crate spawning", () => {
        it("should spawn a crate once the cooldown has elapsed", () => {
            const state = getState();
            state.lastCrateSpawn = 1000;
            state.crateCooldownMs = 10000;
            expect(shouldSpawnCrate(state, 10999)).toBe(false);
            expect(shouldSpawnCrate(state, 11000)).toBe(true);
        });

        it("should randomize the next cooldown between 8 and 12 seconds", () => {
            const state = getState();
            recordCrateSpawn(state, 5000, () => 0);
            expect(state.lastCrateSpawn).toEqual(5000);
            expect(state.crateCooldownMs).toEqual(8000);
            recordCrateSpawn(state, 5000, () => 0.999999);
            expect(state.crateCooldownMs).toBeLessThan(12000);
            expect(state.crateCooldownMs).toBeGreaterThan(11999);
        });
    });

    describe("taunts", () => {
        it("should be deterministic for the same seed", () => {
            expect(getRandomTaunt(true, mulberry32(42))).toEqual(getRandomTaunt(true, mulberry32(42)));
            expect(getRandomTaunt(false, mulberry32(42))).toEqual(getRandomTaunt(false, mulberry32(42)));
        });

        it("should always return a non-empty string", () => {
            const rng = mulberry32(7);
            for (let i = 0; i < 20; i++) {
                expect(getRandomTaunt(i % 2 === 0, rng).length).toBeGreaterThan(0);
            }
        });
    });

    describe("tap-to-nudge", () => {
        it("should blend a normalized impulse toward the tap position into current velocity", () => {
            const engine = getMockPhysicsEngine();
            const ballBody = { position: { x: 100, y: 100 }, velocity: { x: 0, y: 0 } } as never;
            nudgeBall(engine, ballBody, 100, 200); // straight down
            // power 1 → nudgeMag 7, retention 0.85 on a stationary ball
            expect(engine.launchBall).toHaveBeenCalledWith(ballBody, { x: 0, y: 7 });
        });

        it("should keep a fraction of current momentum (control-feel blend)", () => {
            const engine = getMockPhysicsEngine();
            const ballBody = { position: { x: 100, y: 100 }, velocity: { x: 10, y: 0 } } as never;
            nudgeBall(engine, ballBody, 100, 200);
            // vx = 10 * 0.85 + 0 = 8.5, vy = 0 * 0.85 + 7 = 7
            expect(engine.launchBall).toHaveBeenCalledWith(ballBody, { x: 8.5, y: 7 });
        });

        it("should do nothing when tapping exactly on the ball", () => {
            const engine = getMockPhysicsEngine();
            const ballBody = { position: { x: 100, y: 100 } } as never;
            nudgeBall(engine, ballBody, 100, 100);
            expect(engine.launchBall).not.toHaveBeenCalled();
        });
    });

    describe("emergency saves", () => {
        it("should save when the roll is below the save chance and count fatigue", () => {
            const state = getState();
            expect(rollEmergencySave(state, 5000, -Infinity, () => 0)).toBe(true);
            expect(state.aiSavesUsed).toEqual(1);
        });

        it("should drain when the roll is above the save chance", () => {
            const state = getState();
            expect(rollEmergencySave(state, 5000, -Infinity, () => 0.99)).toBe(false);
            expect(state.aiSavesUsed).toEqual(0);
        });

        it("should fatigue with each consecutive save", () => {
            const state = getState();
            const justBelowBase = state.aiSaveChance - 0.01;
            expect(rollEmergencySave(state, 5000, -Infinity, () => justBelowBase)).toBe(true);
            // same roll now fails: chance decayed by the fatigue multiplier
            expect(rollEmergencySave(state, 5000, -Infinity, () => justBelowBase)).toBe(false);
        });

        it("should reduce the save chance after a recent player nudge", () => {
            const state = getState();
            const justBelowBase = state.aiSaveChance - 0.01;
            // nudged 500ms ago: base chance is scaled down, roll fails
            expect(rollEmergencySave(state, 5000, 4500, () => justBelowBase)).toBe(false);
            // stale nudge (>1s): full chance applies
            expect(rollEmergencySave(state, 5000, 3000, () => justBelowBase)).toBe(true);
        });
    });

    describe("machine mood (A1)", () => {
        const signals = (over: Partial<MoodSignals> = {}): MoodSignals => ({
            timeAliveMs: 3000,
            drainStreak: 0,
            recentSaveMs: Infinity,
            nearDrain: 0,
            playerPowerUpActive: false,
            ...over,
        });

        it("should default to calm on a fresh rally", () => {
            expect(computeMood(signals())).toEqual("calm");
        });

        it("should turn wary once the rally passes 8s", () => {
            expect(computeMood(signals({ timeAliveMs: 9000 }))).toEqual("wary");
        });

        it("should turn wary when the player has a munition active", () => {
            expect(computeMood(signals({ playerPowerUpActive: true }))).toEqual("wary");
        });

        it("should turn desperate on a long rally (>15s)", () => {
            expect(computeMood(signals({ timeAliveMs: 16000 }))).toEqual("desperate");
        });

        it("should turn enraged when the player is draining fast (streak >= 2)", () => {
            expect(computeMood(signals({ drainStreak: 2, timeAliveMs: 16000 }))).toEqual("enraged");
        });

        it("should spike smug shortly after a save", () => {
            expect(computeMood(signals({ recentSaveMs: 1500 }))).toEqual("smug");
        });

        it("should read grief-adjacent at the gate with no recent save", () => {
            expect(computeMood(signals({ nearDrain: 0.95, recentSaveMs: 2000 }))).toEqual("grieving");
        });

        it("should prefer the smug spike over a sustained wary state", () => {
            expect(computeMood(signals({ timeAliveMs: 9000, recentSaveMs: 1500 }))).toEqual("smug");
        });

        it("should only change mood state when the value differs", () => {
            const state = getState();
            state.mood = "calm";
            expect(setMood(state, "calm", 5000)).toBe(false);
            expect(setMood(state, "wary", 5000)).toBe(true);
            expect(state.mood).toEqual("wary");
            expect(state.moodSince).toEqual(5000);
        });

        it("should nudge accuracy within the bounded ±0.05 band", () => {
            expect(moodAccuracyDelta("desperate")).toEqual(0.05);
            expect(moodAccuracyDelta("enraged")).toEqual(-0.05);
            expect(moodAccuracyDelta("calm")).toEqual(0);
            expect(moodAccuracyDelta("smug")).toEqual(0);
        });

        it("should fall back to the classic pools when calm", () => {
            const rng = () => 0;
            expect(getMoodTaunt("calm", true, rng)).toEqual(getRandomTaunt(true, rng));
            expect(getMoodTaunt("calm", false, rng)).toEqual(getRandomTaunt(false, rng));
        });

        it("should draw from the mood pool when not calm", () => {
            const line = getMoodTaunt("desperate", false, () => 0);
            expect(typeof line).toEqual("string");
            expect(line.length).toBeGreaterThan(0);
        });
    });
});
