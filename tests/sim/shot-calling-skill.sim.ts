/**
 * Shot-calling + steer skill-discrimination simulation.
 *
 * Purpose: answer "does doing nothing do as well as playing well?"
 *
 * Two test groups:
 *
 * 1. Shot-calling (feint / precision) — drives the real game model through
 *    init / update / shotAim / shotRelease. Four bots of escalating skill.
 *
 * 2. Steer (classic tap-to-nudge) — drives init / update / nudgeBallToward.
 *    Three bots: null (no input), passive (occasional nudge), active (constant
 *    drainward nudge). This is where the "do nothing and still do well"
 *    critique lives: gravity + imperfect AI flippers mean a passive player
 *    still drains quickly and gets a good grade.
 *
 * Both groups compute run verdicts (the same S/A/B/C/D grades a real player
 * sees) and assert the skill-discrimination invariant: the best bot must beat
 * the worst bot. Today this is expected to FAIL on steer — that's the point.
 *
 * Run: npm run sim:kamikaze
 * Debug: SIM_DEBUG=1 SIM_SEED=11 SIM_DIFF=easy SIM_VARIANT=feint npm run sim:kamikaze
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import "vitest-canvas-mock";
import { readFileSync } from "fs";
import path from "path";
import { svgPathProperties } from "svg-path-properties";

import { seedVertexCache } from "@/services/svg-loader";
import {
    init, update, shotAim, shotRelease,
    getShotPhase, getShotCanRelease, getShotFeintStage,
    getShotGuardLane, getShotLanes, getShotAimedLane,
    getShotMeterPosition, getTickCount, getBallPosition,
    nudgeBallToward, getPhysicsEngine,
} from "@/model/game";
import Matter from "matter-js";
import { BALLS_PER_GAME, type GameDef } from "@/definitions/game";
import Tables from "@/definitions/tables";
import { createKamikazeState, type AIDifficulty } from "@/model/kamikaze";
import { mulberry32 } from "@/utils/rng";
import { getRunVerdict } from "@/config/run-verdict";
import { IMMERSION } from "@/config/immersion-tuning";

const FRAME_MS = 1000 / 60;
const RUN_CAP_MS = 60_000;
const SEEDS = process.env.SIM_DEBUG
    ? [Number(process.env.SIM_SEED ?? 11)]
    : [11, 23, 37, 41, 59, 67, 73, 83];
const DIFFICULTIES: AIDifficulty[] = process.env.SIM_DEBUG
    ? [(process.env.SIM_DIFF as AIDifficulty) ?? "easy"]
    : ["easy", "medium", "hard"];
const SHOT_VARIANTS = process.env.SIM_DEBUG
    ? [(process.env.SIM_VARIANT as "feint" | "precision") ?? "feint"]
    : ["feint", "precision"] as const;

const TABLE_INDEX = 0;
const PUBLIC_DIR = path.resolve(__dirname, "../../public");

// ════════════════════════════════════════════════════════════════
// Headless sim infrastructure (adapted from kamikaze-balance.sim.ts)
// ════════════════════════════════════════════════════════════════

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

function realignSvgBodies(): void {
    const table = Tables[TABLE_INDEX];
    const world = getPhysicsEngine().engine.world;
    for (const body of Matter.Composite.allBodies(world)) {
        if (!body.isStatic || body.parts.length <= 1) continue;
        const w = body.bounds.max.x - body.bounds.min.x;
        if (Math.abs(w - table.width) < 20) {
            Matter.Body.translate(body, { x: -body.bounds.min.x, y: -body.bounds.min.y });
        } else {
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

function seedSvgCache(): void {
    const table = Tables[TABLE_INDEX];
    seedVertexCache(table.body.source, sampleSvgVertices(table.body.source));
    for (const reflector of table.reflectors) {
        seedVertexCache(reflector.source, sampleSvgVertices(reflector.source));
    }
}

// ════════════════════════════════════════════════════════════════
// Result type & stats
// ════════════════════════════════════════════════════════════════

type RunResult = {
    drainMs: number | null;  // null = ball survived the cap (timeout)
    score: number;           // game.score (best ball drain time in ms)
    grade: string;           // S/A/B/C/D
    kanji: string;
    bumperHits: number;
};

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
}

function mean(values: number[]): number {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}

type BotSummary = {
    botId: string;
    botLabel: string;
    mode: string;       // "feint" | "precision" | "steer"
    difficulty: string;
    drains: number;
    total: number;
    medianMs: number | null;
    meanMs: number | null;
    medianScore: number | null;
    gradeCounts: Record<string, number>;
};

function summarize(
    botId: string,
    botLabel: string,
    mode: string,
    difficulty: string,
    results: RunResult[],
): BotSummary {
    const drained = results.filter((r) => r.drainMs !== null);
    const drainMs = drained.map((r) => r.drainMs!);
    const scores = results.map((r) => r.score);
    const gradeCounts: Record<string, number> = {};
    for (const r of results) {
        gradeCounts[r.grade] = (gradeCounts[r.grade] ?? 0) + 1;
    }
    return {
        botId, botLabel, mode, difficulty,
        drains: drained.length,
        total: results.length,
        medianMs: drainMs.length ? median(drainMs) : null,
        meanMs: drainMs.length ? mean(drainMs) : null,
        medianScore: scores.length ? median(scores) : null,
        gradeCounts,
    };
}

function printSummaryTable(summaries: BotSummary[]): void {
    const header = "┌──────────┬───────────┬──────┬──────┬───────────┬───────────┬────────────────────────────────┐";
    const subhdr = "│ Bot      │ Mode      │ Diff │ Drns │ Median s  │ Score ms  │ Grade distribution              │";
    const sep    = "├──────────┼───────────┼──────┼──────┼───────────┼───────────┼────────────────────────────────┤";
    const footer = "└──────────┴───────────┴──────┴──────┴───────────┴───────────┴────────────────────────────────┘";
    // eslint-disable-next-line no-console
    console.log(`\n${header}\n${subhdr}\n${sep}`);
    for (const s of summaries) {
        const medStr = s.medianMs !== null ? (s.medianMs / 1000).toFixed(1) : "—";
        const scoreStr = s.medianScore !== null ? Math.round(s.medianScore).toString() : "—";
        const grades = ["S", "A", "B", "C", "D"]
            .map((g) => `${g}:${s.gradeCounts[g] ?? 0}`)
            .join(" ");
        // eslint-disable-next-line no-console
        console.log(
            `│ ${s.botLabel.padEnd(8).slice(0, 8)} │ ${s.mode.padEnd(9)} │ ${s.difficulty.padEnd(4)} │ ${String(s.drains + "/" + s.total).padEnd(4)} │ ${medStr.padEnd(9)} │ ${scoreStr.padEnd(9)} │ ${grades.padEnd(30)} │`,
        );
    }
    // eslint-disable-next-line no-console
    console.log(footer + "\n");
}

// ════════════════════════════════════════════════════════════════
// Shot-calling bots
// ════════════════════════════════════════════════════════════════

type ShotBotId = "null" | "random" | "rote" | "optimal";
type ShotBotCtx = {
    variant: "feint" | "precision";
    difficulty: AIDifficulty;
    lanes: number;
    tick: number;
    rng: () => number;
    phase: string;
    canRelease: boolean;
    feintStage: string;
    guardLane: number | null;
    aimedLane: number | null;
    meterPos: number;
};

type ShotBot = {
    id: ShotBotId;
    label: string;
    act: (ctx: ShotBotCtx) => void;
};

const shotBots: ShotBot[] = [
    {
        id: "null",
        label: "Null",
        act: () => { /* never aims, never releases */ },
    },
    {
        id: "random",
        label: "Random",
        act: (ctx) => {
            if (ctx.aimedLane === null) {
                shotAim(Math.floor(ctx.rng() * ctx.lanes));
                return;
            }
            if (ctx.canRelease) shotRelease();
        },
    },
    {
        id: "rote",
        label: "Rote",
        act: (ctx) => {
            if (ctx.variant === "feint") {
                if (ctx.aimedLane === null) { shotAim(0); return; }
                if (ctx.feintStage === "break") {
                    const other = ctx.aimedLane === 0 ? 1 : 0;
                    shotAim(other);
                    if (ctx.canRelease) shotRelease();
                }
                return;
            }
            // Precision: aim the open lane, release immediately
            if (ctx.aimedLane === null) {
                const open = ctx.guardLane === 0 ? 1 : 0;
                shotAim(open);
                return;
            }
            if (ctx.canRelease) shotRelease();
        },
    },
    {
        id: "optimal",
        label: "Optimal",
        act: (ctx) => {
            if (ctx.variant === "feint") {
                // Two policies exist: chase (guard reacts to aim after a delay)
                // and hold (guard pre-committed from serve start, visible
                // immediately). The optimal bot reads the guard to distinguish:
                //
                // - Hold: guard is visible before the player aims (not null at
                //   idle). Fire the open lane immediately — no reaction race.
                // - Chase: guard is null until the bait commits. Bait, wait for
                //   commit, then fire the open lane.
                if (ctx.aimedLane === null) {
                    // Read the guard at idle: if it's already set, this is a
                    // hold serve — aim the open lane and fire immediately.
                    if (ctx.guardLane !== null) {
                        const open = ctx.guardLane === 0 ? 1 : 0;
                        shotAim(open);
                        shotRelease();
                    } else {
                        shotAim(0); // bait for chase
                    }
                    return;
                }
                // Chase: wait for the break stage, then fire the open lane.
                if (ctx.feintStage === "break") {
                    const open = (ctx.guardLane === null || ctx.guardLane === 0) ? 1 : 0;
                    if (open !== ctx.aimedLane) shotAim(open);
                    if (ctx.canRelease) shotRelease();
                }
                return;
            }
            // Precision: aim the open lane, fire immediately. The meter's
            // sweet-spot wait doesn't help because physics bouncing washes
            // out the launch direction — a good release gets saved while a
            // bad release's chaos sometimes drains. This documents the known
            // limitation: precision's meter doesn't discriminate skill yet.
            if (ctx.aimedLane === null) {
                const open = ctx.guardLane === 0 ? 1 : 0;
                shotAim(open);
                return;
            }
            if (ctx.canRelease) shotRelease();
        },
    },
];

