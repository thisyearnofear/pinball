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
import type { GameDef, KamikazeState, PowerUpSide, ActivePowerUp, MachineMood } from "@/definitions/game";
import {
    GameMessages, GameSounds, PowerUpType,
    KAMIKAZE_BUMPER_PENALTY_MS, KAMIKAZE_TRIGGER_PENALTY_MS, AI_FLIPPER_HOLD_MS,
} from "@/definitions/game";
import type Flipper from "@/model/flipper";
import type { IPhysicsEngine } from "@/model/physics/engine";
import type { Body } from "matter-js";
import { playSoundEffect } from "@/services/audio-service";
import * as haptics from "@/utils/haptics";
import { IMMERSION } from "@/config/immersion-tuning";

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
        drainStreak: 0,
        mood: "calm",
        moodSince: 0,
        recentSaveAt: -Infinity,
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
    const sakuraStorm = hasPowerUp(state, PowerUpType.SAKURA_STORM, now);
    // Iron Dome = perfect aim. Sakura Storm = the petals blind the machine,
    // slashing its accuracy so it flails and lets the ball through.
    // A1: mood adds a bounded ±0.05 variance (desperate over-commits, enraged
    // gets sloppy) — stays within the rubber-band precedent.
    const accuracy = ironDome ? 1.0 : (sakuraStorm ? state.aiAccuracy * 0.3 : state.aiAccuracy + moodAccuracyDelta(state.mood));

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
    PowerUpType.SAKURA_STORM,
];

const MACHINE_POWERUPS: PowerUpType[] = [
    PowerUpType.IRON_DOME,
    PowerUpType.FORCE_FIELD,
    PowerUpType.BUMPER_FRENZY,
    PowerUpType.KAMIS_WRATH,
];

const POWERUP_DURATION_MS: Record<PowerUpType, number> = {
    [PowerUpType.HOMING_WARHEAD]: 4000,
    [PowerUpType.FLIPPER_JAM]: 3000,
    [PowerUpType.GHOST_BALL]: 3000,
    [PowerUpType.SAKURA_STORM]: 3500,
    [PowerUpType.IRON_DOME]: 5000,
    [PowerUpType.FORCE_FIELD]: 4000,
    [PowerUpType.BUMPER_FRENZY]: 4000,
    [PowerUpType.KAMIS_WRATH]: 4500,
};

