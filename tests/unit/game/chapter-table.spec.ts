import { describe, it, expect } from "vitest";
import * as Matter from "matter-js";
import {
  chapterReducer, createChapter,
  type ChapterEvent, type ChapterState, type ChapterTarget,
} from "@/model/shrine-chapter";
import { createChapterPhysics, SERVE, type ChapterPhysics } from "@/game/chapter/chapter-table";

type Rig = {
  phys: ChapterPhysics;
  events: ChapterEvent[];
  send(e: ChapterEvent): ChapterState;
  getState(): ChapterState;
};

function rig(start: ChapterState = createChapter()): Rig {
  const events: ChapterEvent[] = [];
  let state = start;
  let phys: ChapterPhysics;
  phys = createChapterPhysics(state, (e) => {
    events.push(e);
    state = chapterReducer(state, e);
    phys.setState(state);
  });
  return {
    phys,
    events,
    send(e) { state = chapterReducer(state, e); phys.setState(state); return state; },
    getState: () => state,
  };
}

function releaseOnMeter(phys: ChapterPhysics, target: ChapterTarget, wanted: "center" | "early") {
  phys.aim(target);
  const inBand = (m: number) => wanted === "center" ? Math.abs(m - 0.5) < 0.015 : m < 0.06;
  for (let i = 0; i < 400 && !inBand(phys.snapshot().meter); i++) phys.advance(1);
  expect(inBand(phys.snapshot().meter)).toBe(true);
  phys.release();
}

function shoot(r: Rig, target: ChapterTarget, wanted: "center" | "early" = "center", steps = 140) {
  if (!r.phys.snapshot().held) r.phys.reset();
  // Play like a player: both flippers held, so a ball falling back off a
  // seal or the gate is caught in the catch zone and cradled instead of
  // draining. Without this every asserted seal hit would also cost a drain.
  r.phys.flip("left", true);
  r.phys.flip("right", true);
  releaseOnMeter(r.phys, target, wanted);
  r.phys.advance(steps);
}

const eventsOf = (r: Rig, type: string) => r.events.filter(e => e.type === type);

function shootUntil(r: Rig, target: ChapterTarget, eventType: string, maxSteps = 140) {
  releaseOnMeter(r.phys, target, "center");
  for (let i = 0; i < maxSteps && eventsOf(r, eventType).length === 0; i++) r.phys.advance(1);
}

