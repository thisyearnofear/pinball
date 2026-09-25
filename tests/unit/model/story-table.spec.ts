import * as Matter from "matter-js";
import { afterEach, describe, expect, it } from "vitest";
import { attachStoryTable, STORY_GATE, STORY_SHRINE, type StoryTable } from "@/model/story-table";
import { createStoryState, type StoryState } from "@/model/story-run";

function makeWorld(state: StoryState = createStoryState({ learned: false })) {
    const engine = Matter.Engine.create();
    engine.gravity.y = 0;
    const ball = Matter.Bodies.circle(400, 1100, 12, { label: "ball", friction: 0, frictionAir: 0, restitution: 0 });
    const west = Matter.Bodies.circle(300, 300, 40, { isStatic: true, label: "bumper" });
    const east = Matter.Bodies.circle(500, 300, 40, { isStatic: true, label: "bumper" });
    Matter.Composite.add(engine.world, [ball, west, east]);
    const changes: StoryState[] = [];
    const freezes: boolean[] = [];
    const events: string[] = [];
    const table = attachStoryTable({
        engine,
        state,
        seals: [west, east],
        onChange: (s) => changes.push(s),
        onFreeze: (f) => freezes.push(f),
        onEvent: (s) => events.push(s.phase),
    });
    table.setBall(ball);
    return { engine, ball, west, east, table, changes, freezes, events };
}

let tick = 0;
function advance(engine: Matter.Engine, table: StoryTable, steps: number) {
    for (let i = 0; i < steps; i++) {
        tick += 1;
        table.step(tick);
        Matter.Engine.update(engine, 16.666);
    }
}

function put(ball: Matter.Body, x: number, y: number, vx = 0, vy = 0) {
    Matter.Body.setPosition(ball, { x, y });
    Matter.Body.setVelocity(ball, { x: vx, y: vy });
}

let world: ReturnType<typeof makeWorld> | null = null;
afterEach(() => {
    world?.table.destroy();
    world = null;
});

