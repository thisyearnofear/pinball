/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2021-2024 - https://www.igorski.nl
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
import { Sprite } from "zcanvas";
import type { Canvas as zCanvas, Size } from "zcanvas";
import type { GameDef, TableDef, FlipperType } from "@/definitions/game";
import {
    FRAME_RATE, BALL_WIDTH, BALL_HEIGHT, LAUNCH_SPEED, MAX_BUMPS, BUMP_TIMEOUT, BUMP_IMPULSE, RETRY_TIMEOUT, BALLS_PER_GAME,
    GameMessages, GameSounds, TriggerTarget, TriggerTypes, AwardablePoints, ActorLabels, ActorTypes,
    PowerUpType,
} from "@/definitions/game";
import Tables from "@/definitions/tables";
import Actor from "@/model/actor";
import Ball from "@/model/ball";
import Bumper from "@/model/bumper";
import Flipper from "@/model/flipper";
import Popper from "@/model/popper";
import Rect from "@/model/rect";
import TriggerGroup from "@/model/trigger-group";
import { createEngine } from "@/model/physics/engine";
import type { IPhysicsEngine, CollisionEvent } from "@/model/physics/engine";
import { Body } from "matter-js";
import { worldGravityX, worldGravityY } from "@/model/world-physics";
import { IMMERSION } from "@/config/immersion-tuning";
import {
    createShotState, beginServe, signalAim, guardLaneAt, resolveRelease, meterPosition,
    laneForX, resolveDrain, canRelease, feintStage, type ShotState, type ShotVariant, type FeintStage,
    type GuardPolicy,
} from "@/model/shot-calling";
import { enqueueTrack, setFrequency, playSoundEffect, duckMusic, playTaikoHit, playFurinChime, momentarySilence } from "@/services/audio-service";
import * as haptics from "@/utils/haptics";
import {
    loadMemory, greetingLine, dominantHabit, habitTaunt, emptyHabits, isSilentRank, subduedSaveTaunt,
    type MachineMemory, type MachineHabits, type HabitLabel,
} from "@/utils/machine-memory";
import { getProgress, levelForXp, rankForLevel } from "@/config/progression";
import {
    createKamikazeState, updateAIFlippers, getKamikazeScore, getBestKamikazeScore, applyPowerUpEffects,
    hasPowerUp, rollPowerUp, activatePowerUp, cleanupPowerUps, shouldSpawnCrate,
    recordCrateSpawn, getElementTaunt, nudgeBall, isDrainBlocked, rollEmergencySave,
    updateRubberBand, bankStoredPowerUp, deployStoredPowerUp,
    triggerTiltLock as triggerTiltLockKamikaze,
    computeMood, setMood, moodAccuracyDelta, getMoodTaunt,
} from "@/model/kamikaze";
import { setKamikazeMode as setBumperKamikazeMode, setGhostMode as setBumperGhostMode, setFrenzyMode as setBumperFrenzyMode } from "@/renderers/bumper-renderer";
import { setKamikazeMode as setFlipperKamikazeMode } from "@/renderers/flipper-renderer";
import { recordReplayEvent, recordReplayTraceSample } from "@/model/replay-recorder";

type IRoundEndHandler = (readyCallback: () => void, timeout: number) => void;
type IMessageHandler = (message: GameMessages, optDuration?: number) => void;

let engine: IPhysicsEngine;
let ball: Ball;
let flipper: Flipper;
let table: TableDef;
let inUnderworld = false;
const actorMap: Map<number, Actor> = new Map(); // mapping all Actors to their physics body id
const balls: Ball[] = []; // separate list for quick access to Ball Actors
let triggerGroups: TriggerGroup[] = []; // separate list for quick access to TriggerGroups
let group: TriggerGroup;
let flippers: Flipper[] = []; // separate list for quick access to Flipper Actors
let tableHasUnderworld: boolean;

let canvas: zCanvas;
let backgroundRenderer: Sprite;
let roundEndHandler: IRoundEndHandler;
let messageHandler: IMessageHandler;
let panOffset = 0;
let viewportWidth = 0;
let viewportHeight = 0; // cached in scaleCanvas()
let underworldOffset = 0;

let roundStart = 0;
let bumpAmount = 0;
let tilt = false;
let paused = false;
let gameRef: GameDef | null = null; // reference to current game for external access
let bumpers: Bumper[] = []; // quick access for Kamikaze Ghost Ball sensor toggling
let ghostActive = false;
let frenzyActive = false;
let lastTauntText = "";
let lastNudgeAt = -Infinity;
// Phase 3 anthropomorphization: throttle per-element voices so they don't spam.
let lastElementVoiceAt = -Infinity;

// B1 machine memory: MAMORU remembers you across sessions. The persistent
// memory drives greetings; runHabits accumulates THIS run's nudge directions
// for habit call-outs + end-of-run persistence. Memory talks, never touches
// physics (hard rule 2).
let machineMemory: MachineMemory = loadMemory();
let runHabits: MachineHabits = emptyHabits();
let lastHabitTauntAt = -Infinity;
let lastHabitCalled: HabitLabel | null = null;
// B2: the player's rank name, read at mount. Drives the machine's address and,
// at max rank (Kamikaze), its silence. Cosmetic only (hard rule 2).
let playerRankName: string | undefined;

// Shot-calling control (serve-based duel). Active when controlScheme is
// "feint" or "precision". The ball is held at the plunger; the player calls a
// lane, MAMORU contests, a release launches the shot. Replaces continuous nudging.
let shotState: ShotState | null = null;
let shotCallActive = false;
let shotVariant: ShotVariant = "feint";
/** Tick at which a saved ball re-serves (tick-based, so pause/replay-safe and
 *  unable to leak a stale callback into a new run). Null when none pending. */
let shotServeAtTick: number | null = null;

/** Causal feedback for the last resolved shot (so the HUD can explain WHY). */
export type ShotResult = {
    calledLane: number | null;
    accuracy: number;
    offset: number;        // signed meter deviation (-0.5..0.5)
    landingLane: number;
    guardLane: number | null;
    result: "save" | "drain";
};
let lastShotResult: ShotResult | null = null;

// Phase 3 anthropomorphization: each machine part speaks with its own voice,
// throttled so the chatter never overwhelms the action.
function voiceElement(game: GameDef, element: "sentinel" | "guard" | "gate"): void {
    if (!game.kamikaze?.enabled) return;
    const now = window.performance.now();
    if (now - lastElementVoiceAt < 2500) return;
    lastElementVoiceAt = now;
    lastTauntText = getElementTaunt(element, game.rng ?? Math.random);
    messageHandler(GameMessages.AI_TAUNT, 1400);
}