describe("chapter table physics", () => {
  it("launches a centered-meter shot into the water shrine and freezes for the lesson", () => {
    const r = rig();
    shoot(r, "shrine");
    expect(eventsOf(r, "shrine")).toHaveLength(1);
    expect(r.getState().phase).toBe("lesson");
    expect(r.phys.ball.isStatic).toBe(true);
    const pos = { ...r.phys.ball.position };
    r.phys.advance(60);
    expect(r.phys.ball.position).toEqual(pos);
    r.phys.destroy();
  });

  it("keeps the torii physically shut until both seals are quenched", () => {
    const r = rig(createChapter(true));
    shoot(r, "gate");
    expect(r.getState().phase).not.toBe("won");
    expect(r.getState().seals).toEqual([]);
    r.phys.destroy();
  });

  it("quenches each fire seal only while water is armed, and opens the gate after both", () => {
    const r = rig(createChapter(true));
    shootUntil(r, "west", "seal");
    expect(r.getState().integrity).toBe(2);
    expect(r.getState().seals).toEqual([]);
    r.send({ type: "arm-water" });
    shoot(r, "west");
    expect(r.getState().seals).toEqual(["west"]);
    r.send({ type: "arm-water" });
    shoot(r, "east");
    expect(r.getState().phase).toBe("gate-opening");
    r.send({ type: "continue" });
    shoot(r, "gate");
    expect(r.getState().phase).toBe("won");
    r.phys.destroy();
  });

  it("does not guarantee the target on a badly timed release", () => {
    const r = rig();
    shoot(r, "shrine", "early", 120);
    expect(eventsOf(r, "shrine")).toHaveLength(0);
    r.phys.destroy();
  });

  it("runs the full chapter through real collisions: shrine, lesson, seals, gate", () => {
    const r = rig();
    shoot(r, "shrine");
    expect(r.getState().phase).toBe("lesson");
    r.send({ type: "answer", element: "water" });
    r.send({ type: "answer", element: "wind" });
    expect(r.getState().phase).toBe("blessing");
    r.send({ type: "continue" });
    r.send({ type: "arm-water" });
    shoot(r, "west");
    r.send({ type: "arm-water" });
    shoot(r, "east");
    expect(r.getState().phase).toBe("gate-opening");
    r.send({ type: "continue" });
    shoot(r, "gate");
    expect(r.getState().phase).toBe("won");
    r.phys.destroy();
  });

  it("freezes ball and meter while paused and ignores release", () => {
    const r = rig();
    r.phys.aim("shrine");
    r.phys.advance(10);
    const meter = r.phys.snapshot().meter;
    const pos = { ...r.phys.ball.position };
    r.phys.setPaused(true);
    r.phys.advance(60);
    expect(r.phys.ball.position).toEqual(pos);
    expect(r.phys.snapshot().meter).toBe(meter);
    r.phys.release();
    expect(r.phys.snapshot().held).toBe(true);
    r.phys.destroy();
  });

  it("emits a single drain then cradles, and clears arming per the reducer", () => {
    const r = rig(createChapter(true));
    r.send({ type: "arm-water" });
    r.phys.aim("gate");
    r.phys.release();
    Matter.Body.setPosition(r.phys.ball, { x: 300, y: 815 });
    Matter.Body.setVelocity(r.phys.ball, { x: 0, y: 6 });
    r.phys.advance(30);
    expect(eventsOf(r, "drain")).toHaveLength(1);
    expect(r.phys.snapshot().held).toBe(true);
    expect(r.phys.ball.isStatic).toBe(true);
    expect(r.getState().waterArmed).toBe(false);
    r.phys.advance(60);
    expect(eventsOf(r, "drain")).toHaveLength(1);
    r.phys.destroy();
  });

  it("cradles a descending ball when both flippers are held in the catch zone", () => {
    const r = rig();
    r.phys.aim("gate");
    r.phys.release();
    Matter.Body.setPosition(r.phys.ball, { x: 300, y: 630 });
    Matter.Body.setVelocity(r.phys.ball, { x: 0, y: 5 });
    r.phys.flip("left", true);
    r.phys.flip("right", true);
    r.phys.advance(3);
    expect(r.phys.snapshot().held).toBe(true);
    expect(r.phys.ball.position.x).toBeCloseTo(SERVE.x, 0);
    expect(r.phys.ball.position.y).toBeCloseTo(SERVE.y, 0);
    r.phys.destroy();
  });

  it("counts a fire seal once per launch even if the ball re-enters it", () => {
    const r = rig(createChapter(true));
    r.send({ type: "arm-water" });
    shoot(r, "west");
    expect(eventsOf(r, "seal")).toHaveLength(1);
    Matter.Body.setPosition(r.phys.ball, { x: 205, y: 130 });
    Matter.Body.setVelocity(r.phys.ball, { x: 0, y: 4 });
    r.phys.advance(10);
    expect(eventsOf(r, "seal")).toHaveLength(1);
    r.phys.destroy();
  });

  it("pays for an unarmed seal hit but never for walls or bumpers", () => {
    const r = rig(createChapter(true));
    shootUntil(r, "west", "seal");
    expect(r.getState().integrity).toBe(2);
    r.phys.aim("shrine");
    r.phys.release();
    Matter.Body.setPosition(r.phys.ball, { x: 90, y: 400 });
    Matter.Body.setVelocity(r.phys.ball, { x: 0, y: -8 });
    r.phys.advance(30);
    expect(r.getState().integrity).toBe(2);
    r.phys.destroy();
  });

  it("resets cleanly and destroys without stale listeners", () => {
    const r = rig();
    shoot(r, "shrine");
    r.phys.reset();
    expect(r.phys.snapshot().held).toBe(true);
    expect(r.phys.snapshot().meter).toBe(0);
    r.phys.destroy();
    expect(() => r.phys.advance(5)).not.toThrow();
    expect(eventsOf(r, "drain")).toHaveLength(0);
  });
});
