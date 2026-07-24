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
        activePowerUps: [],
        crateCooldownMs: 10000, // 8-12s between crates
        lastCrateSpawn: 0,
        totalBumperHits: 0,
        rubberBandBias: 0.5, // neutral start
    };
}

// ── Score calculation ───────────────────────────────────────────

/**
 * In Kamikaze Ball, the "score" is time alive in ms (lower = better).
 * Bumper hits add a penalty (the ball stayed alive longer).
 * This is stored in game.score and submitted to the contract.
 */
export function getKamikazeScore(state: KamikazeState, now: number): number {
    const timeAlive = now - state.roundStartTime;
    const bumperPenalty = state.totalBumperHits * 500; // 500ms per bumper hit
    return Math.floor(timeAlive + bumperPenalty);
}

// ── AI flipper heuristic ────────────────────────────────────────

/**
 * Called every engine tick. Controls AI flippers to save the ball.
 *
 * The AI tracks the ball's position and activates the nearest flipper
 * when the ball is approaching. It "misses" based on aiAccuracy to
 * create fairness and drama.
 */
export function updateAIFlippers(
    state: KamikazeState,
    flippers: Flipper[],
    ballPos: { x: number; y: number } | null,
    ballVel: { x: number; y: number } | null,
    now: number
): void {
    if (!ballPos || !ballVel) return;

    // Throttle AI checks to reactionMs
    if (now - state.aiLastCheck < state.aiReactionMs) return;
    state.aiLastCheck = now;

    // Skip if Flipper Jam is active (player power-up freezes AI)
    if (hasPowerUp(state, PowerUpType.FLIPPER_JAM, now)) return;

    const ironDome = hasPowerUp(state, PowerUpType.IRON_DOME, now);
    const accuracy = ironDome ? 1.0 : state.aiAccuracy; // Iron Dome = perfect

    for (const flipper of flippers) {
        const flipperPos = flipper.bounds;
        const ballApproaching = ballPos.y > flipperPos.top - 100 && ballVel.y > 0;
        const horizontalDistance = Math.abs(ballPos.x - (flipperPos.left + flipperPos.width / 2));

        // Activate flipper if ball is close enough and approaching
        if (ballApproaching && horizontalDistance < 120) {
            if (Math.random() < accuracy) {
                flipper.trigger(true);
                // Release shortly after
                setTimeout(() => flipper.trigger(false), 200);
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
export function rollPowerUp(state: KamikazeState): { type: PowerUpType; side: PowerUpSide } {
    const isPlayer = Math.random() < state.rubberBandBias;
    const pool = isPlayer ? PLAYER_POWERUPS : MACHINE_POWERUPS;
    const type = pool[Math.floor(Math.random() * pool.length)];
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
export function recordCrateSpawn(state: KamikazeState, now: number): void {
    state.lastCrateSpawn = now;
    // Randomize next cooldown between 8-12s
    state.crateCooldownMs = 8000 + Math.random() * 4000;
}

// ── Machine taunts ──────────────────────────────────────────────

const AI_TAUNTS_SAVE = ["SAVED!", "NICE TRY", "I WILL NOT LET YOU LOSE", "PATHETIC"];
const AI_TAUNTS_DRAIN = ["NOOO", "HOW?", "REKT", "IMPOSSIBLE"];

export function getRandomTaunt(drain: boolean): string {
    const pool = drain ? AI_TAUNTS_DRAIN : AI_TAUNTS_SAVE;
    return pool[Math.floor(Math.random() * pool.length)];
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