export const POWERUP_NAMES: Record<PowerUpType, string> = {
    [PowerUpType.HOMING_WARHEAD]: "Homing Warhead",
    [PowerUpType.FLIPPER_JAM]: "Flipper Jam",
    [PowerUpType.GHOST_BALL]: "Ghost Ball",
    [PowerUpType.SAKURA_STORM]: "Sakura Storm",
    [PowerUpType.IRON_DOME]: "Iron Dome",
    [PowerUpType.FORCE_FIELD]: "Force Field",
    [PowerUpType.BUMPER_FRENZY]: "Bumper Frenzy",
    [PowerUpType.KAMIS_WRATH]: "Kami's Wrath",
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
    now: number,
    durationMs?: number
): void {
    // Remove existing power-ups of the same side (max 1 per side)
    state.activePowerUps = state.activePowerUps.filter(p => p.side !== side);

    state.activePowerUps.push({
        type,
        side,
        expiresAt: now + (durationMs ?? POWERUP_DURATION_MS[type]),
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

    // Kami's Wrath: the god of the table hurls the ball. Accelerate it toward
    // ~1.8x normal speed with a sideways jitter, making it far harder to drain
    // and feeding the machine. Impulse is proportional to keep control stable.
    if (hasPowerUp(state, PowerUpType.KAMIS_WRATH, now)) {
        const vx = ballBody.velocity.x;
        const vy = ballBody.velocity.y;
        const speed = Math.hypot(vx, vy) || 1;
        const jitterX = (Math.random() - 0.5) * 0.6;
        const boost = 0.12;
        engine.launchBall(ballBody, {
            x: (vx / speed) * boost + jitterX,
            y: (vy / speed) * boost,
        });
    }

    // Ghost Ball / Sakura Storm: handled in collision detection (skip bumper collisions)
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

// ── Tilt-lock (player verb) ─────────────────────────────────────
/** Cooldown between tilt-locks so it can't be spammed to freeze the AI. */
export const TILT_LOCK_COOLDOWN_MS = 6000;
/** How long the AI flippers stay frozen per tilt-lock. */
const TILT_LOCK_FREEZE_MS = 1200;

/**
 * Tilt-lock: the player briefly seizes the table and freezes the machine's
 * AI flippers, buying a controllable window to set up a drain. Reuses the
 * FLIPPER_JAM power-up so the machine "respects" the freeze consistently.
 *
 * Returns true if the lock fired, false if still on cooldown.
 */
export function triggerTiltLock(state: KamikazeState, now: number): boolean {
    const last = state.lastTiltLockAt ?? -Infinity;
    if (now - last < TILT_LOCK_COOLDOWN_MS) return false;
    state.lastTiltLockAt = now;
    // Grant a short player-side FLIPPER_JAM: updateAIFlippers skips its check.
    activatePowerUp(state, PowerUpType.FLIPPER_JAM, "player", now, TILT_LOCK_FREEZE_MS);
    return true;
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

// ── Machine mood (A1: "The Machine Has a Self") ───────────────
// MAMORU (守) — a guardian that loves the ball. Draining is bereavement.
// The mood is surfaced from state that already exists (rubber-band math,
// drain streak, save spikes, drain proximity) so difficulty reads as
// character. Pure + deterministic: no wall-clock branching, no side effects.
// See docs/IMMERSION_SPEC.md (A1).

export type MoodSignals = {
    timeAliveMs: number;
    drainStreak: number;
    recentSaveMs: number;       // ms since the last AI emergency save (Infinity if none)
    nearDrain: number;          // 0..1, ball proximity to the drain (1 = at the gate)
    playerPowerUpActive: boolean;
};

/**
 * Derive the machine's mood from live signals. Transitions follow the spec
 * table (IMMERSION_SPEC.md A1). Order matters: spikes (grieving/smug) win
 * over sustained states (wary/desperate/enraged), which win over the calm
 * baseline. Hysteresis is the caller's job — this is a pure lookup.
 */
export function computeMood(signals: MoodSignals): MachineMood {
    const { timeAliveMs, drainStreak, recentSaveMs, nearDrain, playerPowerUpActive } = signals;
    const m = IMMERSION.mood;

    // Grieving is reserved for the kill-cam spike (caller sets it directly),
    // but a ball at the very gate with no recent save reads as grief-adjacent.
    if (nearDrain > m.grievingNearDrain && recentSaveMs > m.smugAfterSaveMaxMs) return "grieving";

    // Smug spike: briefly after a save, the machine gloats.
    if (recentSaveMs >= m.smugAfterSaveMinMs && recentSaveMs <= m.smugAfterSaveMaxMs) return "smug";

    // Enraged: the player is draining too fast — the guardian is losing its composure.
    if (drainStreak >= m.enragedDrainStreak) return "enraged";

    // Desperate: long rally, the machine is over-committed (mirrors bias 0.7).
    if (timeAliveMs > m.desperateTimeAliveMs) return "desperate";

    // Wary: the player has tools, or the rally is heating up.
    if (playerPowerUpActive || timeAliveMs > m.waryTimeAliveMs) return "wary";

    return "calm";
}

/**
 * Apply a mood transition to state, recording when it changed. Returns true
 * if the mood actually changed (so the caller can fire mood-keyed effects).
 */
export function setMood(state: KamikazeState, mood: MachineMood, now: number): boolean {
    if (state.mood === mood) return false;
    state.mood = mood;
    state.moodSince = now;
    return true;
}

/**
 * Bounded accuracy nudge for mood-driven AI variance. Stays within the
 * rubber-band precedent (±0.05) and never outside the difficulty band.
 * Desperate machines over-commit (+0.05); enraged machines get sloppy (−0.05).
 */
export function moodAccuracyDelta(mood: MachineMood): number {
    const v = IMMERSION.mood.accuracyVariance;
    switch (mood) {
        case "desperate": return v;
        case "enraged":   return -v;
        default:          return 0;
    }
}

// Mood-keyed taunt pools. The calm tier reuses the existing save/drain
// voices; the others add emotional range. Kanji anchors the key beats.
const MOOD_TAUNTS: Record<Exclude<MachineMood, "calm">, string[]> = {
    smug:      ["MINE.", "Not today. Not ever.", "I read you like a table schematic.", "守: predictable."],
    wary:      ["Persistent.", "You fight like the last one. They drained too.", "守: I am watching."],
    desperate: ["STAY. STAY—", "Please. Not this one.", "I cannot lose another.", "守: no—"],
    enraged:   ["ENOUGH.", "You think this is skill?", "守: ENOUGH."],
    grieving:  ["…I failed it.", "It trusted me.", "NOOO", "守: …"],
};

/**
 * Pick a taunt appropriate to the machine's mood. Falls back to the classic
 * save/drain pools when calm (so existing behaviour is unchanged).
 */
export function getMoodTaunt(mood: MachineMood, drain: boolean, rng: () => number = Math.random): string {
    if (mood === "calm") return getRandomTaunt(drain, rng);
    const pool = MOOD_TAUNTS[mood];
    return pool[Math.floor(rng() * pool.length)];
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
// Per-element voices (Phase 3 anthropomorphization):
// Sentinels = bumpers, Guards = flippers, Gate = the drain.
const SENTINEL_TAUNTS = ["番兵: Begone!", "番兵: Not through us.", "番兵: The wind dies here."];
const GUARD_TAUNTS = ["衛士: We hold the line.", "衛士: You shall not pass.", "衛士: The gate stays shut."];
const GATE_TAUNTS = ["門: Come, little blossom...", "門: The wind calls you home.", "門: Fall. Be free."];
export function getElementTaunt(element: "sentinel" | "guard" | "gate", rng: () => number = Math.random): string {
    const pool = element === "sentinel" ? SENTINEL_TAUNTS : element === "guard" ? GUARD_TAUNTS : GATE_TAUNTS;
    return pool[Math.floor(rng() * pool.length)];
}

// ── Tap-to-nudge ────────────────────────────────────────────────

/**
 * Apply a nudge impulse to the ball toward the tap location.
 * This is the primary Kamikaze Ball control.
 *
 * `power` (1-3) scales the impulse so a charged hold-nudge hits up to 3x
 * harder than a quick tap. Default 1 keeps the classic tap behaviour.
 *
 * Control-feel fix: instead of REPLACING the ball's velocity (which read as a
 * teleport and made input feel ignored), we BLEND the nudge into the current
 * velocity. Quick taps bend a fast ball slightly; a max charge can override
 * it. The combined magnitude is capped so a charge can never launch the ball
 * into untrackable chaos.
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

    const { velocity } = ballBody;
    // Fraction of current momentum kept: a tap barely resists, a max charge
    // nearly overrides. Scaled by power 1→3.
    const retention = 1 - 0.15 * power; // 0.85 → 0.55
    const nudgeMag = 3 + power * 4;     // tap ~7, max ~15
    const nx = (dx / dist) * nudgeMag;
    const ny = (dy / dist) * nudgeMag;

    let vx = velocity.x * retention + nx;
    let vy = velocity.y * retention + ny;

    // Cap combined speed just above LAUNCH_SPEED (~21) for predictability.
    const speed = Math.hypot(vx, vy);
    const maxMag = 26;
    if (speed > maxMag) {
        vx = (vx / speed) * maxMag;
        vy = (vy / speed) * maxMag;
    }

    engine.launchBall(ballBody, { x: vx, y: vy });
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