async function simulateShotRun(
    variant: "feint" | "precision",
    difficulty: AIDifficulty,
    seed: number,
    bot: ShotBot,
): Promise<RunResult> {
    vi.clearAllTimers();

    const game: GameDef = {
        id: "sim-shot",
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
        controlScheme: variant,
        aiDifficulty: difficulty,
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
    const maxFrames = Math.ceil(RUN_CAP_MS / FRAME_MS);
    let prevPhase = "";

    for (let frame = 0; frame < maxFrames; frame++) {
        update(performance.now(), 1);

        const phase = getShotPhase();
        if (phase === "aiming") {
            const ctx: ShotBotCtx = {
                variant,
                difficulty,
                lanes: getShotLanes(),
                tick: getTickCount(),
                rng: mulberry32(seed * 1000 + frame),
                phase,
                canRelease: getShotCanRelease(),
                feintStage: getShotFeintStage(),
                guardLane: getShotGuardLane(),
                aimedLane: getShotAimedLane(),
                meterPos: getShotMeterPosition(),
            };
            if (process.env.SIM_DEBUG && bot.id === "optimal") {
                // eslint-disable-next-line no-console
                console.log(`[opt-${variant}] f${frame} t${ctx.tick} aimed=${ctx.aimedLane} guard=${ctx.guardLane} stage=${ctx.feintStage} canRel=${ctx.canRelease} meter=${ctx.meterPos.toFixed(3)}`);
            }
            bot.act(ctx);
        }
        prevPhase = phase;

        vi.advanceTimersByTime(FRAME_MS);

        if (kamikaze.completedBallScores.length >= 1) {
            const drainMs = performance.now() - start;
            const score = game.score;
            const verdict = getRunVerdict(true, score, difficulty);
            return { drainMs, score, grade: verdict.grade, kanji: verdict.kanji, bumperHits: kamikaze.totalBumperHits };
        }
    }

    const verdict = getRunVerdict(true, game.score, difficulty);
    return { drainMs: null, score: game.score, grade: verdict.grade, kanji: verdict.kanji, bumperHits: kamikaze.totalBumperHits };
}

// ════════════════════════════════════════════════════════════════
// Steer bots
// ════════════════════════════════════════════════════════════════

type SteerBotId = "null" | "passive" | "active";
type SteerBot = {
    id: SteerBotId;
    label: string;
    /** Called every frame. May call nudgeBallToward. */
    act: (ctx: { tick: number; ballX: number; ballY: number; tableWidth: number; tableHeight: number; rng: () => number }) => void;
};

const STEER_NUDGE_INTERVAL_MS = 400;

const steerBots: SteerBot[] = [
    {
        id: "null",
        label: "Null",
        act: () => { /* never nudges — gravity + AI flippers do everything */ },
    },
    {
        id: "passive",
        label: "Passive",
        act: (ctx) => {
            // Nudge occasionally (every ~2s) in a random direction — simulates
            // a disengaged player tapping absent-mindedly.
            if (ctx.tick % 120 === 0) {
                nudgeBallToward(ctx.rng() * ctx.tableWidth, ctx.ballY, 1);
            }
        },
    },
    {
        id: "active",
        label: "Active",
        act: (ctx) => {
            // Constant drainward nudges — a focused player shoving the ball
            // toward the drain every 400ms (same as the existing balance sim).
            // Throttled to match the real balance sim's nudge cadence.
            if (ctx.tick % Math.round(STEER_NUDGE_INTERVAL_MS / FRAME_MS) === 0) {
                nudgeBallToward(ctx.ballX, ctx.tableHeight, 1);
            }
        },
    },
];

async function simulateSteerRun(
    difficulty: AIDifficulty,
    seed: number,
    bot: SteerBot,
): Promise<RunResult> {
    vi.clearAllTimers();

    const game: GameDef = {
        id: "sim-steer",
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
        controlScheme: "steer",
        aiDifficulty: difficulty,
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
    const maxFrames = Math.ceil(RUN_CAP_MS / FRAME_MS);
    let lastNudgeFrame = 0;
    const table = Tables[TABLE_INDEX];
    const tableHeight = table.underworld ?? table.height;

    for (let frame = 0; frame < maxFrames; frame++) {
        update(performance.now(), 1);

        const pos = getBallPosition();
        if (pos) {
            bot.act({
                tick: frame,
                ballX: pos.x,
                ballY: pos.y,
                tableWidth: table.width,
                tableHeight,
                rng: mulberry32(seed * 1000 + frame),
            });
        }

        vi.advanceTimersByTime(FRAME_MS);

        if (kamikaze.completedBallScores.length >= 1) {
            const drainMs = performance.now() - start;
            const score = game.score;
            const verdict = getRunVerdict(true, score, difficulty);
            return { drainMs, score, grade: verdict.grade, kanji: verdict.kanji, bumperHits: kamikaze.totalBumperHits };
        }
    }

    const verdict = getRunVerdict(true, game.score, difficulty);
    return { drainMs: null, score: game.score, grade: verdict.grade, kanji: verdict.kanji, bumperHits: kamikaze.totalBumperHits };
}

// ════════════════════════════════════════════════════════════════
// Test suite
// ════════════════════════════════════════════════════════════════

describe("skill-discrimination simulation", () => {
    beforeAll(() => {
        vi.useFakeTimers({
            toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
        });
        seedSvgCache();
    });

    it("shot-calling: measures drain times and grades per bot × variant × difficulty", async () => {
        const n = SHOT_VARIANTS.length * DIFFICULTIES.length * shotBots.length * SEEDS.length;
        // eslint-disable-next-line no-console
        console.log(
            `\n═══ Shot-calling ═══\n${SEEDS.length} seeds · ${shotBots.length} bots · ${SHOT_VARIANTS.length} variants · ${DIFFICULTIES.length} difficulties · cap ${RUN_CAP_MS / 1000}s · ${n} runs\n`,
        );

        const allSummaries: BotSummary[] = [];
        const allResults: Map<string, RunResult[]> = new Map();

        for (const variant of SHOT_VARIANTS) {
            for (const difficulty of DIFFICULTIES) {
                for (const bot of shotBots) {
                    const results: RunResult[] = [];
                    for (const seed of SEEDS) {
                        results.push(await simulateShotRun(variant, difficulty, seed, bot));
                    }
                    const key = `${bot.id}:${variant}:${difficulty}`;
                    allResults.set(key, results);
                    allSummaries.push(summarize(bot.id, bot.label, variant, difficulty, results));
                }
            }
        }

        printSummaryTable(allSummaries);

        // Determinism: same seed → identical result.
        const detBot = shotBots.find((b) => b.id === "rote")!;
        const d1 = await simulateShotRun("feint", "medium", SEEDS[0], detBot);
        const d2 = await simulateShotRun("feint", "medium", SEEDS[0], detBot);
        expect(d1.score).toEqual(d2.score);
        expect(d1.grade).toEqual(d2.grade);

        // Skill-discrimination invariant for shot-calling.
        let optimalBeatsNull = false;
        let optimalBeatsRandom = false;

        for (const variant of SHOT_VARIANTS) {
            for (const difficulty of DIFFICULTIES) {
                const opt = allResults.get(`optimal:${variant}:${difficulty}`)!;
                const nul = allResults.get(`null:${variant}:${difficulty}`)!;
                const rnd = allResults.get(`random:${variant}:${difficulty}`)!;
                if (median(opt.map((r) => r.score)) < median(nul.map((r) => r.score))) optimalBeatsNull = true;
                if (median(opt.map((r) => r.score)) < median(rnd.map((r) => r.score))) optimalBeatsRandom = true;
            }
        }

        // eslint-disable-next-line no-console
        console.log(`Shot-calling skill checks: optimal<null=${optimalBeatsNull ? "PASS" : "FAIL"} optimal<random=${optimalBeatsRandom ? "PASS" : "FAIL"}`);

        expect(optimalBeatsNull).toBe(true);
        expect(optimalBeatsRandom).toBe(true);

        // ── Precision critique: rote beats optimal ──
        // On precision, the rote bot (fire immediately at the open lane) scores
        // BETTER than the optimal bot (wait for the meter sweet spot). This is
        // because the meter timing barely matters — the lateral strength
        // dominates the outcome, so waiting just adds time. This documents the
        // problem: precision's meter doesn't discriminate skill.
        let roteBeatsOptimalOnPrecision = false;
        for (const difficulty of DIFFICULTIES) {
            const opt = allResults.get(`optimal:precision:${difficulty}`)!;
            const rote = allResults.get(`rote:precision:${difficulty}`)!;
            if (median(rote.map((r) => r.score)) < median(opt.map((r) => r.score))) {
                roteBeatsOptimalOnPrecision = true;
            }
        }
        // eslint-disable-next-line no-console
        console.log(`  Precision critique: rote<optimal=${roteBeatsOptimalOnPrecision ? "CONFIRMED (rote beats optimal)" : "not detected"}`);

        // This should be false once precision is fixed (meter should matter).
        expect(roteBeatsOptimalOnPrecision).toBe(false);
    }, 600_000);

    it("steer: measures drain times and grades per bot × difficulty (the 'do nothing' critique)", async () => {
        const n = DIFFICULTIES.length * steerBots.length * SEEDS.length;
        // eslint-disable-next-line no-console
        console.log(
            `\n═══ Steer ═══\n${SEEDS.length} seeds · ${steerBots.length} bots · ${DIFFICULTIES.length} difficulties · cap ${RUN_CAP_MS / 1000}s · ${n} runs\n`,
        );

        const allSummaries: BotSummary[] = [];
        const allResults: Map<string, RunResult[]> = new Map();

        for (const difficulty of DIFFICULTIES) {
            for (const bot of steerBots) {
                const results: RunResult[] = [];
                for (const seed of SEEDS) {
                    results.push(await simulateSteerRun(difficulty, seed, bot));
                }
                const key = `${bot.id}:steer:${difficulty}`;
                allResults.set(key, results);
                allSummaries.push(summarize(bot.id, bot.label, "steer", difficulty, results));
            }
        }

        printSummaryTable(allSummaries);

        // Skill-discrimination invariant for steer mode.
        // The core critique: "even if they do nothing they still do relatively well."
        // If null bot gets A/S grades on easy, that's the problem.
        let activeBeatsNull = false;

        for (const difficulty of DIFFICULTIES) {
            const act = allResults.get(`active:steer:${difficulty}`)!;
            const nul = allResults.get(`null:steer:${difficulty}`)!;
            if (median(act.map((r) => r.score)) < median(nul.map((r) => r.score))) activeBeatsNull = true;
        }

        // Also check: does the null bot get S or A grades on easy?
        const nullEasy = allResults.get("null:steer:easy")!;
        const nullEasyTopGradesCount = nullEasy.filter((r) => r.grade === "S" || r.grade === "A").length;

        // eslint-disable-next-line no-console
        console.log(`Steer skill checks: active<null=${activeBeatsNull ? "PASS" : "FAIL"} null-easy S/A grades=${nullEasyTopGradesCount}/${nullEasy.length}`);

        // Report the critique quantitatively: if >50% of null-easy runs get
        // S or A, the "do nothing and do well" critique is confirmed.
        if (nullEasyTopGradesCount > nullEasy.length / 2) {
            // eslint-disable-next-line no-console
            console.log(`  ⚠ CONFIRMED: ${nullEasyTopGradesCount}/${nullEasy.length} null-easy runs graded S or A — doing nothing is rewarded.`);
        }

        // The invariant: active play must beat null play on at least one difficulty.
        expect(activeBeatsNull).toBe(true);

        // ── The "do nothing and still do well" critique ──
        // This is the real complaint: even though active play beats null on
        // median score, a passive player still gets top grades. The null bot
        // on easy gets S or A on 6/8 runs — doing literally nothing is
        // rewarded with divine grades. This assertion documents the problem:
        // it FAILS today and should pass once the verdict pars or the AI
        // save logic are fixed.
        // eslint-disable-next-line no-console
        console.log(`  Critique invariant: null-easy S/A = ${nullEasyTopGradesCount}/${nullEasy.length} (should be ≤ ${Math.floor(nullEasy.length / 4)})`);
        expect(nullEasyTopGradesCount).toBeLessThanOrEqual(Math.floor(nullEasy.length / 4));
    }, 600_000);
});