const ENGINE_INCREMENT = 1000 / FRAME_RATE;
let accumulator = 0;
let tickCount = 0; // fixed-timestep tick counter (replay keying)

// ── Slow-motion / time dilation ─────────────────────────────────
let timeScale = 1;
let targetTimeScale = 1;
let slowMoExpiresAt = 0;

export const getTickCount = (): number => tickCount;
export const getTimeScale = (): number => timeScale;

/** Request a slow-motion window. Eases in/out automatically. */
export const requestSlowMo = (durationMs: number, target: number = 0.35): void => {
    targetTimeScale = target;
    slowMoExpiresAt = window.performance.now() + durationMs;
};

// ── Momentum (rubber-band) exposure ─────────────────────────────
let prevRubberBandBias = 0.5;
export type MomentumShift = "player" | "machine" | null;
let pendingMomentumShift: MomentumShift = null;

export const getMomentum = (): number => gameRef?.kamikaze?.rubberBandBias ?? 0.5;
export const consumeMomentumShift = (): MomentumShift => {
    const s = pendingMomentumShift;
    pendingMomentumShift = null;
    return s;
};

// ── Machine mood exposure (A1) ──────────────────────────────────
// UI/audio read the machine's emotional state here, following the momentum
// precedent. Wall-clock cosmetic only; never feeds back into physics.
export const getMachineMood = (): string => gameRef?.kamikaze?.mood ?? "calm";

// ── Kill cam (A2) ────────────────────────────────────────────────
// The presentation layer polls this once per frame to fire the directed
// camera push on the decisive drain. Wall-clock cosmetic only; the score is
// already frozen before the cam starts (hard rule 3). Suppressed during ghost
// replay viewing so the comparison timeline stays pure.
let pendingKillCam = false;
let killCamEnabled = true;
export const setKillCamEnabled = (enabled: boolean): void => { killCamEnabled = enabled; };
export const consumeKillCam = (): boolean => {
    const k = pendingKillCam;
    pendingKillCam = false;
    return k;
};

// test/sim hook
export const getPhysicsEngine = (): IPhysicsEngine => engine;

