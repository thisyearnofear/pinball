/**
 * Kamikaze Ball — game mode logic.
 *
 * In Kamikaze Ball, the player WANTS to drain the ball. The machine
 * (AI flippers + bumpers) fights to keep it alive. Power-ups create
 * a tug-of-war between player munitions and machine countermeasures.
 *
 * Score = time alive in ms (lower = better = faster drain).
 *
 * See docs/KAMIKAZE_BALL.md for the full design spec.
 */
import type { GameDef, KamikazeState, PowerUpSide, ActivePowerUp } from "@/definitions/game";
import {
    GameMessages, GameSounds, PowerUpType,
    KAMIKAZE_BUMPER_PENALTY_MS, KAMIKAZE_TRIGGER_PENALTY_MS, AI_FLIPPER_HOLD_MS,
} from "@/definitions/game";
import type Flipper from "@/model/flipper";
import type { IPhysicsEngine } from "@/model/physics/engine";
import type { Body } from "matter-js";
import { playSoundEffect } from "@/services/audio-service";
import * as haptics from "@/utils/haptics";

// ── AI flipper parameters by difficulty ─────────────────────────

export type AIDifficulty = "easy" | "medium" | "hard";

const AI_PARAMS: Record<AIDifficulty, { accuracy: number; reactionMs: number; saveChance: number; saveFatigue: number }> = {
    easy:   { accuracy: 0.5,  reactionMs: 250, saveChance: 0.5,  saveFatigue: 0.7  },
    medium: { accuracy: 0.8,  reactionMs: 150, saveChance: 0.75, saveFatigue: 0.8  },
    hard:   { accuracy: 0.95, reactionMs: 80,  saveChance: 0.9,  saveFatigue: 0.85 },
};

export function createKamikazeState(difficulty: AIDifficulty = "medium"): KamikazeState {
    const params = AI_PARAMS[difficulty];
    return {
        enabled: true,
        roundStartTime: 0,
        aiAccuracy: params.accuracy,
        aiReactionMs: params.reactionMs,
        aiLastCheck: 0,
        aiFlipperReleaseAt: [],
        aiSaveChance: params.saveChance,
        aiSaveFatigue: params.saveFatigue,
        aiSavesUsed: 0,
        activePowerUps: [],
        crateCooldownMs: 10000, // 8-12s between crates
        lastCrateSpawn: 0,
        totalBumperHits: 0,
        totalTriggerGroupCompletions: 0,
        rubberBandBias: 0.5, // neutral start
        completedBallScores: [],
        scoreFrozen: false,
        diveQueued: false,
        storedPowerUp: null,
        underworldCharge: 0,
    };
}

// ── Score calculation ───────────────────────────────────────────

/**
 * In Kamikaze Ball, the "score" is time alive in ms (lower = better).
 * Bumper hits and completed trigger groups add penalties (the ball
 * stayed alive longer / fed the machine).
 * This is stored in game.score and submitted to the contract.
 */
export function getKamikazeScore(state: KamikazeState, now: number): number {
    const timeAlive = now - state.roundStartTime;
    const bumperPenalty = state.totalBumperHits * KAMIKAZE_BUMPER_PENALTY_MS;
    const triggerPenalty = state.totalTriggerGroupCompletions * KAMIKAZE_TRIGGER_PENALTY_MS;
    return Math.max(0, Math.floor(timeAlive + bumperPenalty + triggerPenalty));
}

/**
 * The final game score: the best (lowest) of all drained balls.
 */
export function getBestKamikazeScore(state: KamikazeState): number {
    return state.completedBallScores.length > 0
        ? Math.min(...state.completedBallScores)
        : 0;
}

// ── AI flipper heuristic ────────────────────────────────────────

/**
 * Called every engine tick. Controls AI flippers to save the ball.
 *
 * The AI tracks every ball and activates a flipper when any ball is
 * approaching it. It "misses" based on aiAccuracy to create fairness
 * and drama. Releases are scheduled in simulation time (pause-safe).
 */
export function updateAIFlippers(
    state: KamikazeState,
    flippers: Flipper[],
    ballStates: { pos: { x: number; y: number }; vel: { x: number; y: number } }[],
    now: number,
    rng: () => number = Math.random
): void {
    // Process scheduled releases first, regardless of reaction throttle
    for (let i = 0; i < flippers.length; i++) {
        const releaseAt = state.aiFlipperReleaseAt[i];
        if (releaseAt && now >= releaseAt) {
            flippers[i].trigger(false);
            state.aiFlipperReleaseAt[i] = 0;
        }
    }

    if (ballStates.length === 0) return;

    // Throttle AI checks to reactionMs
    if (now - state.aiLastCheck < state.aiReactionMs) return;
    state.aiLastCheck = now;

    // Skip if Flipper Jam is active (player power-up freezes AI)
    if (hasPowerUp(state, PowerUpType.FLIPPER_JAM, now)) return;

    const ironDome = hasPowerUp(state, PowerUpType.IRON_DOME, now);
    const accuracy = ironDome ? 1.0 : state.aiAccuracy; // Iron Dome = perfect

    for (let i = 0; i < flippers.length; i++) {
        const flipper = flippers[i];
        const flipperPos = flipper.bounds;
        const flipperCenterX = flipperPos.left + flipperPos.width / 2;

        // Defend against the nearest approaching ball (multiball-aware)
        let threatened = false;
        for (const { pos, vel } of ballStates) {
            const ballApproaching = pos.y > flipperPos.top - 250 && vel.y > 0;
            const horizontalDistance = Math.abs(pos.x - flipperCenterX);
            if (ballApproaching && horizontalDistance < 160) {
                threatened = true;
                break;
            }
        }

        if (threatened && !state.aiFlipperReleaseAt[i]) {
            if (rng() < accuracy) {
                flipper.trigger(true);
                state.aiFlipperReleaseAt[i] = now + AI_FLIPPER_HOLD_MS;
            }
        }
    }
}

