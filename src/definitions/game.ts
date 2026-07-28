/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2023 - https://www.igorski.nl
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import type { Rectangle } from "zcanvas";

export const FRAME_RATE = 60;

export const BALL_WIDTH  = 40;
export const BALL_HEIGHT = BALL_WIDTH;

// physics configuration

export const GRAVITY       = 0.85;
export const FLIPPER_FORCE = 0.002666666 * GRAVITY;
export const LAUNCH_SPEED  = 25 * GRAVITY;
export const MAX_SPEED     = 55 * GRAVITY;

// the table will tilt when more than MAX_BUMPS have occurred
// before each bumps BUMP_TIMEOUT has passed

export const MAX_BUMPS    = 3;
export const BUMP_IMPULSE = 4;
export const BUMP_TIMEOUT = 2000;

export const BALLS_PER_GAME = 3;
export const RETRY_TIMEOUT  = 3000; // if a Ball is lost within this period, player gets a free retry

// Kamikaze Ball scoring (score = time alive in ms, lower = better)

export const KAMIKAZE_BUMPER_PENALTY_MS  = 500;  // penalty per bumper hit (kept ball alive)
export const KAMIKAZE_TRIGGER_PENALTY_MS = 2500; // penalty per completed trigger group
export const MIN_DRAIN_MS = 800; // fastest physically plausible drain, shared with backend validation
export const AI_FLIPPER_HOLD_MS = 200; // how long AI holds a flipper up

export const AwardablePoints = {
    BUMPER: 500,
    TRIGGER: 100,
    TRIGGER_GROUP_COMPLETE: 2500,
    TRIGGER_GROUP_SEQUENCE_COMPLETE: 25000,
    UNDERWORLD_UNLOCKED: 10000,
    ESCAPE_BONUS: 25000,
};

export enum GameMessages {
    MULTIPLIER,
    MULTIBALL,
    LOOP,
    GROUP_COMPLETE,
    TRICK_SHOT,
    UNDERWORLD_UNLOCKED,
    ESCAPE_BONUS,
    GOT_LUCKY,
    TRY_AGAIN,
    TILT,
    // Kamikaze Ball messages
    KAMIKAZE_START,
    DRAINED,
    SAVED,
    POWERUP_ROULETTE,
    POWERUP_PLAYER,
    POWERUP_MACHINE,
    AI_TAUNT,
    // Phase 3 immersion
    SAKURA_STORM,     // player power-up: petals blind the machine
    KAMIS_WRATH,      // machine power-up: the god hurls the ball
    UNSTOPPABLE,      // streak: 3 consecutive drains without a save
};

export enum GameSounds {
    BALL_OUT,
    BUMP,
    BUMPER,
    EVENT,
    FLIPPER,
    POPPER,
    TRIGGER,
    // Kamikaze Ball sounds
    POWERUP_ROULETTE,
    POWERUP_ACTIVATE,
    DRAIN_VICTORY,
    AI_SAVE,
};

/**
 * All the different Actors inside a game
 */
export enum ActorTypes {
    CIRCULAR,
    RECTANGULAR,
    LEFT_FLIPPER,
    RIGHT_FLIPPER,
    TRIGGER,
};

export enum ActorLabels {
    BALL            = "ball",
    FLIPPER         = "flipper",
    POPPER          = "popper",
    BUMPER          = "bumper",
    TRIGGER         = "trigger",
    TRIGGER_GROUP   = "trigger-group"
};

/**
 * Kamikaze Ball power-up types.
 * Player munitions help drain the ball. Machine countermeasures keep it alive.
 */
export enum PowerUpType {
    // Player munitions (help you drain)
    HOMING_WARHEAD,    // Ball gets pulled toward drain
    FLIPPER_JAM,       // AI flippers freeze
    GHOST_BALL,        // Ball phases through bumpers
    SAKURA_STORM,      // Petals blind the machine: ball phases through bumpers AND AI flips erratically
    // Machine countermeasures (keep ball alive)
    IRON_DOME,         // AI flippers become perfect
    FORCE_FIELD,       // Barrier over drain
    BUMPER_FRENZY,     // All bumpers activate
    KAMIS_WRATH,       // The god of the table hurls the ball: speed doubles, harder to drain
};

export type PowerUpSide = "player" | "machine";

export type ActivePowerUp = {
    type: PowerUpType;
    side: PowerUpSide;
    expiresAt: number;  // timestamp when effect ends
};