export const init = async (
    canvasRef: zCanvas, game: GameDef, roundEndHandlerRef: IRoundEndHandler, messageHandlerRef: IMessageHandler
): Promise<Size> => {

    canvas = canvasRef;

    roundEndHandler = roundEndHandlerRef;
    messageHandler = messageHandlerRef;

    table = Tables[game.table];
    const { width, height } = table;
    tableHasUnderworld = typeof table.underworld !== "undefined";

    inUnderworld = false;
    accumulator = 0;
    tickCount = 0;
    lastNudgeAt = -Infinity;
    // B1: reload persistent memory (a previous run may have updated it) and
    // reset this run's habit accumulator + habit call-out throttle.
    machineMemory = loadMemory();
    runHabits = emptyHabits();
    lastHabitTauntAt = -Infinity;
    lastHabitCalled = null;
    playerRankName = rankForLevel(levelForXp(getProgress().xp)).name;
    gameRef = game; // store reference for external access (flipper control, nudge)

    // Initialize Kamikaze Ball state if the game has it enabled
    if (game.kamikaze?.enabled) {
        setBumperKamikazeMode(true);
        setFlipperKamikazeMode(true);
        messageHandler(GameMessages.KAMIKAZE_START, 3000);
    } else {
        setBumperKamikazeMode(false);
        setFlipperKamikazeMode(false);
    }
    // Shot-calling is a kamikaze variant: drain-to-win with the serve-based
    // aim/contest/release loop instead of continuous nudging. Two isolated
    // variants (feint duel / precision shot) test each skill independently.
    shotCallActive = Boolean(game.kamikaze?.enabled)
        && (game.controlScheme === "feint" || game.controlScheme === "precision");
    shotVariant = game.controlScheme === "precision" ? "precision" : "feint";
    shotState = null;
    shotServeAtTick = null;
    lastShotResult = null;
    ghostActive = false;
    frenzyActive = false;
    setBumperGhostMode(false);
    setBumperFrenzyMode(false);

    // 1. clean up previous instances, when existing

    for (const actor of actorMap.values()) {
        actor.dispose(engine);
    }
    actorMap.clear();
    balls.length = 0; // stale Ball refs (e.g. from a previous attract-mode mount) would freeze the loop
    engine?.destroy();

    while (canvas.numChildren() > 0) {
        canvas.removeChildAt(0);
    }

    // 2. generate physics world and hook events into game logic

    engine = await createEngine(table, () => {
        handleEngineUpdate(engine, game);
    }, (event: CollisionEvent) => {
        event.pairs.forEach(pair => {
            if (pair.bodyB.label !== ActorLabels.BALL) {
                return;
            }
            switch (pair.bodyA.label) {
                case ActorLabels.POPPER:
                    const popper = actorMap.get(pair.bodyA.id) as Popper;
                    engine.launchBall(pair.bodyB, popper.getImpulse());
                    if (popper.once) {
                        messageHandler(GameMessages.GOT_LUCKY);
                        removeActor(popper);
                    }
                    playSoundEffect(GameSounds.POPPER);
                    break;
                case ActorLabels.BUMPER: {
                    if (game.kamikaze?.enabled) {
                        const bNow = window.performance.now();
                        if (hasPowerUp(game.kamikaze, PowerUpType.GHOST_BALL, bNow)
                            || hasPowerUp(game.kamikaze, PowerUpType.SAKURA_STORM, bNow)) {
                            break; // Ghost Ball / Sakura Storm: phases through (bumper bodies are sensors)
                        }
                        const frenzy = hasPowerUp(game.kamikaze, PowerUpType.BUMPER_FRENZY, bNow);
                        // bumper hits add penalty time (kept ball alive); doubled during Frenzy
                        game.kamikaze.totalBumperHits += frenzy ? 2 : 1;
                        if (frenzy) {
                            // Frenzy: the bumper slams the ball away much harder
                            engine.launchBall(pair.bodyB, {
                                x: pair.bodyB.velocity.x * 1.75,
                                y: pair.bodyB.velocity.y * 1.75,
                            });
                        }
                    }
                    awardPoints(game, AwardablePoints.BUMPER);
                    (actorMap.get(pair.bodyA.id) as Bumper).collided = true;
                    playSoundEffect(GameSounds.BUMPER);
                    // Kamikaze: the machine's defense lands like a taiko drum.
                    if (game.kamikaze?.enabled) {
                        playTaikoHit();
                        voiceElement(game, "sentinel");
                    }
                    break;
                }
                case ActorLabels.TRIGGER:
                    const triggerGroup = actorMap.get(pair.bodyA.id) as TriggerGroup;
                    const groupCompleted = triggerGroup?.trigger(pair.bodyA.id);

                    // Kamikaze Ball: trigger hits can spawn munitions crates
                    if (game.kamikaze?.enabled) {
                        const now = window.performance.now();
                        if (shouldSpawnCrate(game.kamikaze, now)) {
                            recordCrateSpawn(game.kamikaze, now, game.rng ?? Math.random);
                            updateRubberBand(game.kamikaze, now);
                            // Roulette reveal: 1.2s of tension before the power-up resolves
                            playSoundEffect(GameSounds.POWERUP_ROULETTE);
                            messageHandler(GameMessages.POWERUP_ROULETTE, 1200);
                            const kamikaze = game.kamikaze;
                            setTimeout(() => {
                                if (!game.active || gameRef?.kamikaze !== kamikaze) {
                                    return; // game ended or restarted during the spin
                                }
                                const resolveNow = window.performance.now();
                                const { type, side } = rollPowerUp(kamikaze, game.rng ?? Math.random);
                                activatePowerUp(kamikaze, type, side, resolveNow);
                                // Signature powers get their own dramatic callout.
                                if (type === PowerUpType.SAKURA_STORM) {
                                    messageHandler(GameMessages.SAKURA_STORM);
                                } else if (type === PowerUpType.KAMIS_WRATH) {
                                    messageHandler(GameMessages.KAMIS_WRATH);
                                } else {
                                    messageHandler(side === "player" ? GameMessages.POWERUP_PLAYER : GameMessages.POWERUP_MACHINE);
                                }
                                requestSlowMo(800, 0.25);
                            }, 1200);
                        }
                    }

                    if (triggerGroup.triggerType !== TriggerTypes.SERIES) {
                        awardPoints(game, AwardablePoints.TRIGGER);
                        if (!groupCompleted) {
                            playSoundEffect(GameSounds.TRIGGER);
                        }
                    }

                    if (groupCompleted) {
                        // Kamikaze Ball: completing a trigger group feeds the machine (+2500ms penalty)
                        if (game.kamikaze?.enabled) {
                            game.kamikaze.totalTriggerGroupCompletions++;
                            // Player agency: bank a deployable munition + build underworld charge
                            bankStoredPowerUp(game.kamikaze, game.rng ?? Math.random);
                            game.kamikaze.underworldCharge = Math.min(1, game.kamikaze.underworldCharge + 0.5);
                        }
                        switch (triggerGroup.triggerTarget) {
                            default:
                                break;
                            case TriggerTarget.UNDERWORLD: {
                                game.underworld = true;
                                awardPoints(game, AwardablePoints.UNDERWORLD_UNLOCKED);
                                messageHandler(GameMessages.UNDERWORLD_UNLOCKED);
                                requestSlowMo(1000, 0.2);
                                setTimeout(() => {
                                    const { x, y } = pair.bodyB.velocity;
                                    if (Math.abs(x) < 2 && Math.abs(y) < 2) {
                                        engine.launchBall(pair.bodyB, { x: 0, y: -LAUNCH_SPEED });
                                    }
                                }, 2500);
                                break;
                            }
                            case TriggerTarget.MULTIPLIER: {
                                game.multiplier = Math.min(2 * game.multiplier, 32);
                                messageHandler(GameMessages.MULTIPLIER);
                                break;
                            }
                            case TriggerTarget.MULTIBALL: {
                                awardPoints(game, AwardablePoints.TRIGGER_GROUP_COMPLETE);
                                createMultiball(5, pair.bodyB.position.x, pair.bodyB.position.y);
                                messageHandler(GameMessages.MULTIBALL);
                                break;
                            }
                            case TriggerTarget.SEQUENCE_COMPLETION: {
                                awardPoints(game, AwardablePoints.TRIGGER_GROUP_SEQUENCE_COMPLETE * triggerGroup.completions);
                                messageHandler(triggerGroup.completeMessage);
                                break;
                            }
                            case TriggerTarget.TELEPORT: {
                                awardPoints(game, AwardablePoints.ESCAPE_BONUS);
                                messageHandler(GameMessages.ESCAPE_BONUS);
                                removeBall(actorMap.get(pair.bodyB.id) as Ball);
                                setTimeout(() => {
                                    createBall(table.poppers[0].left, table.poppers[0].top - BALL_HEIGHT);
                                }, 2000);
                                break;
                            }
                        }
                        triggerGroup.unsetTriggers();
                        playSoundEffect(GameSounds.EVENT);
                    }
                    break;
            }
        })
    });

    // 3. generate background assets
    await canvas.loadResource("background", table.background);
    backgroundRenderer = new Sprite({ width, height, resourceId: "background" });
    canvas.addChild(backgroundRenderer);

    // 4. generate Actors
    table.poppers.map(popperOpts => {
        mapActor(new Popper(popperOpts, engine, canvas));
    });

    flippers = table.flippers.map(flipperOpts => {
        const flipper = new Flipper(flipperOpts, engine, canvas);
        mapActor(flipper);
        return flipper;
    });

    for (const bumperOpts of table.bumpers) {
        mapActor(new Bumper(bumperOpts, engine, canvas));
    }
    bumpers = [...actorMap.values()].filter(a => a instanceof Bumper) as Bumper[];

    triggerGroups = table.triggerGroups.map(triggerDef => {
        group = new TriggerGroup(triggerDef, engine, canvas);
        // individual Trigger bodies' ids are mapped to their parent TriggerGroup
        group.triggers.map(trigger => mapActor(group, trigger.body.id));
        return group;
    });

    for (const rectOpts of table.rects) {
        mapActor(new Rect(rectOpts, engine, canvas));
    }

    // 5. and get the music goin'
    enqueueTrack(table.soundtrackId);

    game.active = true;

    startRound(game);

    return { width, height: table.underworld ?? height };
};

