import * as Matter from "matter-js";
import {
    storyReducer,
    type StoryEvent,
    type StoryState,
} from "@/model/story-run";
import type { SealId } from "@/model/shrine-chapter";

export type StoryTargetId = "shrine" | "west" | "east" | "gate";
export type StoryTarget = { id: StoryTargetId; x: number; y: number; radius: number; label: string };

export type StoryTable = {
    getState(): StoryState;
    getTargets(): StoryTarget[];
    isHeld(): boolean;
    setBall(ball: Matter.Body): void;
    action(event: StoryEvent): void;
    launch(): void;
    nudge(x: number, y: number, power?: number): void;
    drain(): void;
    step(tick: number): void;
    destroy(): void;
};

export const STORY_SHRINE = { x: 200, y: 940, r: 42 };
export const STORY_GATE = { x: 385, y: 695, w: 92, h: 18 };
const SHRINE_LABEL = "story-shrine";
const GATE_LABEL = "story-gate";
const SEAL_COOLDOWN = 180;
const NUDGE_COOLDOWN = 14;
const STILL_LIMIT = 180;
const LAUNCH_SPEED = 18;
const MAX_SPEED = 22;

export function attachStoryTable(opts: {
    engine: Matter.Engine;
    state: StoryState;
    seals: [Matter.Body, Matter.Body];
    onChange: (state: StoryState) => void;
    onFreeze: (frozen: boolean) => void;
}): StoryTable {
    const { engine, seals, onChange, onFreeze } = opts;
    let state = opts.state;
    let destroyed = false;
    let ball: Matter.Body | null = null;
    let held = false;
    let serve = { x: 0, y: 0 };
    let capturedAtShrine = false;
    let savedVelocity = { x: 0, y: 0 };
    let lastTick = 0;
    let lastNudgeTick = -Infinity;
    let stillTicks = 0;
    let stillAnchor = { x: 0, y: 0 };
    let drainArmed = true;
    let frozen = false;
    const sealCooldown: Record<SealId, number> = { west: -Infinity, east: -Infinity };
    let shrineCooldownUntil = -Infinity;
    let gateCooldownUntil = -Infinity;

    const shrineBody = Matter.Bodies.circle(STORY_SHRINE.x, STORY_SHRINE.y, STORY_SHRINE.r, {
        isStatic: true,
        isSensor: true,
        label: SHRINE_LABEL,
    });
    const gateBody = Matter.Bodies.rectangle(STORY_GATE.x, STORY_GATE.y, STORY_GATE.w, STORY_GATE.h, {
        isStatic: true,
        isSensor: state.seals.length === 2,
        label: GATE_LABEL,
    });
    Matter.Composite.add(engine.world, [shrineBody, gateBody]);

    const sealBodies: Record<SealId, Matter.Body> = { west: seals[0], east: seals[1] };

    function apply(next: StoryState) {
        if (next === state) return;
        const wasPlaying = state.phase === "playing";
        state = next;
        const playing = next.phase === "playing";
        const terminal = next.phase === "lost" || next.phase === "won";
        gateBody.isSensor = next.seals.length === 2;
        if (wasPlaying && !playing && ball && !terminal) {
            if (next.phase === "lesson") {
                // The ball is captured where it met the shrine; the trial dialog
                // plays out above a frozen ball.
                capturedAtShrine = true;
                Matter.Body.setStatic(ball, true);
            } else {
                // Dialog pauses (blessing / gate-opening): freeze mid-flight and
                // restore the exact velocity when the run resumes.
                capturedAtShrine = false;
                savedVelocity = { x: ball.velocity.x, y: ball.velocity.y };
                Matter.Body.setStatic(ball, true);
            }
        }
        if (terminal && ball) {
            // End screens cradle the ball at the plunger, from any prior phase
            // (a live fall, a shrine capture, a mid-flight dialog): it must not
            // hang below the drain — the viewport follows the ball into the
            // void — and a retry must relaunch cleanly instead of inheriting
            // the terminal fall velocity.
            capturedAtShrine = false;
            savedVelocity = { x: 0, y: 0 };
            holdBall();
        }
        if (playing && !wasPlaying && ball) {
            releaseBall();
        }
        const shouldFreeze = !playing && !terminal;
        if (shouldFreeze !== frozen) {
            frozen = shouldFreeze;
            onFreeze(frozen);
        }
        onChange(next);
    }

    function releaseBall() {
        if (!ball || destroyed) return;
        Matter.Body.setStatic(ball, false);
        if (capturedAtShrine) {
            Matter.Body.setPosition(ball, { x: STORY_SHRINE.x, y: STORY_SHRINE.y + 70 });
            Matter.Body.setVelocity(ball, { x: 2, y: 4 });
            shrineCooldownUntil = lastTick + SEAL_COOLDOWN;
        } else {
            const v = savedVelocity;
            const speed = Math.hypot(v.x, v.y);
            Matter.Body.setVelocity(ball, speed < 0.5 ? { x: v.x, y: -6 } : v);
        }
        capturedAtShrine = false;
        held = false;
        stillTicks = 0;
        stillAnchor = { x: ball.position.x, y: ball.position.y };
    }

    function holdBall() {
        if (!ball) return;
        if (!ball.isStatic) Matter.Body.setStatic(ball, true);
        Matter.Body.setVelocity(ball, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(ball, 0);
        Matter.Body.setPosition(ball, serve);
        held = true;
        stillTicks = 0;
        stillAnchor = { ...serve };
        drainArmed = true;
    }

    const onCollision = (e: Matter.IEventCollision<Matter.Engine>) => {
        if (destroyed || !ball || state.phase !== "playing" || ball.isStatic) return;
        for (const pair of e.pairs) {
            const other = pair.bodyA === ball ? pair.bodyB : pair.bodyB === ball ? pair.bodyA : null;
            if (!other || state.phase !== "playing") continue;
            if (other === shrineBody) {
                if (lastTick < shrineCooldownUntil) continue;
                apply(storyReducer(state, { type: "shrine" }));
            } else if (other === sealBodies.west || other === sealBodies.east) {
                const id: SealId = other === sealBodies.west ? "west" : "east";
                if (lastTick - sealCooldown[id] < SEAL_COOLDOWN) continue;
                sealCooldown[id] = lastTick;
                apply(storyReducer(state, { type: "seal", id }));
            } else if (other === gateBody) {
                if (state.seals.length === 2) {
                    apply(storyReducer(state, { type: "gate" }));
                } else if (lastTick >= gateCooldownUntil) {
                    gateCooldownUntil = lastTick + SEAL_COOLDOWN;
                    apply(storyReducer(state, { type: "gate" }));
                }
            }
        }
    };
    Matter.Events.on(engine, "collisionStart", onCollision);

    return {
        getState: () => state,
        getTargets() {
            const radiusOf = (b: Matter.Body) => (b.circleRadius ?? Math.max(b.bounds.max.x - b.bounds.min.x, b.bounds.max.y - b.bounds.min.y) / 2);
            return [
                { id: "shrine", x: STORY_SHRINE.x, y: STORY_SHRINE.y, radius: STORY_SHRINE.r, label: "Water Shrine" },
                { id: "west", x: sealBodies.west.position.x, y: sealBodies.west.position.y, radius: radiusOf(sealBodies.west), label: "Fire Seal I" },
                { id: "east", x: sealBodies.east.position.x, y: sealBodies.east.position.y, radius: radiusOf(sealBodies.east), label: "Fire Seal II" },
                { id: "gate", x: STORY_GATE.x, y: STORY_GATE.y, radius: STORY_GATE.w / 2, label: "Torii Gate" },
            ];
        },
        isHeld: () => held,
        setBall(b: Matter.Body) {
            ball = b;
            serve = { x: b.position.x, y: b.position.y };
            holdBall();
        },
        action(event: StoryEvent) {
            if (destroyed) return;
            apply(storyReducer(state, event));
        },
        launch() {
            if (destroyed || !ball || !held || state.phase !== "playing" || frozen) return;
            held = false;
            drainArmed = true;
            Matter.Body.setStatic(ball, false);
            Matter.Body.setVelocity(ball, { x: 0, y: -LAUNCH_SPEED });
            stillTicks = 0;
            stillAnchor = { x: ball.position.x, y: ball.position.y };
        },
        nudge(x: number, y: number, power = 1) {
            if (destroyed || !ball || held || ball.isStatic || state.phase !== "playing") return;
            if (lastTick - lastNudgeTick < NUDGE_COOLDOWN) return;
            lastNudgeTick = lastTick;
            const dx = x - ball.position.x;
            const dy = y - ball.position.y;
            const len = Math.hypot(dx, dy) || 1;
            const p = Math.max(1, Math.min(3, power));
            const v = ball.velocity;
            Matter.Body.setVelocity(ball, {
                x: v.x * 0.4 + (dx / len) * 8 * p,
                y: v.y * 0.4 + (dy / len) * 8 * p,
            });
            const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
            if (speed > MAX_SPEED) {
                Matter.Body.setVelocity(ball, { x: ball.velocity.x / speed * MAX_SPEED, y: ball.velocity.y / speed * MAX_SPEED });
            }
        },
        drain() {
            if (destroyed || !ball || !drainArmed || held) return;
            drainArmed = false;
            apply(storyReducer(state, { type: "drain" }));
            if (state.phase !== "lost") {
                holdBall();
            }
        },
        step(tick: number) {
            lastTick = tick;
            if (destroyed || !ball || held || ball.isStatic || state.phase !== "playing") return;
            const p = ball.position;
            const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
            if (Math.hypot(p.x - stillAnchor.x, p.y - stillAnchor.y) > 3 || speed > 0.2) {
                stillAnchor = { x: p.x, y: p.y };
                stillTicks = 0;
            } else if (++stillTicks >= STILL_LIMIT) {
                holdBall();
                apply(storyReducer(state, { type: "ball-search" }));
            }
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            Matter.Events.off(engine, "collisionStart", onCollision);
            Matter.Composite.remove(engine.world, [shrineBody, gateBody]);
            if (frozen) {
                frozen = false;
                onFreeze(false);
            }
        },
    };
}
