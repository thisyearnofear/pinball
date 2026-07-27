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

// ── AI flipper parameters by difficulty ─────────────────────────

export type AIDifficulty = "easy" | "medium" | "hard";

const AI_PARAMS: Record<AIDifficulty, { accuracy: number; reactionMs: number }> = {
    easy:   { accuracy: 0.5,  reactionMs: 250 },
    medium: { accuracy: 0.8,  reactionMs: 150 },
    hard:   { accuracy: 0.95, reactionMs: 80  },
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
        activePowerUps: [],
        crateCooldownMs: 10000, // 8-12s between crates
        lastCrateSpawn: 0,
        totalBumperHits: 0,
        totalTriggerGroupCompletions: 0,
        rubberBandBias: 0.5, // neutral start
        completedBallScores: [],
        scoreFrozen: false,
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
            const ballApproaching = pos.y > flipperPos.top - 100 && vel.y > 0;
            const horizontalDistance = Math.abs(pos.x - flipperCenterX);
            if (ballApproaching && horizontalDistance < 120) {
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

const AI_TAUNTS_SAVE = ["SAVED!", "NICE TRY", "I WILL NOT LET YOU LOSE", "PATHETIC"];
const AI_TAUNTS_DRAIN = ["NOOO", "HOW?", "REKT", "IMPOSSIBLE"];

export function getRandomTaunt(drain: boolean, rng: () => number = Math.random): string {
    const pool = drain ? AI_TAUNTS_DRAIN : AI_TAUNTS_SAVE;
    return pool[Math.floor(rng() * pool.length)];
}

// ── Tap-to-nudge ────────────────────────────────────────────────

/**
 * Apply a nudge impulse to the ball toward the tap location.
 * This is the primary Kamikaze Ball control.
 */
export function nudgeBall(
    engine: IPhysicsEngine,
    ballBody: Body | null,
    tapX: number,
    tapY: number
): void {
    if (!ballBody) return;

    const dx = tapX - ballBody.position.x;
    const dy = tapY - ballBody.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    // Small impulse, normalized
    const force = 4; // tunable
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