export const scaleCanvas = (clientWidth: number, clientHeight: number): void => {
    // TODO here we assume all tables are taller than wide
    const ratio = table.height / table.width;
    const width = Math.min(table.width, clientWidth);
    const height = Math.min(clientHeight, Math.round(width * ratio));

    // by setting the dimensions we have set the "world size"
    canvas.setDimensions(table.width, table.height);

    // take into account that certain resolutions are lower than the table width
    const zoom = clientWidth < table.width ? clientWidth / table.width : 1;

    // the viewport however is local to the client window size
    viewportWidth = width / zoom;
    viewportHeight = height / zoom;
    canvas.setViewport(viewportWidth, viewportHeight);
    // scale canvas to fit in the width
    canvas.scale(zoom);

    // the vertical offset at which the viewport should pan to follow the ball
    panOffset = (viewportHeight / 2) - (BALL_WIDTH / 2);

    // the vertical offset we lock viewport panning to when ball is above the underworld
    underworldOffset = table.underworld - viewportHeight;
};

export const setFlipperState = (type: FlipperType, isPointerDown: boolean): void => {
    if (tilt) {
        return;
    }

    // In Kamikaze Ball, flippers are AI-controlled. Player uses tap-to-nudge instead.
    // The global `game` reference is set in handleEngineUpdate via the game param.
    // We check if kamikaze mode is active via the global gameRef.
    if (gameRef?.kamikaze?.enabled) {
        return; // AI controls flippers in Kamikaze Ball
    }

    let movedUp = false;
    for (flipper of flippers) {
        if (flipper.type === type) {
            movedUp = flipper.trigger(isPointerDown);
        }
    }
    recordReplayEvent(
        tickCount,
        type === ActorTypes.LEFT_FLIPPER ? (isPointerDown ? "L+" : "L-") : (isPointerDown ? "R+" : "R-")
    );
    movedUp && playSoundEffect(GameSounds.FLIPPER);
    if (isPointerDown) {
        return;
    }
    for (group of triggerGroups) {
        if (type === ActorTypes.LEFT_FLIPPER) {
            group.moveTriggersLeft();
        } else {
            group.moveTriggersRight();
        }
    }
};

export const bumpTable = (game: GameDef): void => {
    if (tilt || game.paused) {
        return;
    }
    // In Kamikaze Ball, the bump/tilt mechanic is disabled (player uses nudge instead)
    if (game.kamikaze?.enabled) {
        return;
    }
    for (ball of balls) {
        if (Math.abs(ball.body.velocity.y) > 2) {
            continue; // ball is in the air, gets no impulse
        }
        const horizontalForce = ball.body.velocity.x > 0 ? BUMP_IMPULSE : -BUMP_IMPULSE;
        engine.launchBall(ball.body, { x: (game.rng ?? Math.random)() * horizontalForce, y: -BUMP_IMPULSE });
    }
    recordReplayEvent(tickCount, "bump");
    if (++bumpAmount >= MAX_BUMPS) {
        tilt = true;
        messageHandler(GameMessages.TILT, 5000);
        endRound(game, 5000);
    }
    setTimeout(() => {
        bumpAmount = Math.max(0, bumpAmount - 1);
    }, BUMP_TIMEOUT);

    playSoundEffect(GameSounds.BUMP);
};

/**
 * Should be called when zCanvas invokes update() prior to rendering
 */
export const update = (timestamp: DOMHighResTimeStamp, framesSinceLastRender: number): void => {
    ball = balls[0];

    if (!ball || paused) {
        return; // no ball means no game, keep last screen contents indefinitely
    }

    // update physics engine simulation
    // note we cap max increment to prevent glitches in the physics simulation
    // at a FRAME_RATE of 60 fps, the increment is 16.66 ms, a double increment of 33.33 ms
    // should cater for a refresh rate of 30 Hz, which is lower than we expect of modern displays

    // Ease timeScale toward its target (slow-mo ramps in/out smoothly)
    const nowMs = window.performance.now();
    if (nowMs > slowMoExpiresAt && targetTimeScale !== 1) {
        targetTimeScale = 1;
    }
    timeScale += (targetTimeScale - timeScale) * 0.08;
    if (Math.abs(timeScale - 1) < 0.01) timeScale = 1;

    // Auto slow-mo: ball approaching drain in kamikaze mode
    if (gameRef?.kamikaze?.enabled && targetTimeScale === 1 && timeScale === 1) {
        const b = balls[0];
        if (b) {
            const tableBottom = (!tableHasUnderworld || gameRef.underworld) ? table.height : table.underworld;
            const proximity = b.bounds.top / tableBottom;
            if (proximity > IMMERSION.autoSlowMo.proximity && b.body.velocity.y > 0) {
                requestSlowMo(IMMERSION.autoSlowMo.durationMs, IMMERSION.autoSlowMo.timeScale);
            }
        }
    }

    // Detect momentum shifts (rubber-band bias crossed a threshold)
    if (gameRef?.kamikaze?.enabled) {
        const bias = gameRef.kamikaze.rubberBandBias;
        if (prevRubberBandBias <= 0.5 && bias > 0.5) {
            pendingMomentumShift = "player";
        } else if (prevRubberBandBias >= 0.5 && bias < 0.5) {
            pendingMomentumShift = "machine";
        }
        prevRubberBandBias = bias;
    }

    const delta = ENGINE_INCREMENT * framesSinceLastRender * timeScale;
    accumulator += delta;

    // avoid spiral of death when lag is huge
    if (accumulator > 250) {
        accumulator = 250;
    }

    while (accumulator >= ENGINE_INCREMENT) {
        engine.update(ENGINE_INCREMENT);
        accumulator -= ENGINE_INCREMENT;
        ++tickCount;
    }

    // update Actors

    actorMap.forEach(actor => actor.update(timestamp));

    // align viewport with main (lowest) ball

    if (balls.length > 1) {
        balls.sort((a, b) => a.bounds.top === b.bounds.top ? 0 : a.bounds.top > b.bounds.top ? -1 : 1);
        ball = balls[0];
    }

    recordReplayTraceSample(tickCount, ball.body.position.x, ball.body.position.y);

    const { top } = ball.bounds;
    const { underworld } = table;
    const y = top - panOffset;

    canvas.panViewport(0, y > underworldOffset && (top < underworld || !inUnderworld) ? underworld - viewportHeight : y);
};

export const setPaused = (isPaused: boolean): void => {
    paused = isPaused;
    canvas?.pause(isPaused);
};

export const panViewport = (yDelta: number): void => {
    canvas.panViewport(0, canvas.getViewport()!.top + yDelta);
};

/* internal methods */

function awardPoints(game: GameDef, points: number): void {
    if (game.kamikaze?.enabled) {
        return; // Kamikaze Ball score is time-based, computed in handleEngineUpdate
    }
    game.score += (points * game.multiplier);
}

