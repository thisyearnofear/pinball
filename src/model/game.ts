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
import { enqueueTrack, setFrequency, playSoundEffect } from "@/services/audio-service";
import {
    createKamikazeState, updateAIFlippers, getKamikazeScore, applyPowerUpEffects,
    hasPowerUp, rollPowerUp, activatePowerUp, cleanupPowerUps, shouldSpawnCrate,
    recordCrateSpawn, getRandomTaunt, nudgeBall, isDrainBlocked,
    updateRubberBand,
} from "@/model/kamikaze";
import { setKamikazeMode as setBumperKamikazeMode } from "@/renderers/bumper-renderer";

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

const ENGINE_INCREMENT = 1000 / FRAME_RATE;
let accumulator = 0;

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
    gameRef = game; // store reference for external access (flipper control, nudge)

    // Initialize Kamikaze Ball state if the game has it enabled
    if (game.kamikaze?.enabled) {
        setBumperKamikazeMode(true);
        messageHandler(GameMessages.KAMIKAZE_START, 3000);
    } else {
        setBumperKamikazeMode(false);
    }

    // 1. clean up previous instances, when existing

    for (const actor of actorMap.values()) {
        actor.dispose(engine);
    }
    actorMap.clear();
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
                case ActorLabels.BUMPER:
                    awardPoints(game, AwardablePoints.BUMPER);
                    // Kamikaze Ball: bumper hits add penalty time (kept ball alive)
                    if (game.kamikaze?.enabled) {
                        game.kamikaze.totalBumperHits++;
                    }
                    (actorMap.get(pair.bodyA.id) as Bumper).collided = true;
                    playSoundEffect(GameSounds.BUMPER);
                    break;
                case ActorLabels.TRIGGER:
                    const triggerGroup = actorMap.get(pair.bodyA.id) as TriggerGroup;
                    const groupCompleted = triggerGroup?.trigger(pair.bodyA.id);

                    // Kamikaze Ball: trigger hits can spawn munitions crates
                    if (game.kamikaze?.enabled) {
                        const now = window.performance.now();
                        if (shouldSpawnCrate(game.kamikaze, now)) {
                            recordCrateSpawn(game.kamikaze, now);
                            updateRubberBand(game.kamikaze, now);
                            const { type, side } = rollPowerUp(game.kamikaze);
                            activatePowerUp(game.kamikaze, type, side, now);
                            playSoundEffect(GameSounds.POWERUP_ROULETTE);
                            messageHandler(side === "player" ? GameMessages.POWERUP_PLAYER : GameMessages.POWERUP_MACHINE);
                        }
                    }

                    if (triggerGroup.triggerType !== TriggerTypes.SERIES) {
                        awardPoints(game, AwardablePoints.TRIGGER);
                        if (!groupCompleted) {
                            playSoundEffect(GameSounds.TRIGGER);
                        }
                    }

                    if (groupCompleted) {
                        switch (triggerGroup.triggerTarget) {
                            default:
                                break;
                            case TriggerTarget.UNDERWORLD: {
                                game.underworld = true;
                                awardPoints(game, AwardablePoints.UNDERWORLD_UNLOCKED);
                                messageHandler(GameMessages.UNDERWORLD_UNLOCKED);
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
        engine.launchBall(ball.body, { x: Math.random() * horizontalForce, y: -BUMP_IMPULSE });
    }
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

    const delta = ENGINE_INCREMENT * framesSinceLastRender;
    accumulator += delta;

    // avoid spiral of death when lag is huge
    if (accumulator > 250) {
        accumulator = 250;
    }

    while (accumulator >= ENGINE_INCREMENT) {
        engine.update(ENGINE_INCREMENT);
        accumulator -= ENGINE_INCREMENT;
    }

    // update Actors

    actorMap.forEach(actor => actor.update(timestamp));

    // align viewport with main (lowest) ball

    if (balls.length > 1) {
        balls.sort((a, b) => a.bounds.top === b.bounds.top ? 0 : a.bounds.top > b.bounds.top ? -1 : 1);
        ball = balls[0];
    }

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
    game.score += (points * game.multiplier);
}

function handleEngineUpdate(engine: IPhysicsEngine, game: GameDef): void {
    const singleBall = balls.length === 1;
    const now = window.performance.now();

    // Kamikaze Ball: update AI flippers, power-ups, and score
    if (game.kamikaze?.enabled) {
        const ballPos = balls.length > 0 ? getBallPosition() : null;
        const ballVel = balls.length > 0
            ? { x: balls[0].body.velocity.x, y: balls[0].body.velocity.y }
            : null;

        updateAIFlippers(game.kamikaze, flippers, ballPos, ballVel, now);
        updateRubberBand(game.kamikaze, now);

        if (balls.length > 0) {
            applyPowerUpEffects(game.kamikaze, engine, balls[0].body, table.height, now);
        }

        // Update score = time alive + penalties
        game.score = getKamikazeScore(game.kamikaze, now);
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
                if (isDrainBlocked(game.kamikaze, now)) {
                    // Force Field active — ball bounces back from drain
                    engine.launchBall(ball.body, { x: 0, y: -LAUNCH_SPEED * 0.5 });
                    messageHandler(GameMessages.SAVED, 1500);
                    continue;
                }
                // Drain successful! Record score and show taunt
                playSoundEffect(GameSounds.DRAIN_VICTORY);
                messageHandler(GameMessages.DRAINED, 2000);
                removeBall(ball);

                if (singleBall) {
                    endRound(game, 2000);
                }
                continue;
            }

            // Normal mode: drain is a failure
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

    return ball;
}

function createMultiball(amount: number, left: number, top: number): void {
    for (let i = 0; i < amount; ++i) {
        setTimeout(() => createBall(left - (BALL_WIDTH * i), top), 150 * i);
    }
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
    createBall(table.poppers[0].left, table.poppers[0].top - BALL_HEIGHT);
    setFrequency();

    if (game.balls === BALLS_PER_GAME) {
        roundStart = window.performance.now();
    }

    // Kamikaze Ball: track round start time for scoring
    if (game.kamikaze?.enabled) {
        game.kamikaze.roundStartTime = window.performance.now();
        game.kamikaze.totalBumperHits = 0;
        game.kamikaze.activePowerUps = [];
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
 */
export const nudgeBallToward = (tapX: number, tapY: number): void => {
    if (!gameRef?.kamikaze?.enabled || balls.length === 0) return;
    const ballBody = balls[0].body;
    nudgeBall(engine, ballBody, tapX, tapY);
};

/**
 * Kamikaze Ball: check if the mode is active.
 */
export const isKamikazeMode = (): boolean => {
    return gameRef?.kamikaze?.enabled ?? false;
};