export type KamikazeState = {
    enabled: boolean;
    roundStartTime: number;          // when current ball was launched
    aiAccuracy: number;              // 0-1, probability AI saves the ball
    aiReactionMs: number;            // AI check interval
    aiLastCheck: number;             // last AI check timestamp
    aiFlipperReleaseAt: number[];    // per-flipper scheduled release timestamps (simulation time)
    aiSaveChance: number;            // base probability of a machine emergency save at the drain
    aiSaveFatigue: number;           // save-chance decay multiplier per consecutive save
    aiSavesUsed: number;             // emergency saves performed for the current ball (fatigue)
    activePowerUps: ActivePowerUp[]; // currently active effects
    crateCooldownMs: number;         // time between crate respawns
    lastCrateSpawn: number;          // last crate activation timestamp
    totalBumperHits: number;         // penalty tracking (current ball)
    totalTriggerGroupCompletions: number; // penalty tracking (current ball)
    rubberBandBias: number;          // current rubber-band probability (0-1, 0.5 = neutral)
    completedBallScores: number[];   // final score per drained ball; game score = best (lowest)
    scoreFrozen: boolean;            // true between drain and next ball launch
    // ── Player agency (Phase 2) ──
    diveQueued: boolean;             // player swiped down: next drain bypasses the machine's save
    storedPowerUp: PowerUpType | null; // earned from trigger-group completion; player chooses when to deploy
    underworldCharge: number;        // 0-1 charge toward forcing an underworld dive
    // ── Streak system (Phase 3) ──
    drainStreak: number;             // consecutive drains without a machine save (reset on save)
};

/**
 * Runtime properties of an active game
 * @see pinball-table.vue, model/game.ts
 */
export type GameDef = {
    id: string | null;
    active: boolean;     // whether the game is running or over
    paused: boolean;
    table: number;       // identifier of the table in the tables list
    score: number;       // the score awarded in this game
    balls: number;       // amount of balls left
    multiplier: number;  // bonus multiplier for each awarded point
    underworld: boolean; // whether underworld is accessible below the table
    kamikaze?: KamikazeState; // optional Kamikaze Ball mode state
    rngSeed?: number;    // seed for deterministic gameplay rolls (recorded in replays)
    rng?: () => number;  // seeded PRNG; falls back to Math.random when absent
};

export type FlipperType = ActorTypes.LEFT_FLIPPER | ActorTypes.RIGHT_FLIPPER;
export type FlipperDef = {
    type: FlipperType;
    left: number;
    top: number;
    angle: number;
};

/**
 * An ObjectDef is the serialized version of an Actor (where the actor
 * type is inferred from the parent property, see TableDef) it basically
 * describes the position and dimensions of an Actor relative to its Table
 * Rectangle coordinates are from the top left of the object, taking rotation into account
 */
export type ObjectDef = Rectangle & {
    angle?: number;
    radius?: number;
    sensor?: boolean; // detects collision but does not reflect balls
    visible?: boolean;
};

export type ShapeDef = Rectangle & {
    source: string;
};

/**
 * Triggers are Actors that belong to a group. Depending on the trigger type, how
 * you hit each of these Actors can result in an action happening in the game, like
 * getting a bonus.
 */
export enum TriggerTarget {
    MULTIPLIER,
    MULTIBALL,
    SEQUENCE_COMPLETION,
    UNDERWORLD,
    TELEPORT,
};

/**
 * The types of triggers.
 * Bool -> all Actors in the Trigger group must be hit for the action to happen
 * Series -> all Actors in the Trigger group must be hit in succession (within
 * a TRIGGER_EXPIRY grace period) for the action to happen
 */
export enum TriggerTypes {
    BOOL,
    SERIES,
};

/**
 * The amount of milliseconds that are allowed to pass before the active triggers
 * within a not-fully activated Trigger group expire
 */
export const TRIGGER_EXPIRY = 5000;

/**
 * The amount of milliseconds within which the same sequence can be completed
 * for the same Trigger group to be awarded extra points
 */
export const SEQUENCE_REPEAT_WINDOW = 3000;

export type TriggerDef = {
    target: TriggerTarget;
    type: TriggerTypes;
    triggers: ObjectDef[];
    params?: any;
    roundRobin?: boolean; // wheter to apply round-robin active state switching on flipper up
    message?: GameMessages; // optional identifier of message to flash once completed
};

export enum ImpulseDirection {
    LEFT,
    RIGHT,
    UP,
    DOWN,
    DOWN_LEFT,
    DOWN_RIGHT,
    UP_LEFT,
    UP_RIGHT,
};

/**
 * A Popper is a mechanism that provides an impulse on the Ball. There should be at least
 * one popper per table as otherwise the ball cannot be launched (it's coordinates
 * are used to place the ball upon the start of each round). The direction specifies
 * the direction in which the Ball will be pushed upon collision with the Popper.
 *
 * Multiple poppers can be added to a table. Poppers that are defined to only work
 * once will be removed from the active game upon first use.
 */
export type PopperDef = Rectangle & {
    opts: {
        force?: number;
        direction?: ImpulseDirection;
        once?: boolean;
    }
};

/**
 * The data model for a pinball table, it combines all
 * of the definitions above to define the table contents and "game world".
 */
export type TableDef = {
    name: string;
    soundtrackId: string; // Soundcloud track id as we use Soundcloud as our "Media streaming platform"
    width: number;
    height: number;
    underworld?: number; // at which y coordinate the (optional) "underworld"-section starts
    background: string,
    body: ShapeDef,
    poppers: PopperDef[];
    flippers: FlipperDef[];
    reflectors: ShapeDef[];
    rects: ObjectDef[];
    bumpers: ObjectDef[];
    triggerGroups: TriggerDef[];
};