function handleEngineUpdate(engine: IPhysicsEngine, game: GameDef): void {
    const singleBall = balls.length === 1;
    const now = window.performance.now();

    // A4: world-physics coupling — the world bends the table. Derived purely
    // from tickCount (hard rule 1) so a replay re-simulates identically.
    // Setting gravity every tick is self-resetting: a still world holds
    // gravity.x at 0 and gravity.y at GRAVITY, so no stale state leaks
    // between runs with different worlds.
    engine.engine.gravity.x = worldGravityX(game.worldPhysics, tickCount);
    engine.engine.gravity.y = worldGravityY(game.worldPhysics);

    // Kamikaze Ball: update AI flippers, power-ups, and score
    if (game.kamikaze?.enabled) {
        const ballStates = balls.map(b => ({
            pos: { x: b.body.position.x, y: b.body.position.y },
            vel: { x: b.body.velocity.x, y: b.body.velocity.y },
        }));

        if (!shotCallActive) {
            updateAIFlippers(game.kamikaze, flippers, ballStates, now, game.rng ?? Math.random);
        } else if (shotState) {
            // Embody MAMORU's guard: raise the flipper on the guarded lane so the
            // opponent is part of the machine, not a status panel. Visual-only
            // (sensor): the deterministic drain resolver is the single authority
            // for saves, so the two never disagree.
            const guard = shotState.phase === "aiming"
                ? guardLaneAt(shotState, tickCount)
                : guardLaneAt(shotState, shotState.releaseTick ?? tickCount);
            for (const f of flippers) {
                const isLeft = f.type === ActorTypes.LEFT_FLIPPER;
                f.trigger(guard === (isLeft ? 0 : 1));
                f.body.isSensor = true;
            }
        }
        updateRubberBand(game.kamikaze, now);

        // Ghost Ball / Sakura Storm: ball phases through bumpers (bodies become sensors)
        const ghost = hasPowerUp(game.kamikaze, PowerUpType.GHOST_BALL, now)
            || hasPowerUp(game.kamikaze, PowerUpType.SAKURA_STORM, now);
        if (ghost !== ghostActive) {
            ghostActive = ghost;
            setBumperGhostMode(ghost);
            for (const bumper of bumpers) {
                bumper.body.isSensor = ghost;
            }
        }

        // Bumper Frenzy: visual pulse speed-up (impulse boost applied on collision)
        const frenzy = hasPowerUp(game.kamikaze, PowerUpType.BUMPER_FRENZY, now);
        if (frenzy !== frenzyActive) {
            frenzyActive = frenzy;
            setBumperFrenzyMode(frenzy);
        }

        if (balls.length > 0) {
            applyPowerUpEffects(game.kamikaze, engine, balls[0].body, table.height, now);
        }

        // Update score = time alive + penalties (frozen between drain and next launch)
        if (!game.kamikaze.scoreFrozen) {
            game.score = getKamikazeScore(game.kamikaze, now);
        }

        // A1: surface the rubber-band math as visible emotion. Cheap — runs
        // once per engine update, no physics effect. nearDrain mirrors the
        // auto slow-mo proximity so the mood and the cam agree.
        const moodBall = balls[0];
        if (moodBall) {
            const tableBottomMood = (!tableHasUnderworld || game.underworld) ? table.height : table.underworld;
            const proximity = moodBall.bounds.top / tableBottomMood;
            const nearDrain = Math.max(0, Math.min(1, (proximity - 0.7) / 0.3));
            const mood = computeMood({
                timeAliveMs: now - game.kamikaze.roundStartTime,
                drainStreak: game.kamikaze.drainStreak,
                recentSaveMs: now - game.kamikaze.recentSaveAt,
                nearDrain,
                playerPowerUpActive: hasPowerUp(game.kamikaze, PowerUpType.HOMING_WARHEAD, now)
                    || hasPowerUp(game.kamikaze, PowerUpType.FLIPPER_JAM, now)
                    || hasPowerUp(game.kamikaze, PowerUpType.GHOST_BALL, now)
                    || hasPowerUp(game.kamikaze, PowerUpType.SAKURA_STORM, now),
            });
            setMood(game.kamikaze, mood, now);
        }
    }

    // Shot-calling: perform a pending tick-based re-serve. Runs here (not in a
    // wall-clock timer) so it is pause-safe, replay-safe, and cannot leak a
    // stale callback into a restarted run.
    if (shotCallActive && shotServeAtTick !== null && tickCount >= shotServeAtTick) {
        shotServeAtTick = null;
        if (balls.length > 0) removeBall(balls[0]); // drop the frozen saved ball
        serveShotCallBall();
    }

    for (ball of balls) {
        engine.capSpeed(ball.body);
        const { left, top } = ball.bounds;

        const enteringUnderworld = !inUnderworld && top >= table.underworld;

        if (singleBall) {
            if (enteringUnderworld) {
                if (game.underworld) {
                    inUnderworld = true;
                    setFrequency(2000);
                }
            } else if (inUnderworld && top < table.underworld) {
                inUnderworld = false;
                game.underworld = false;
                awardPoints(game, AwardablePoints.ESCAPE_BONUS);
                messageHandler(GameMessages.ESCAPE_BONUS);
                setFrequency();
            }
        } else if (enteringUnderworld) {
            removeBall(ball);
            continue;
        }

        const tableBottom = (!tableHasUnderworld || game.underworld) ? table.height : table.underworld;

        if (top > tableBottom) {
            // Kamikaze Ball: drain is the GOAL. Force Field blocks it.
            if (game.kamikaze?.enabled) {
                // Shot-calling: deterministic, telegraphed drain resolution. The
                // machine's defense is locked at the release tick — beat it by
                // feinting and releasing before its reaction elapses. No hidden
                // coin flip: guarded lane = save (re-serve), open lane = drain.
                if (shotCallActive && shotState) {
                    if (ball.body.velocity.y <= 0) continue; // rising, not draining
                    // Terminal phases (saved/drained) are handled elsewhere; the
                    // frozen saved ball must not re-trigger drain processing.
                    if (shotState.phase === "saved" || shotState.phase === "drained") continue;
                    const coveredLane = guardLaneAt(shotState, shotState.releaseTick ?? tickCount);
                    const landingLane = laneForX(ball.body.position.x, table.width, shotState.lanes);
                    const result = resolveDrain(landingLane, coveredLane);
                    // Causal feedback: capture the full chain so the HUD can
                    // explain exactly why the shot saved or drained.
                    lastShotResult = {
                        calledLane: shotState.aimedLane,
                        accuracy: shotState.accuracy,
                        offset: shotState.releaseOffset,
                        landingLane,
                        guardLane: coveredLane,
                        result,
                    };
                    if (result === "save") {
                        playSoundEffect(GameSounds.AI_SAVE);
                        duckMusic(600, 0.35);
                        haptics.aiSave();
                        lastTauntText = "守: I read that lane.";
                        messageHandler(GameMessages.AI_TAUNT, 1400);
                        recordReplayEvent(tickCount, "save");
                        shotState.phase = "saved"; // terminal phase surfaces the causal feedback
                        // Freeze the ball at the gate and re-serve on a fixed tick
                        // offset — pause-safe, replay-safe, and no callback that
                        // could leak into a restarted run.
                        Body.setStatic(ball.body, true);
                        shotServeAtTick = tickCount + IMMERSION.shotCalling.savedHoldTicks;
                        continue;
                    }
                    playSoundEffect(GameSounds.DRAIN_VICTORY);
                    playFurinChime();
                    haptics.drainVictory();
                    messageHandler(GameMessages.DRAINED);
                    recordReplayEvent(tickCount, "drain");
                    removeBall(ball);
                    shotState.phase = "drained"; // terminal phase surfaces the causal feedback
                    const shotScore = getKamikazeScore(game.kamikaze, now);
                    game.kamikaze.completedBallScores.push(shotScore);
                    game.kamikaze.scoreFrozen = true;
                    game.score = getBestKamikazeScore(game.kamikaze);
                    endRound(game, 2000);
                    continue;
                }
                const rng = game.rng ?? Math.random;
                const aiSaveFeedback = () => {
                    playSoundEffect(GameSounds.AI_SAVE);
                    duckMusic(600, 0.35);
                    haptics.aiSave();
                    game.kamikaze.recentSaveAt = now; // A1: smug spike window
                    // B2: at max rank the machine is subdued, not smug.
                    lastTauntText = isSilentRank(playerRankName)
                        ? subduedSaveTaunt()
                        : getMoodTaunt(game.kamikaze.mood, false, rng);
                    messageHandler(GameMessages.AI_TAUNT, 1500);
                };
                if (ball.body.velocity.y <= 0) {
                    continue; // just kicked back up by a save — not draining
                }
                if (isDrainBlocked(game.kamikaze, now)) {
                    // Force Field active — ball bounces back from drain
                    engine.launchBall(ball.body, { x: 0, y: -LAUNCH_SPEED * 0.5 });
                    aiSaveFeedback();
                    continue;
                }
                // Dive (player agency): a queued dive bypasses the machine's
                // emergency save entirely, then clears itself.
                const diving = game.kamikaze.diveQueued;
                game.kamikaze.diveQueued = false;
                if (!diving && rollEmergencySave(game.kamikaze, now, lastNudgeAt, rng)) {
                    // Machine emergency save — kick the ball back up into the playfield
                    const towardCenter = Math.sign(table.width / 2 - ball.body.position.x);
                    const sideKick = towardCenter * (2 + rng() * 4);
                    engine.launchBall(ball.body, { x: sideKick, y: -LAUNCH_SPEED * 0.95 });
                    game.kamikaze.drainStreak = 0; // the machine broke the streak
                    aiSaveFeedback();
                    momentarySilence(IMMERSION.audioDodge.durationMs); // B3 audio dodge: the table holds its breath
                    continue;
                }
                // Drain successful! The blossom falls.
                recordReplayEvent(tickCount, "drain");
                setMood(game.kamikaze, "grieving", now); // A1: the guardian grieves
                lastTauntText = getMoodTaunt("grieving", true, rng);

                // Streak system: 3 consecutive drains without a save = UNSTOPPABLE
                game.kamikaze.drainStreak += 1;
                const unstoppable = game.kamikaze.drainStreak >= 3;
                if (unstoppable) game.kamikaze.drainStreak = 0;

                if (singleBall) {
                    // A2 KILL CAM — the signature moment. Freeze the score
                    // BEFORE the drama (hard rule 3), capture the ball in the
                    // drain's gravity well, dilate time, and let the
                    // presentation layer push the camera. removeBall + endRound
                    // follow after the 900ms sequence so the slow-mo has a subject.
                    const ballScore = getKamikazeScore(game.kamikaze, now);
                    game.kamikaze.completedBallScores.push(ballScore);
                    game.kamikaze.scoreFrozen = true;
                    game.score = getBestKamikazeScore(game.kamikaze);
                    startKillCam(game, ball, unstoppable);
                } else {
                    // Intermediate multiball drain: quick feedback, no kill cam.
                    playSoundEffect(GameSounds.DRAIN_VICTORY);
                    playFurinChime();
                    duckMusic(1000, 0.2);
                    haptics.drainVictory();
                    messageHandler(GameMessages.DRAINED);
                    messageHandler(GameMessages.AI_TAUNT, 2000);
                    removeBall(ball);
                    if (unstoppable) {
                        messageHandler(GameMessages.UNSTOPPABLE);
                        requestSlowMo(1200, 0.2);
                    }
                }
                continue;
            }

            // Normal mode: drain is a failure
            recordReplayEvent(tickCount, "drain");
            removeBall(ball);

            if (singleBall) {
                if ((window.performance.now() - roundStart) < RETRY_TIMEOUT && !tilt) {
                    // lost ball directly at game start, let's give the player another chance
                    createBall(table.poppers[0].left, table.poppers[0].top - BALL_HEIGHT);
                    messageHandler(GameMessages.TRY_AGAIN);
                } else {
                    endRound(game);
                }
            }
        }
    }
}

