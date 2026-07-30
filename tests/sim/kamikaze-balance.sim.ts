/**
 * Kamikaze balance simulation.
 *
 * Runs the REAL game model + matter-js physics headlessly (jsdom, no
 * rendering) and measures how long the machine AI keeps the ball alive
 * per difficulty, both against a passive player and against a simple
 * scripted player that nudges the ball toward the drain.
 *
 * The one browser capability jsdom lacks — SVG path geometry — is
 * replaced by pre-seeding the svg-loader vertex cache with vertices
 * sampled via svg-path-properties (same 30px sampling as Matter.Svg).
 *
 * Run: npm run sim:kamikaze
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import "vitest-canvas-mock";
import { readFileSync } from "fs";
import path from "path";
import { svgPathProperties } from "svg-path-properties";

import { seedVertexCache } from "@/services/svg-loader";
import { init, update, nudgeBallToward, getBallPosition, getPhysicsEngine, setKillCamEnabled } from "@/model/game";
import Matter from "matter-js";
import { BALLS_PER_GAME, type GameDef } from "@/definitions/game";
import Tables from "@/definitions/tables";
import { createKamikazeState, type AIDifficulty } from "@/model/kamikaze";
import { mulberry32 } from "@/utils/rng";

const FRAME_MS = 1000 / 60;
const RUN_CAP_MS = 45_000;
const SEEDS = process.env.SIM_DEBUG ? [Number(process.env.SIM_SEED ?? 11)] : [11, 23, 37, 41, 59, 67];
const DIFFICULTIES: AIDifficulty[] = process.env.SIM_DEBUG
  ? [(process.env.SIM_DIFF as AIDifficulty) ?? "medium"]
  : ["easy", "medium", "hard"];
const NUDGE_INTERVAL_MS = 400;

const TABLE_INDEX = 0;
const PUBLIC_DIR = path.resolve(__dirname, "../../public");

function sampleSvgVertices(filePath: string): { x: number; y: number }[][] {
  const diskPath = path.join(PUBLIC_DIR, filePath.replace(/^\.\//, ""));
  const raw = readFileSync(diskPath, "utf8");
  const out: { x: number; y: number }[][] = [];
  const dAttrs = raw.match(/\sd="([^"]+)"/g) ?? [];
  for (const attr of dAttrs) {
    const d = attr.slice(attr.indexOf('"') + 1, -1);
    const props = new svgPathProperties(d);
    const total = props.getTotalLength();
    const points: { x: number; y: number }[] = [];
    for (let len = 0; len < total; len += 30) {
      const p = props.getPointAtLength(len);
      points.push({ x: p.x, y: p.y });
    }
    if (points.length >= 3) out.push(points);
  }
  return out;
}

const mockCanvas = {
  numChildren: () => 0,
  removeChildAt: () => {},
  addChild: () => {},
  removeChild: () => {},
  loadResource: async () => {},
  panViewport: () => {},
  pause: () => {},
  getViewport: () => ({ left: 0, top: 0, width: 800, height: 1441 }),
  setDimensions: () => {},
  setViewport: () => {},
} as any;

type RunResult = {
  drainMs: number | null; // null = ball survived the cap
  bumperHits: number;
};

/**
 * Bodies.fromVertices places compounds by their center of mass, which differs
 * slightly between the browser's Matter.Svg sampling and our svg-path-properties
 * sampling — enough (~16px) to pinch the launch lane shut. The SVGs are authored
 * 1:1 in table space, so snap each compound's bounding box back to its design
 * position.
 */
function realignSvgBodies(): void {
  const table = Tables[TABLE_INDEX];
  const world = getPhysicsEngine().engine.world;
  for (const body of Matter.Composite.allBodies(world)) {
    if (!body.isStatic || body.parts.length <= 1) continue;
    const w = body.bounds.max.x - body.bounds.min.x;
    if (Math.abs(w - table.width) < 20) {
      // main table body: shape.svg cloud spans exactly 0..width in table coords
      Matter.Body.translate(body, { x: -body.bounds.min.x, y: -body.bounds.min.y });
    } else {
      // reflector: match def by proximity of current center to intended center
      const cx = (body.bounds.min.x + body.bounds.max.x) / 2;
      const cy = (body.bounds.min.y + body.bounds.max.y) / 2;
      let best: { left: number; top: number } | null = null;
      let bestDist = Infinity;
      for (const r of table.reflectors) {
        const dist = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
        if (dist < bestDist) { bestDist = dist; best = r; }
      }
      if (best && bestDist < 100) {
        Matter.Body.translate(body, { x: best.left - body.bounds.min.x, y: best.top - body.bounds.min.y });
      }
    }
  }
}

async function simulateRun(difficulty: AIDifficulty, seed: number, activePlayer: boolean): Promise<RunResult> {
  // stale endRound / teleport timers from a previous run would spawn phantom balls
  vi.clearAllTimers();

  const game: GameDef = {
    id: "sim",
    active: false,
    paused: false,
    table: TABLE_INDEX,
    score: 0,
    balls: BALLS_PER_GAME,
    multiplier: 1,
    underworld: false,
    kamikaze: createKamikazeState(difficulty),
    rngSeed: seed,
    rng: mulberry32(seed),
  };

  await init(
    mockCanvas,
    game,
    (readyCallback, timeout) => { setTimeout(readyCallback, timeout); },
    () => {},
  );

  realignSvgBodies();

  const kamikaze = game.kamikaze!;
  const start = performance.now();
  let lastNudge = 0;
  const maxFrames = Math.ceil(RUN_CAP_MS / FRAME_MS);

  for (let frame = 0; frame < maxFrames; frame++) {
    const now = performance.now();
    update(now, 1);

    if (process.env.SIM_DEBUG && (frame % 120 === 0 || (frame < 300 && frame % 10 === 0))) {
      // eslint-disable-next-line no-console
      console.log(`[dbg] f${frame} t=${((now - start) / 1000).toFixed(1)}s pos=`, getBallPosition());
    }

    if (activePlayer && now - lastNudge >= NUDGE_INTERVAL_MS) {
      const pos = getBallPosition();
      if (pos) {
        // scripted player: always shove the ball straight at the drain
        nudgeBallToward(pos.x, Tables[TABLE_INDEX].underworld ?? Tables[TABLE_INDEX].height);
        lastNudge = now;
      }
    }

    vi.advanceTimersByTime(FRAME_MS);

    if (kamikaze.completedBallScores.length >= 1) {
      return { drainMs: performance.now() - start, bumperHits: kamikaze.totalBumperHits };
    }
  }

  return { drainMs: null, bumperHits: kamikaze.totalBumperHits };
}

