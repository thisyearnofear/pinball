import { describe, expect, it } from "vitest";
import * as Matter from "matter-js";
import { chapterReducer, createChapter, type ChapterEvent, type ChapterTarget } from "@/model/shrine-chapter";
import { createChapterPhysics, type ChapterPhysics } from "@/game/chapter/chapter-table";

const targets: ChapterTarget[] = ["shrine", "west", "east", "gate"];
const ticks = [0, 9, 18, 27, 36, 45, 54, 63, 72, 81, 90, 108, 126, 144, 162];

function rig(learned = false) {
  let state = createChapter("water-shrine", learned);
  const events: ChapterEvent[] = [];
  let physics: ChapterPhysics;
  physics = createChapterPhysics(state, event => {
    events.push(event);
    state = chapterReducer(state, event);
    physics.setState(state);
  });
  return {
    physics, events,
    getState: () => state,
    send(event: ChapterEvent) { state = chapterReducer(state, event); physics.setState(state); },
  };
}

function restOnPlatform(physics: ChapterPhysics) {
  physics.aim("gate");
  physics.release();
  Matter.Body.setPosition(physics.ball, { x: 300, y: 350 });
  Matter.Body.setVelocity(physics.ball, { x: 0, y: 0 });
  Matter.Composite.add(physics.engine.world, Matter.Bodies.rectangle(300, 365, 100, 10, { isStatic: true }));
}

const searches = (events: ChapterEvent[]) => events.filter(event => event.type === "ball-search");

describe("chapter launch recovery", () => {
  it.each(targets.flatMap(target => ticks.map(tick => ({ target, tick }))))("does not strand a $target shot released at tick $tick", ({ target, tick }) => {
    const r = rig();
    try {
      r.physics.aim(target);
      r.physics.advance(tick);
      r.physics.release();
      r.physics.advance(1800);
      const before = { ...r.physics.ball.position };
      r.physics.advance(120);
      const p = r.physics.ball.position;
      const moved = Math.hypot(p.x - before.x, p.y - before.y);
      expect(r.physics.snapshot().held || r.getState().phase !== "playing" || moved > 20,
        JSON.stringify({ target, tick, position: p, velocity: r.physics.ball.velocity, moved, phase: r.getState().phase }))
        .toBe(true);
    } finally {
      r.physics.destroy();
    }
  });

  it("fixes the original lower-left trap with geometry, without needing ball search", () => {
    const r = rig();
    try {
      r.physics.aim("shrine");
      r.physics.advance(81);
      r.physics.release();
      r.physics.advance(1800);
      expect(r.physics.snapshot().held || r.getState().phase === "lesson").toBe(true);
      expect(searches(r.events)).toHaveLength(0);
    } finally { r.physics.destroy(); }
  });

  it("recovers a genuinely stranded ball once without charging integrity, mana, or the armed blessing", () => {
    const r = rig(true);
    try {
      r.send({ type: "arm" });
      const before = r.getState();
      restOnPlatform(r.physics);
      r.physics.advance(120);
      expect(searches(r.events)).toHaveLength(0);
      r.physics.advance(240);
      expect(searches(r.events)).toHaveLength(1);
      expect(r.physics.snapshot()).toMatchObject({ held: true, aimReady: false });
      expect(r.getState()).toEqual({ ...before, notice: expect.stringContaining("No integrity or mana lost") });
      r.physics.advance(360);
      expect(searches(r.events)).toHaveLength(1);
    } finally { r.physics.destroy(); }
  });

  it("does not count paused time toward a recovery", () => {
    const r = rig();
    try {
      restOnPlatform(r.physics);
      r.physics.advance(90);
      r.physics.setPaused(true);
      r.physics.advance(600);
      expect(searches(r.events)).toHaveLength(0);
      r.physics.setPaused(false);
      r.physics.advance(80);
      expect(searches(r.events)).toHaveLength(0);
      r.physics.advance(120);
      expect(searches(r.events)).toHaveLength(1);
    } finally { r.physics.destroy(); }
  });

  it("never searches for an intentionally cradled ball or during a lesson", () => {
    const r = rig();
    try {
      r.physics.advance(1000);
      expect(searches(r.events)).toHaveLength(0);
      r.send({ type: "shrine" });
      r.physics.advance(1000);
      expect(searches(r.events)).toHaveLength(0);
      expect(r.getState().phase).toBe("lesson");
    } finally { r.physics.destroy(); }
  });
});