function mapActor(actor: Actor, optId?: number): void {
    actorMap.set(optId ?? actor.body.id, actor);
}

function removeActor(actor: Actor): void {
    actorMap.delete(actor.body.id);
    actor.dispose(engine);
}

function removeBall(ball: Ball): void {
    const index = balls.indexOf(ball);
    if (index >= 0) {
        balls.splice(index, 1);
    }
    removeActor(ball);
}

function createBall(left: number, top: number): Ball {
    const ball = new Ball({ left, top, width: BALL_WIDTH, height: BALL_HEIGHT }, engine, canvas);
    mapActor(ball);
    balls.push(ball);
    recordReplayEvent(tickCount, "spawn");

    return ball;
}

function createMultiball(amount: number, left: number, top: number): void {
    for (let i = 0; i < amount; ++i) {
        setTimeout(() => createBall(left - (BALL_WIDTH * i), top), 150 * i);
    }
}

/**
 * Shot-calling: return the ball to the plunger for a fresh serve after a save.
 * The held ball is static until the player releases the next shot.
 */
function serveShotCallBall(): void {
    const newBall = createBall(table.poppers[0].left, table.poppers[0].top - BALL_HEIGHT);
    Body.setStatic(newBall.body, true);
    if (shotState) {
        const rng = gameRef?.rng ?? Math.random;
        const isHold = shotVariant === "feint" && rng() < IMMERSION.shotCalling.holdChance;
        const policy = isHold ? "hold" : "chase";
        const guard = (shotVariant === "precision" || isHold) ? Math.floor(rng() * shotState.lanes) : null;
        shotState = beginServe(shotState, tickCount, guard, policy);
    }
    recordReplayEvent(tickCount, "serve");
}