// ── Power-up system ─────────────────────────────────────────────

const PLAYER_POWERUPS: PowerUpType[] = [
    PowerUpType.HOMING_WARHEAD,
    PowerUpType.FLIPPER_JAM,
    PowerUpType.GHOST_BALL,
];

const MACHINE_POWERUPS: PowerUpType[] = [
    PowerUpType.IRON_DOME,
    PowerUpType.FORCE_FIELD,
    PowerUpType.BUMPER_FRENZY,
];

const POWERUP_DURATION_MS: Record<PowerUpType, number> = {
    [PowerUpType.HOMING_WARHEAD]: 4000,
    [PowerUpType.FLIPPER_JAM]: 3000,
    [PowerUpType.GHOST_BALL]: 3000,
    [PowerUpType.IRON_DOME]: 5000,
    [PowerUpType.FORCE_FIELD]: 4000,
    [PowerUpType.BUMPER_FRENZY]: 4000,
};

export const POWERUP_NAMES: Record<PowerUpType, string> = {
    [PowerUpType.HOMING_WARHEAD]: "Homing Warhead",
    [PowerUpType.FLIPPER_JAM]: "Flipper Jam",
    [PowerUpType.GHOST_BALL]: "Ghost Ball",
    [PowerUpType.IRON_DOME]: "Iron Dome",
    [PowerUpType.FORCE_FIELD]: "Force Field",
    [PowerUpType.BUMPER_FRENZY]: "Bumper Frenzy",
};

/**
 * Update rubber-band bias based on ball-alive time.
 * If the ball has been alive >15s, bias toward player power-ups.
 * If the ball drains <5s repeatedly, bias toward machine.
 */
export function updateRubberBand(state: KamikazeState, now: number): void {
    const timeAlive = now - state.roundStartTime;
    if (timeAlive > 15000) {
        state.rubberBandBias = 0.7; // 70% player
    } else if (timeAlive < 5000) {
        state.rubberBandBias = 0.4; // 40% player (machine favored)
    } else {
        state.rubberBandBias = 0.5; // neutral
    }
}

/**
 * Roll for a power-up when ball hits a munitions crate.
 * Returns the power-up type and which side it benefits.
 */
export function rollPowerUp(state: KamikazeState, rng: () => number = Math.random): { type: PowerUpType; side: PowerUpSide } {
    const isPlayer = rng() < state.rubberBandBias;
    const pool = isPlayer ? PLAYER_POWERUPS : MACHINE_POWERUPS;
    const type = pool[Math.floor(rng() * pool.length)];
    return { type, side: isPlayer ? "player" : "machine" };
}

/**
 * Activate a power-up. Adds it to the active list.
 */
export function activatePowerUp(
    state: KamikazeState,
    type: PowerUpType,
    side: PowerUpSide,
    now: number
): void {
    // Remove existing power-ups of the same side (max 1 per side)
    state.activePowerUps = state.activePowerUps.filter(p => p.side !== side);

    state.activePowerUps.push({
        type,
        side,
        expiresAt: now + POWERUP_DURATION_MS[type],
    });

    playSoundEffect(GameSounds.POWERUP_ACTIVATE);
    if (side === "player") haptics.powerUp();
}

/**
 * Clean up expired power-ups.
 */
export function cleanupPowerUps(state: KamikazeState, now: number): void {
    state.activePowerUps = state.activePowerUps.filter(p => p.expiresAt > now);
}

/**
 * Check if a specific power-up is currently active.
 */
export function hasPowerUp(state: KamikazeState, type: PowerUpType, now: number): boolean {
    return state.activePowerUps.some(p => p.type === type && p.expiresAt > now);
}

/**
 * Apply power-up effects to the physics engine each tick.
 * - Homing Warhead: pull ball toward drain
 * - Ghost Ball: disable bumper collisions
 * - Force Field: block drain
 */