describe("attachStoryTable", () => {
    it("reports shrine, both seal bodies, and the gate as targets", () => {
        world = makeWorld();
        const targets = world.table.getTargets();
        expect(targets.map(t => t.id)).toEqual(["shrine", "west", "east", "gate"]);
        const west = targets.find(t => t.id === "west")!;
        expect(west.x).toBeCloseTo(300);
        expect(west.y).toBeCloseTo(300);
        expect(world.table.isHeld()).toBe(true);
    });

    it("launches a held ball and physically captures it at the shrine", () => {
        world = makeWorld();
        const { engine, ball, table, freezes } = world;
        put(ball, STORY_SHRINE.x, STORY_SHRINE.y + 200);
        table.launch();
        expect(ball.isStatic).toBe(false);
        // Drive the ball down into the shrine sensor.
        put(ball, STORY_SHRINE.x, STORY_SHRINE.y - 60, 0, 6);
        advance(engine, table, 60);
        expect(table.getState().phase).toBe("lesson");
        expect(ball.isStatic).toBe(true);
        expect(freezes).toEqual([true]);
    });

    it("releases the same ball on continue after a mastered trial", () => {
        world = makeWorld();
        const { engine, ball, table } = world;
        table.launch();
        put(ball, STORY_SHRINE.x, STORY_SHRINE.y - 60, 0, 6);
        advance(engine, table, 60);
        const s = table.getState();
        expect(s.phase).toBe("lesson");
        const before = Matter.Composite.allBodies(engine.world).length;
        table.action({ type: "trial-result", encounterId: s.encounterId, outcome: "mastered" });
        expect(table.getState().phase).toBe("blessing");
        expect(ball.isStatic).toBe(true);
        // Stale/duplicate outcomes are rejected.
        table.action({ type: "trial-result", encounterId: 0, outcome: "failed" });
        expect(table.getState().phase).toBe("blessing");
        table.action({ type: "continue" });
        expect(table.getState().phase).toBe("playing");
        expect(ball.isStatic).toBe(false);
        expect(Number.isNaN(ball.velocity.x)).toBe(false);
        expect(Matter.Composite.allBodies(engine.world).length).toBe(before);
        // Ejected below the shrine, moving away.
        expect(ball.position.y).toBeGreaterThan(STORY_SHRINE.y);
    });

    it("dedupes seal contacts, requires Water, and opens the gate on the second distinct seal", () => {
        world = makeWorld(createStoryState({ learned: true }));
        const { engine, ball, table, west, east } = world;
        table.launch();
        // Unarmed seal contact costs integrity.
        put(ball, west.position.x, west.position.y + 60, 0, -6);
        advance(engine, table, 30);
        expect(table.getState().integrity).toBe(2);
        expect(table.getState().seals).toEqual([]);
        // Repeated contact inside the cooldown does not drain again.
        put(ball, west.position.x, west.position.y + 60, 0, -6);
        advance(engine, table, 30);
        expect(table.getState().integrity).toBe(2);
        // Let the seal cooldown expire with the ball drifting in empty space.
        put(ball, 650, 1000, 0, -1);
        advance(engine, table, 200);
        // Arm and quench west.
        table.action({ type: "arm" });
        put(ball, west.position.x, west.position.y + 60, 0, -6);
        advance(engine, table, 40);
        expect(table.getState().seals).toEqual(["west"]);
        expect(table.getState().armed).toBe(false);
        // Gate is still a solid body — the ball cannot pass.
        const gate = Matter.Composite.allBodies(engine.world).find(b => b.label === "story-gate")!;
        expect(gate.isSensor).toBe(false);
        // Second distinct seal opens it.
        table.action({ type: "arm" });
        put(ball, east.position.x, east.position.y + 60, 0, -6);
        advance(engine, table, 30);
        expect(table.getState().phase).toBe("gate-opening");
        expect(gate.isSensor).toBe(true);
        expect(ball.isStatic).toBe(true);
        table.action({ type: "continue" });
        expect(table.getState().phase).toBe("playing");
        // Physically crossing the open gate wins.
        put(ball, STORY_GATE.x, STORY_GATE.y + 40, 0, -6);
        advance(engine, table, 30);
        expect(table.getState().phase).toBe("won");
    });

    it("a locked gate blocks the ball and emits sealed feedback without winning", () => {
        world = makeWorld(createStoryState({ learned: true }));
        const { engine, ball, table } = world;
        table.launch();
        put(ball, STORY_GATE.x, STORY_GATE.y + 40, 0, -6);
        advance(engine, table, 60);
        const s = table.getState();
        expect(s.phase).toBe("playing");
        expect(s.notice).toContain("sealed");
        // The solid gate stopped the ball below it.
        expect(ball.position.y).toBeGreaterThan(STORY_GATE.y);
    });

    it("drain costs integrity once and re-holds the ball without auto-launch", () => {
        world = makeWorld();
        const { ball, table } = world;
        table.launch();
        table.drain();
        expect(table.getState().integrity).toBe(2);
        expect(table.isHeld()).toBe(true);
        expect(ball.isStatic).toBe(true);
        // A held ball cannot drain again — no double penalty.
        table.drain();
        expect(table.getState().integrity).toBe(2);
        table.launch();
        table.drain();
        expect(table.getState().integrity).toBe(1);
        table.launch();
        table.drain();
        expect(table.getState().phase).toBe("lost");
    });

    it("a truly stationary dynamic ball is recovered for free after 180 ticks", () => {
        world = makeWorld();
        const { engine, ball, table } = world;
        table.launch();
        // With gravity off the ball simply hangs still, away from all targets.
        put(ball, 600, 600, 0, 0);
        advance(engine, table, 120);
        expect(table.getState().notice).not.toContain("trapped");
        expect(table.isHeld()).toBe(false);
        advance(engine, table, 240);
        expect(table.getState().notice).toContain("trapped");
        expect(table.getState().integrity).toBe(3);
        expect(table.isHeld()).toBe(true);
        // Once is enough — no retriggering while held.
        advance(engine, table, 360);
        expect(table.getState().notice).toContain("trapped");
        expect(table.isHeld()).toBe(true);
    });

    it("a held ball never triggers ball-search", () => {
        world = makeWorld();
        advance(world.engine, world.table, 1000);
        expect(world.table.getState().notice).not.toContain("trapped");
    });

    it("destroy removes only its own bodies and listener", () => {
        world = makeWorld();
        const { engine, ball, west, table } = world;
        table.destroy();
        const labels = Matter.Composite.allBodies(engine.world).map(b => b.label);
        expect(labels).not.toContain("story-shrine");
        expect(labels).not.toContain("story-gate");
        expect(labels).toContain("ball");
        expect(labels).toContain("bumper");
        // Collisions after destroy no longer mutate state.
        table.launch();
        put(ball, west.position.x, west.position.y, 0, 0);
        const phase = table.getState().phase;
        Matter.Engine.update(engine, 16.666);
        expect(table.getState().phase).toBe(phase);
    });

    it("re-entering the shrine after release respects the cooldown then reopens", () => {
        world = makeWorld(createStoryState({ learned: true }));
        const { engine, ball, table } = world;
        table.launch();
        put(ball, STORY_SHRINE.x, STORY_SHRINE.y - 60, 0, 6);
        advance(engine, table, 60);
        expect(table.getState().phase).toBe("lesson");
        table.action({ type: "trial-result", encounterId: table.getState().encounterId, outcome: "abandoned" });
        expect(table.getState().phase).toBe("playing");
        // Immediate re-contact is suppressed by the post-release cooldown.
        put(ball, STORY_SHRINE.x, STORY_SHRINE.y - 30, 0, 4);
        advance(engine, table, 30);
        expect(table.getState().phase).toBe("playing");
        // After the cooldown a genuine second visit opens the refill lesson.
        advance(engine, table, 200);
        put(ball, STORY_SHRINE.x, STORY_SHRINE.y - 60, 0, 6);
        advance(engine, table, 60);
        expect(table.getState().phase).toBe("lesson");
    });

    describe("terminal phase ball handling", () => {
        it("cradles the ball at the plunger when the run is lost mid-fall", () => {
            world = makeWorld({ ...createStoryState({ learned: true }), integrity: 1 });
            const { engine, ball, table, freezes } = world;
            table.launch();
            // The doomed ball is already past the drain line, plunging.
            put(ball, 250, 1400, 0, 12);
            table.drain();
            expect(table.getState().phase).toBe("lost");
            // Cradled at the serve position, not left to fall into the void
            // behind the end dialog — and it stays there.
            expect(ball.position.x).toBeCloseTo(400);
            expect(ball.position.y).toBeCloseTo(1100);
            expect(ball.velocity.x).toBe(0);
            expect(ball.velocity.y).toBe(0);
            expect(table.isHeld()).toBe(true);
            advance(engine, table, 120);
            expect(ball.position.y).toBeCloseTo(1100);
            // Terminal phases render live physics; no encounter freeze fires.
            expect(freezes).toEqual([]);
        });

        it("cradles the ball when a failed trial costs the last integrity, and retry relaunches cleanly", () => {
            world = makeWorld({ ...createStoryState({ learned: false }), integrity: 1 });
            const { engine, ball, table } = world;
            table.launch();
            put(ball, STORY_SHRINE.x, STORY_SHRINE.y - 60, 0, 6);
            advance(engine, table, 60);
            expect(table.getState().phase).toBe("lesson");
            table.action({ type: "trial-result", encounterId: table.getState().encounterId, outcome: "failed" });
            expect(table.getState().phase).toBe("lost");
            // Captured-at-shrine state is cleared: the ball cradles at the
            // plunger instead of waiting inside the shrine sensor.
            expect(ball.position.y).toBeCloseTo(1100);
            expect(ball.velocity.x).toBe(0);
            expect(ball.velocity.y).toBe(0);
            expect(table.isHeld()).toBe(true);
            // Retry starts a fresh run and ejects the ball upward — no NaN,
            // no inherited terminal velocity.
            table.action({ type: "retry" });
            expect(table.getState().phase).toBe("playing");
            expect(table.getState().integrity).toBe(3);
            expect(ball.isStatic).toBe(false);
            expect(ball.position.y).toBeCloseTo(1100);
            expect(ball.velocity.y).toBeLessThan(0);
            expect(Number.isNaN(ball.velocity.y)).toBe(false);
        });

        it("cradles the ball at the plunger after winning through the gate", () => {
            world = makeWorld(createStoryState({ learned: true }));
            const { engine, ball, table, west, east } = world;
            table.launch();
            // Quench both seals (arm → contact), then return to play.
            table.action({ type: "arm" });
            put(ball, west.position.x, west.position.y + 60, 0, -6);
            advance(engine, table, 40);
            expect(table.getState().seals).toEqual(["west"]);
            table.action({ type: "arm" });
            put(ball, east.position.x, east.position.y + 60, 0, -6);
            advance(engine, table, 40);
            expect(table.getState().phase).toBe("gate-opening");
            table.action({ type: "continue" });
            expect(table.getState().phase).toBe("playing");
            // Crossing the now-open torii wins.
            put(ball, STORY_GATE.x, STORY_GATE.y + 40, 0, -6);
            advance(engine, table, 60);
            expect(table.getState().phase).toBe("won");
            expect(ball.position.x).toBeCloseTo(400);
            expect(ball.position.y).toBeCloseTo(1100);
            expect(ball.velocity.y).toBe(0);
            expect(table.isHeld()).toBe(true);
            advance(engine, table, 120);
            expect(ball.position.y).toBeCloseTo(1100);
        });
    });

    describe("onEvent feedback hook", () => {
        it("fires on accepted transitions and stays silent when the reducer is a no-op", () => {
            world = makeWorld();
            const { table } = world;
            table.action({ type: "arm" }); // unlearned: notice-only change, still a new object
            expect(world.events.length).toBeGreaterThan(0);
            const before = world.events.length;
            table.action({ type: "gate" }); // sealed gate: notice change only, no phase flip
            expect(world.events.length).toBe(before + 1);
            // A reducer no-op (already-won run) must not fire.
            table.action({ type: "retry" });
            const after = world.events.length;
            table.action({ type: "shrine" });
            expect(world.events.length).toBe(after + 1);
        });
    });
});