/**
 * A2 KILL CAM — the signature moment of every run. The score is already
 * frozen by the caller (hard rule 3); this directs the 900ms drama:
 * capture the ball in the drain's gravity well (static, so it hangs while
 * time dilates instead of vanishing), deep-slow the simulation, land the
 * deep taiko + furin + grief line, and signal the presentation layer to
 * push the camera. removeBall + endRound follow once the sequence lands.
 *
 * Suppressed during ghost replay viewing (setKillCamEnabled(false)) so the
 * comparison timeline stays pure — the ball is then removed immediately.
 */
function startKillCam(game: GameDef, ball: Ball, unstoppable: boolean): void {
    if (!killCamEnabled) {
        playSoundEffect(GameSounds.DRAIN_VICTORY);
        playFurinChime();
        duckMusic(1000, 0.2);
        haptics.drainVictory();
        messageHandler(GameMessages.DRAINED);
        messageHandler(GameMessages.AI_TAUNT, 2000);
        removeBall(ball);
        endRound(game, 2000);
        return;
    }

    // Capture: a static body has zero velocity, which both freezes the ball
    // in the drain glow AND makes the drain-guard (velocity.y <= 0) skip it
    // on subsequent ticks — so the cam never re-triggers.
    Body.setStatic(ball.body, true);

    requestSlowMo(IMMERSION.killCam.durationMs, IMMERSION.killCam.timeScale); // deeper + longer than the proximity auto slow-mo
    duckMusic(IMMERSION.killCam.durationMs, IMMERSION.killCam.duckLevel);
    playTaikoHit(true);          // deep variant — the gate closes
    playFurinChime();
    haptics.drainVictory();
    messageHandler(GameMessages.DRAINED);
    messageHandler(GameMessages.AI_TAUNT, 2000);
    if (unstoppable) messageHandler(GameMessages.UNSTOPPABLE);

    pendingKillCam = true;       // presentation: camera push on containerRef

    window.setTimeout(() => {
        removeBall(ball);
        endRound(game, 2000);
    }, IMMERSION.killCam.releaseDelayMs);
}

function endRound(game: GameDef, timeout = 3500): void {
    playSoundEffect(GameSounds.BALL_OUT);
    setFrequency(1000);
    roundEndHandler(() => {
        for (ball of balls) {
            removeBall(ball); // in case round ended on tilt without ball dropping
        }
        if (--game.balls === 0) {
            game.active = false;
        } else {
            startRound(game);
        }
    }, timeout);
}

function startRound(game: GameDef): void {
    const newBall = createBall(table.poppers[0].left, table.poppers[0].top - BALL_HEIGHT);
    setFrequency();
    // Shot-calling serve: hold the ball at the plunger and open the intent
    // moment. The player aims, MAMORU contests, a timed release launches it.
    if (shotCallActive) {
        shotServeAtTick = null; // a fresh serve supersedes any pending re-serve
        Body.setStatic(newBall.body, true);
        const reactionMs = IMMERSION.shotCalling.reactionMs[game.aiDifficulty ?? "medium"];
        const rng = game.rng ?? Math.random;
        // Feint hold: MAMORU picks a fixed lane to guard (like precision but
            // hidden — the flipper embodiment reveals it once the player aims).
        // Chase: no pre-committed guard (MAMORU reacts to the aim).
        const isHold = shotVariant === "feint" && rng() < IMMERSION.shotCalling.holdChance;
        const policy = isHold ? "hold" : "chase";
        const guard = (shotVariant === "precision" || isHold) ? Math.floor(rng() * IMMERSION.shotCalling.lanes) : null;
        shotState = createShotState(shotVariant, IMMERSION.shotCalling.lanes, reactionMs, tickCount, guard, policy);
        recordReplayEvent(tickCount, "serve");
    }
    timeScale = 1;
    targetTimeScale = 1;
    prevRubberBandBias = 0.5;

    if (game.balls === BALLS_PER_GAME) {
        roundStart = window.performance.now();
        // B1: MAMORU greets you once per run, from persistent memory. Cosmetic
        // only — never touches physics (hard rule 2).
        if (game.kamikaze?.enabled) {
            lastTauntText = greetingLine(machineMemory, playerRankName);
            messageHandler(GameMessages.AI_TAUNT, 2600);
        }
    }

    // Kamikaze Ball: track round start time for scoring
    if (game.kamikaze?.enabled) {
        game.kamikaze.roundStartTime = window.performance.now();
        game.kamikaze.totalBumperHits = 0;
        game.kamikaze.totalTriggerGroupCompletions = 0;
        game.kamikaze.activePowerUps = [];
        game.kamikaze.aiFlipperReleaseAt = [];
        game.kamikaze.aiSavesUsed = 0;
        game.kamikaze.scoreFrozen = false;
        game.kamikaze.diveQueued = false;
        game.kamikaze.storedPowerUp = null;
        game.kamikaze.underworldCharge = 0;
        game.kamikaze.drainStreak = 0;
        game.kamikaze.mood = "calm";
        game.kamikaze.moodSince = window.performance.now();
        game.kamikaze.recentSaveAt = -Infinity;

        if (ghostActive) {
            ghostActive = false;
            setBumperGhostMode(false);
            for (const bumper of bumpers) {
                bumper.body.isSensor = false;
            }
        }
        if (frenzyActive) {
            frenzyActive = false;
            setBumperFrenzyMode(false);
        }
    }

    tilt = false;
    inUnderworld = false;
    game.underworld = false;
    game.multiplier = 1;
}

export function getBallPosition(): { x: number; y: number } | null {
    if (balls.length === 0) return null;
    const primaryBall = balls[0];
    return { x: primaryBall.body.position.x, y: primaryBall.body.position.y };
}

export function getBallCount(): number {
    return balls.length;
}

/**
 * Kamikaze Ball: nudge the ball toward a tap location.
 * Called from the UI layer on touch/click events.
 * `power` (1-3) scales the impulse for charged hold-nudges.
 */