/**
 * Rule-3 probe: run a single seeded active-player game to the first drain and
 * return the frozen score. Used to prove the kill cam (which only stretches
 * physics ticks AFTER the drain) never alters the scored time-alive.
 */
async function drainScore(
  difficulty: AIDifficulty, seed: number, killCam: boolean
): Promise<{ score: number; frozen: boolean; drained: boolean }> {
  vi.clearAllTimers();
  setKillCamEnabled(killCam);

  const game: GameDef = {
    id: "sim-rule3",
    active: false,
    paused: false,
    table: TABLE_INDEX,
    score: 0,
    balls: BALLS_PER_GAME,
    multiplier: 1,
    underworld: false,
    kamikaze: createKamikazeState(difficulty),
    rngSeed: seed,
    rng: mulberry32(seed),
  };

  await init(
    mockCanvas,
    game,
    (readyCallback, timeout) => { setTimeout(readyCallback, timeout); },
    () => {},
  );
  realignSvgBodies();

  const kamikaze = game.kamikaze!;
  let lastNudge = 0;
  const maxFrames = Math.ceil(RUN_CAP_MS / FRAME_MS);
  for (let frame = 0; frame < maxFrames; frame++) {
    const now = performance.now();
    update(now, 1);
    if (now - lastNudge >= NUDGE_INTERVAL_MS) {
      const pos = getBallPosition();
      if (pos) {
        nudgeBallToward(pos.x, Tables[TABLE_INDEX].underworld ?? Tables[TABLE_INDEX].height);
        lastNudge = now;
      }
    }
    vi.advanceTimersByTime(FRAME_MS);
    if (kamikaze.completedBallScores.length >= 1) {
      return { score: game.score, frozen: kamikaze.scoreFrozen, drained: true };
    }
  }
  return { score: game.score, frozen: kamikaze.scoreFrozen, drained: false };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
}

function summarize(label: string, results: RunResult[]): { label: string; med: number; drains: number } {
  const drains = results.filter((r) => r.drainMs !== null).map((r) => r.drainMs!) as number[];
  const med = median(drains);
  const line = [
    label.padEnd(18),
    `drains ${drains.length}/${results.length}`,
    Number.isNaN(med) ? "median —" : `median ${(med / 1000).toFixed(1)}s`,
    drains.length ? `min ${(Math.min(...drains) / 1000).toFixed(1)}s max ${(Math.max(...drains) / 1000).toFixed(1)}s` : "",
  ].join("  ");
  // eslint-disable-next-line no-console
  console.log(line);
  return { label, med, drains: drains.length };
}

describe("kamikaze balance simulation", () => {
  beforeAll(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
    });

    const table = Tables[TABLE_INDEX];
    seedVertexCache(table.body.source, sampleSvgVertices(table.body.source));
    for (const reflector of table.reflectors) {
      seedVertexCache(reflector.source, sampleSvgVertices(reflector.source));
    }
  });

  it("measures drain times per difficulty (passive + active player)", async () => {
    // eslint-disable-next-line no-console
    console.log(`\n${SEEDS.length} seeds/difficulty · cap ${RUN_CAP_MS / 1000}s · nudge every ${NUDGE_INTERVAL_MS}ms\n`);

    const summaries: { label: string; med: number; drains: number }[] = [];

    for (const activePlayer of [true, false]) {
      for (const difficulty of DIFFICULTIES) {
        const results: RunResult[] = [];
        for (const seed of SEEDS) {
          results.push(await simulateRun(difficulty, seed, activePlayer));
        }
        summaries.push(
          summarize(`${difficulty} ${activePlayer ? "(active)" : "(passive)"}`, results),
        );
      }
    }

    // Sanity floor: an active player on easy must be able to drain within the cap.
    const easyActive = summaries.find((s) => s.label.startsWith("easy (active)"))!;
    expect(easyActive.drains).toBeGreaterThan(0);
  });

  it("freezes the same drain score whether the kill cam plays or not (rule 3)", async () => {
    const seed = 11;
    const withCam = await drainScore("easy", seed, true);
    const noCam = await drainScore("easy", seed, false);
    // restore the default so this test never leaks state into the balance run
    setKillCamEnabled(true);

    expect(withCam.drained).toBe(true);
    expect(noCam.drained).toBe(true);
    expect(withCam.frozen).toBe(true);
    expect(noCam.frozen).toBe(true);
    // The kill cam fires only after the score is captured + frozen, and only
    // stretches physics ticks (timeScale) — never the wall-clock `now` used for
    // scoring. So the scored time-alive must be byte-identical cam on/off.
    expect(withCam.score).toBeGreaterThan(0);
    expect(withCam.score).toEqual(noCam.score);
  });
});