export function applyPowerUpEffects(
    state: KamikazeState,
    engine: IPhysicsEngine,
    ballBody: Body | null,
    _tableHeight: number,
    now: number
): void {
    if (!ballBody) return;

    cleanupPowerUps(state, now);

    // Homing Warhead: pull ball toward bottom center (drain)
    if (hasPowerUp(state, PowerUpType.HOMING_WARHEAD, now)) {
        const pullForce = 0.3;
        engine.launchBall(ballBody, { x: 0, y: pullForce });
    }

    // Ghost Ball: handled in collision detection (skip bumper collisions)
    // Bumper Frenzy: handled in bumper collision (extra bounce)
    // Force Field: handled in drain detection (block drain)
    // Iron Dome: handled in AI flipper accuracy
    // Flipper Jam: handled in AI flipper skip
}

/**
 * Player agency: completing a trigger group banks one player munition that
 * the player can deploy at a moment of their choosing (double-tap / D key).
 * The banked munition rolls from the player power-up pool.
 */
export function bankStoredPowerUp(state: KamikazeState, rng: () => number = Math.random): void {
    if (state.storedPowerUp !== null) return; // only one stored at a time
    state.storedPowerUp = PLAYER_POWERUPS[Math.floor(rng() * PLAYER_POWERUPS.length)];
}

/**
 * Deploy the banked munition. Returns the deployed type, or null if none
 * was stored. Clears the bank.
 */
export function deployStoredPowerUp(state: KamikazeState, now: number): PowerUpType | null {
    const type = state.storedPowerUp;
    if (type === null) return null;
    state.storedPowerUp = null;
    activatePowerUp(state, type, "player", now);
    return type;
}

// ── Crate spawning ─────────────────────────────────────────────

/**
 * Check if a new munitions crate should spawn.
 * Returns true if enough time has passed since the last crate.
 */
export function shouldSpawnCrate(state: KamikazeState, now: number): boolean {
    return now - state.lastCrateSpawn >= state.crateCooldownMs;
}

/**
 * Record that a crate was activated.
 */
export function recordCrateSpawn(state: KamikazeState, now: number, rng: () => number = Math.random): void {
    state.lastCrateSpawn = now;
    // Randomize next cooldown between 8-12s
    state.crateCooldownMs = 8000 + rng() * 4000;
}

// ── Machine taunts ──────────────────────────────────────────────
// Voice of the machine — a samurai-adjacent adversary that refuses to let
// the blossom fall. Kanji marks the key moments (無駄 on a save, 神風 on a
// drain); the rest stays in English with a poetic edge.
const AI_TAUNTS_SAVE = ["無駄 — futile", "The blossom does not fall yet", "I will not let you fall", "Not today"];
const AI_TAUNTS_DRAIN = ["神風! Divine wind!", "The blossom falls...", "Gone with the wind", "...impossible"];

export function getRandomTaunt(drain: boolean, rng: () => number = Math.random): string {
    const pool = drain ? AI_TAUNTS_DRAIN : AI_TAUNTS_SAVE;
    return pool[Math.floor(rng() * pool.length)];
}

// ── Tap-to-nudge ────────────────────────────────────────────────

/**
 * Apply a nudge impulse to the ball toward the tap location.
 * This is the primary Kamikaze Ball control.
 *
 * `power` (1-3) scales the impulse so a charged hold-nudge hits up to 3x
 * harder than a quick tap. Default 1 keeps the classic tap behaviour.
 */
export function nudgeBall(
    engine: IPhysicsEngine,
    ballBody: Body | null,
    tapX: number,
    tapY: number,
    power = 1
): void {
    if (!ballBody) return;

    const dx = tapX - ballBody.position.x;
    const dy = tapY - ballBody.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    // Small impulse, normalized; scaled by charge power
    const force = 4 * power; // tunable
    const impulse = {
        x: (dx / dist) * force,
        y: (dy / dist) * force,
    };

    engine.launchBall(ballBody, impulse);
}

// ── Drain detection ─────────────────────────────────────────────

/**
 * In Kamikaze Ball, draining is the GOAL, not a failure.
 * When the ball drains, we record the time-alive as the score.
 * The Force Field power-up blocks draining.
 */
export function isDrainBlocked(state: KamikazeState, now: number): boolean {
    return hasPowerUp(state, PowerUpType.FORCE_FIELD, now);
}

/**
 * The machine's last line of defense: when the ball reaches the drain it may
 * kick it back into play. Each consecutive save fatigues the machine, so a
 * ball can never be kept alive forever. A recent player nudge toward the
 * drain reduces the save chance (skill reward).
 */
export function rollEmergencySave(
    state: KamikazeState,
    now: number,
    lastNudgeAt: number,
    rng: () => number = Math.random
): boolean {
    const fatigue = Math.pow(state.aiSaveFatigue, state.aiSavesUsed);
    // harder machines resist drainward nudges more (easy ~0.7 → hard ~0.85)
    const nudgeFactor = now - lastNudgeAt < 1000 ? state.aiSaveFatigue : 1;
    if (rng() < state.aiSaveChance * fatigue * nudgeFactor) {
        state.aiSavesUsed++;
        return true;
    }
    return false;
}