// B1: when the player's nudges become readable (one direction ≥60% of ≥10
// nudges), MAMORU calls it out — throttled, and only re-fires when the read
// changes. Cosmetic; never affects physics (hard rule 2).
function maybeHabitTaunt(now: number): void {
    const label = dominantHabit(runHabits);
    if (!label || label === lastHabitCalled) return;
    if (now - lastHabitTauntAt < IMMERSION.habits.calloutThrottleMs) return;
    lastHabitTauntAt = now;
    lastHabitCalled = label;
    lastTauntText = habitTaunt(label);
    messageHandler(GameMessages.AI_TAUNT, 1500);
}

export const nudgeBallToward = (tapX: number, tapY: number, power = 1): void => {
    if (!gameRef?.kamikaze?.enabled || balls.length === 0) return;
    const ballBody = balls[0].body;
    lastNudgeAt = window.performance.now();
    recordReplayEvent(tickCount, "nudge", tapX, tapY);
    nudgeBall(engine, ballBody, tapX, tapY, power);
    // B1: bucket the nudge direction so MAMORU can learn your habits.
    const third = table.width / 3;
    if (tapX < third) runHabits.left++;
    else if (tapX < third * 2) runHabits.center++;
    else runHabits.right++;
    maybeHabitTaunt(lastNudgeAt);
};

/**
 * Kamikaze Ball: queue a deliberate dive. The next drain bypasses the
 * machine's emergency save (but not an active Force Field).
 */
export const queueDive = (): boolean => {
    if (!gameRef?.kamikaze?.enabled) return false;
    gameRef.kamikaze.diveQueued = true;
    runHabits.dives++;
    recordReplayEvent(tickCount, "dive");
    return true;
};

/**
 * Kamikaze Ball: is a munition currently banked? Used to gate double-tap
 * deploy so a double nudge with an empty bank isn't swallowed.
 */
export const hasStoredMunition = (): boolean =>
    Boolean(gameRef?.kamikaze?.enabled) && gameRef!.kamikaze!.storedPowerUp !== null;

/**
 * Kamikaze Ball: deploy the banked munition (player agency).
 * Returns the deployed power-up type, or null if none was stored.
 */
export const deployStoredMunition = (): number | null => {
    if (!gameRef?.kamikaze?.enabled) return null;
    const type = deployStoredPowerUp(gameRef.kamikaze, window.performance.now());
    if (type !== null) {
        recordReplayEvent(tickCount, "deploy");
    }
    return type;
};
/**
 * Kamikaze Ball: fire tilt-lock (player agency). Freezes the machine's AI
 * flippers for a short window on a cooldown. Returns false if on cooldown.
 */
export const triggerTiltLock = (): boolean => {
    if (!gameRef?.kamikaze?.enabled) return false;
    const fired = triggerTiltLockKamikaze(gameRef.kamikaze, window.performance.now());
    if (fired) {
        runHabits.tiltLocks++;
        recordReplayEvent(tickCount, "tiltlock");
    }
    return fired;
};
/**
 * Kamikaze Ball: grant a boon (player-side power-up) for a fixed duration.
 * Used by Kami Trials to reward a successful pause-time challenge. The type
 * comes from the trial's curated pool; the duration scales with accuracy.
 * Returns false if no kamikaze run is active.
 */
export const grantBoon = (type: number, durationMs: number): boolean => {
    if (!gameRef?.kamikaze?.enabled) return false;
    activatePowerUp(gameRef.kamikaze, type as PowerUpType, "player", window.performance.now(), durationMs);
    return true;
};

/**
 * Kamikaze Ball: check if the mode is active.
 */
export const isKamikazeMode = (): boolean => {
    return gameRef?.kamikaze?.enabled ?? false;
};

/**
 * Kamikaze Ball: the taunt to display for the last AI_TAUNT message.
 */
export const getLastTaunt = (): string => {
    return lastTauntText;
};

/**
 * B1: this run's accumulated habit counters, for folding into persistent
 * machine memory at run end. Returns a copy so callers can't mutate state.
 */
export const getRunHabits = (): MachineHabits => ({ ...runHabits });

// ── Shot-calling control (serve-based duel) ─────────────────────
// Input is deliberately sparse: aim a lane, release on timing. No continuous
// steering. Everything is tick-stamped + seeded so replays re-simulate.

/** Player signals (or feints to) a target lane during the intent moment. */
export const shotAim = (lane: number): void => {
    if (!shotCallActive || !shotState || shotState.phase !== "aiming") return;
    shotState = signalAim(shotState, lane, tickCount);
    recordReplayEvent(tickCount, "aim", lane);
};

/** Player releases the shot: timing sets accuracy, physics takes over. */
export const shotRelease = (): void => {
    if (!shotCallActive || !shotState || balls.length === 0) return;
    if (!canRelease(shotState, tickCount)) return; // feint: locked until the bait commits
    const ball = balls[0];
    const { accuracy, offset, launch } = resolveRelease(shotState, tickCount, LAUNCH_SPEED);
    shotState.releaseTick = tickCount;
    shotState.accuracy = accuracy;
    shotState.releaseOffset = offset;
    shotState.phase = "resolving";
    recordReplayEvent(tickCount, "release");
    Body.setStatic(ball.body, false);
    engine.launchBall(ball.body, launch);
};

export const isShotCallMode = (): boolean => shotCallActive;
export const getShotVariant = (): ShotVariant => shotVariant;
export const getShotPhase = (): string => shotState?.phase ?? "aiming";
export const getShotAimedLane = (): number | null => shotState?.aimedLane ?? null;
export const getShotLanes = (): number => shotState?.lanes ?? IMMERSION.shotCalling.lanes;
export const getShotAccuracy = (): number => shotState?.accuracy ?? 0;
export const getShotMeterPosition = (): number => (shotState ? meterPosition(shotState, tickCount) : 0);
export const getLastShotResult = (): ShotResult | null => lastShotResult;
export const getShotCanRelease = (): boolean => (shotState ? canRelease(shotState, tickCount) : false);
export const getShotFeintStage = (): FeintStage => (shotState ? feintStage(shotState, tickCount) : "idle");

/** The lane MAMORU is guarding. While aiming it tracks live (so the player sees
 *  the machine react); during flight it is locked at the release tick. */
export const getShotGuardLane = (): number | null => {
    if (!shotState) return null;
    const at = shotState.phase === "aiming" ? tickCount : (shotState.releaseTick ?? tickCount);
    return guardLaneAt(shotState, at);
};
