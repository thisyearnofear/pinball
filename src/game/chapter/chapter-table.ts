import * as Matter from "matter-js";
import type { ChapterEvent, ChapterState, ChapterTarget, SealId } from "@/model/shrine-chapter";

export const TABLE_W = 600;
export const TABLE_H = 800;
const STEP_MS = 1000 / 60;
const MAX_SPEED = 22;
const METER_PERIOD = 180;
const BALL_R = 9;
const N = 42;
const GRAV_A = 0.75 * 0.001 * (1000 / 60) ** 2;

export const SERVE = { x: 300, y: 645 };
export const SHRINE = { x: 110, y: 230, r: 32 };
export const SEALS: Record<SealId, { x: number; y: number; r: number }> = {
  west: { x: 205, y: 150, r: 24 },
  east: { x: 395, y: 150, r: 24 },
};
export const GATE = { x: 300, y: 65, w: 100, h: 26 };
const BUMPERS = [
  { x: 90, y: 440, r: 27 },
  { x: 510, y: 440, r: 27 },
];
const CATCH_ZONE = { x: 165, y: 615, w: 270, h: 90 };
const TARGETS: Record<ChapterTarget, { x: number; y: number }> = {
  shrine: SHRINE,
  west: SEALS.west,
  east: SEALS.east,
  gate: GATE,
};

type FlipperSide = "left" | "right";
type Flipper = {
  side: FlipperSide;
  pivot: { x: number; y: number };
  len: number;
  thick: number;
  angle: number;
  rest: number;
  up: number;
  held: boolean;
  body: Matter.Body;
};

export type ChapterTableSnapshot = { held: boolean; aim: ChapterTarget; meter: number; paused: boolean; aimReady: boolean };
export type ChapterTable = {
  setState(state: ChapterState): void;
  setPaused(paused: boolean): void;
  aim(target: ChapterTarget): void;
  release(): void;
  flip(side: FlipperSide, down: boolean): void;
  reset(): void;
  destroy(): void;
};

export type ChapterPhysics = ChapterTable & {
  readonly ball: Matter.Body;
  readonly engine: Matter.Engine;
  advance(steps?: number): void;
  snapshot(): ChapterTableSnapshot;
};

export function createChapterPhysics(
  state: ChapterState,
  onEvent: (event: ChapterEvent) => void
): ChapterPhysics {
  const engine = Matter.Engine.create();
  engine.gravity.y = 0.75;
  engine.positionIterations = 10;
  engine.velocityIterations = 8;

  let current = state;
  let destroyed = false;
  let paused = false;
  let held = true;
  let aimTarget: ChapterTarget = "shrine";
  let aimChosen = false;
  let meterTick = 0;
  let drainSent = false;
  const fired = new Set<string>();
  let stillTicks = 0;
  let stillAnchor = { ...SERVE };

  const ball = Matter.Bodies.circle(SERVE.x, SERVE.y, BALL_R, {
    label: "ball",
    restitution: 0.55,
    friction: 0,
    frictionAir: 0,
    frictionStatic: 0,
    density: 0.002,
  });
  Matter.Body.setStatic(ball, true);

  const statics: Matter.Body[] = [];
  const rect = (x: number, y: number, w: number, h: number, angle: number, label: string, opts: Matter.IBodyDefinition = {}) => {
    const b = Matter.Bodies.rectangle(x, y, w, h, { isStatic: true, angle, label, ...opts });
    statics.push(b);
    return b;
  };

  rect(15, 400, 14, 840, 0, "wall");
  rect(585, 400, 14, 840, 0, "wall");
  rect(300, 10, 600, 14, 0, "wall");
  rect(95, 640, 150, 12, 0.62, "guide");
  rect(505, 640, 150, 12, -0.62, "guide");

  const shrineBody = Matter.Bodies.circle(SHRINE.x, SHRINE.y, SHRINE.r, {
    isStatic: true, isSensor: true, label: "shrine",
  });
  const sealWest = Matter.Bodies.circle(SEALS.west.x, SEALS.west.y, SEALS.west.r, {
    isStatic: true, isSensor: true, label: "seal-west",
  });
  const sealEast = Matter.Bodies.circle(SEALS.east.x, SEALS.east.y, SEALS.east.r, {
    isStatic: true, isSensor: true, label: "seal-east",
  });
  const gateBody = Matter.Bodies.rectangle(GATE.x, GATE.y, GATE.w, GATE.h, {
    isStatic: true, isSensor: state.seals.length === 2, label: "gate",
  });

  const bumpers = BUMPERS.map(b =>
    Matter.Bodies.circle(b.x, b.y, b.r, { isStatic: true, restitution: 1.15, label: "bumper" })
  );

  const flippers: Flipper[] = [
    { side: "left", pivot: { x: 180, y: 705 }, len: 115, thick: 18, angle: 0.45, rest: 0.45, up: -0.55, held: false, body: null as never },
    { side: "right", pivot: { x: 420, y: 705 }, len: 115, thick: 18, angle: Math.PI - 0.45, rest: Math.PI - 0.45, up: Math.PI + 0.55, held: false, body: null as never },
  ];
  for (const f of flippers) {
    f.body = Matter.Bodies.rectangle(0, 0, f.len, f.thick, { isStatic: true, label: `flipper-${f.side}` });
    placeFlipper(f);
  }

  Matter.Composite.add(engine.world, [ball, shrineBody, sealWest, sealEast, gateBody, ...bumpers, ...flippers.map(f => f.body), ...statics]);

  function placeFlipper(f: Flipper) {
    const cx = f.pivot.x + Math.cos(f.angle) * f.len / 2;
    const cy = f.pivot.y + Math.sin(f.angle) * f.len / 2;
    Matter.Body.setPosition(f.body, { x: cx, y: cy });
    Matter.Body.setAngle(f.body, f.angle);
  }

  function meterValue(): number {
    const phase = (meterTick % METER_PERIOD) / METER_PERIOD;
    return phase < 0.5 ? phase * 2 : 2 - phase * 2;
  }

  function cradle() {
    if (!ball.isStatic) Matter.Body.setStatic(ball, true);
    Matter.Body.setVelocity(ball, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(ball, 0);
    Matter.Body.setPosition(ball, { x: SERVE.x, y: SERVE.y });
    held = true;
    aimChosen = false;
    meterTick = 0;
    drainSent = false;
    stillTicks = 0;
    stillAnchor = { ...SERVE };
  }

  function emitOnce(key: string, event: ChapterEvent) {
    if (fired.has(key)) return;
    fired.add(key);
    onEvent(event);
  }

  const onCollision = (e: Matter.IEventCollision<Matter.Engine>) => {
    for (const pair of e.pairs) {
      const other = pair.bodyA === ball ? pair.bodyB : pair.bodyB === ball ? pair.bodyA : null;
      if (!other) continue;
      if (other.label === "shrine") {
        emitOnce("shrine", { type: "shrine" });
        cradle();
      } else if (other.label === "seal-west" || other.label === "seal-east") {
        const id: SealId = other.label === "seal-west" ? "west" : "east";
        emitOnce(`seal-${id}`, { type: "seal", id });
        if (!ball.isStatic) Matter.Body.setVelocity(ball, { x: 0, y: 9 });
      } else if (other.label === "gate") {
        emitOnce("gate", { type: "gate" });
      }
    }
  };
  Matter.Events.on(engine, "collisionStart", onCollision);

  function stepFlippers() {
    for (const f of flippers) {
      const target = f.held ? f.up : f.rest;
      const diff = target - f.angle;
      if (Math.abs(diff) > 0.001) {
        const swingUp = f.side === "left" ? diff < 0 : diff > 0;
        f.angle += Math.sign(diff) * Math.min(0.3, Math.abs(diff));
        placeFlipper(f);
        if (swingUp && !ball.isStatic) flipImpulse(f);
      } else if (f.held && !ball.isStatic) {
        flipImpulse(f);
      }
    }
  }

  function flipImpulse(f: Flipper) {
    const dirX = Math.cos(f.angle);
    const dirY = Math.sin(f.angle);
    const relX = ball.position.x - f.pivot.x;
    const relY = ball.position.y - f.pivot.y;
    const t = (relX * dirX + relY * dirY) / f.len;
    if (t < 0 || t > 1.05) return;
    const cx = f.pivot.x + dirX * t * f.len;
    const cy = f.pivot.y + dirY * t * f.len;
    const dx = ball.position.x - cx;
    const dy = ball.position.y - cy;
    if (dx * dx + dy * dy > (BALL_R + f.thick) ** 2) return;
    const sign = f.side === "left" ? 1 : -1;
    Matter.Body.setVelocity(ball, {
      x: ball.velocity.x * 0.3 + sign * (2 + 5 * (1 - t)),
      y: -(11 + 10 * t),
    });
  }

  function step() {
    stepFlippers();
    Matter.Engine.update(engine, STEP_MS);
    const v = ball.velocity;
    const speed = Math.hypot(v.x, v.y);
    if (speed > MAX_SPEED) {
      Matter.Body.setVelocity(ball, { x: v.x / speed * MAX_SPEED, y: v.y / speed * MAX_SPEED });
    }
    if (!held && !ball.isStatic) {
      const p = ball.position;
      if (flippers[0].held && flippers[1].held && v.y > 0 &&
        p.x > CATCH_ZONE.x && p.x < CATCH_ZONE.x + CATCH_ZONE.w &&
        p.y > CATCH_ZONE.y && p.y < CATCH_ZONE.y + CATCH_ZONE.h) {
        cradle();
        return;
      }
      if (p.y > 820 && !drainSent) {
        drainSent = true;
        onEvent({ type: "drain" });
        cradle();
        return;
      }
      if (current.phase !== "playing") return;
      const displacement = Math.hypot(p.x - stillAnchor.x, p.y - stillAnchor.y);
      if (displacement > 3 || Math.hypot(ball.velocity.x, ball.velocity.y) > 0.2) {
        stillAnchor = { x: p.x, y: p.y };
        stillTicks = 0;
      } else if (++stillTicks >= 180) {
        cradle();
        onEvent({ type: "ball-search" });
      }
    }
  }

  const api: ChapterPhysics = {
    ball,
    engine,
    advance(steps = 1) {
      for (let i = 0; i < steps; i++) {
        if (destroyed || paused || current.phase !== "playing") break;
        if (held && aimChosen) meterTick++;
        step();
      }
    },
    snapshot() {
      return { held, aim: aimTarget, meter: meterValue(), paused, aimReady: aimChosen };
    },
    setState(next: ChapterState) {
      const wasUnlocked = current.seals.length === 2;
      current = next;
      const unlocked = next.seals.length === 2;
      if (unlocked !== wasUnlocked) gateBody.isSensor = unlocked;
      if (next.phase !== "playing") {
        for (const f of flippers) f.held = false;
        cradle();
      }
    },
    setPaused(p: boolean) {
      paused = p;
      if (p) for (const f of flippers) f.held = false;
    },
    aim(target: ChapterTarget) {
      if (destroyed || !held || paused || current.phase !== "playing") return;
      aimTarget = target;
      aimChosen = true;
      meterTick = 0;
    },
    release() {
      if (destroyed || !held || paused || current.phase !== "playing" || !aimChosen) return;
      const meter = meterValue();
      const target = TARGETS[aimTarget];
      const error = meter < 0.4 ? (meter - 0.4) * 220 : meter > 0.6 ? (meter - 0.6) * 220 : 0;
      fired.clear();
      held = false;
      stillTicks = 0;
      stillAnchor = { ...ball.position };
      Matter.Body.setStatic(ball, false);
      Matter.Body.setVelocity(ball, {
        x: (target.x + error - ball.position.x) / N,
        y: (target.y - ball.position.y - GRAV_A * N * (N + 1) / 2) / N,
      });
    },
    flip(side: FlipperSide, down: boolean) {
      if (destroyed || (down && (paused || current.phase !== "playing"))) return;
      const f = flippers.find(fl => fl.side === side);
      if (f) f.held = down;
    },
    reset() {
      for (const f of flippers) { f.held = false; f.angle = f.rest; placeFlipper(f); }
      fired.clear();
      aimTarget = "shrine";
      aimChosen = false;
      meterTick = 0;
      cradle();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      Matter.Events.off(engine, "collisionStart", onCollision);
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    },
  };
  return api;
}

export function createChapterTable(
  canvas: HTMLCanvasElement,
  state: ChapterState,
  onEvent: (event: ChapterEvent) => void,
  onSnapshot: (snapshot: ChapterTableSnapshot) => void
): ChapterTable {
  const physics = createChapterPhysics(state, onEvent);
  const ctx = canvas.getContext("2d");
  let raf = 0;
  let acc = 0;
  let last = 0;
  let frame = 0;
  let animationFrame = 0;
  let destroyed = false;
  const trail: { x: number; y: number }[] = [];
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; kind: "shard" | "ring" }[] = [];
  let rings: { x: number; y: number; r: number; life: number }[] = [];
  let lastPhase: ChapterState["phase"] = state.phase;
  let current = state;
  const reduceMotion = typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || TABLE_W;
    const h = canvas.clientHeight || TABLE_H;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  resize();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);

  function spawnBurst(x: number, y: number) {
    rings.push({ x, y, r: 8, life: 1 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      sparks.push({ x, y, vx: Math.cos(a) * (2 + (i % 3)), vy: Math.sin(a) * (2 + (i % 4)) - 2, life: 1, kind: "shard" });
    }
  }

  function draw() {
    if (!ctx) return;
    const scale = Math.min(canvas.width / TABLE_W, canvas.height / TABLE_H);
    const ox = (canvas.width - TABLE_W * scale) / 2;
    const oy = (canvas.height - TABLE_H * scale) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);

    const g = ctx.createLinearGradient(0, 0, 0, TABLE_H);
    g.addColorStop(0, "#14121d");
    g.addColorStop(1, "#0c0b12");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TABLE_W, TABLE_H);

    ctx.strokeStyle = "rgba(245,239,230,0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 4, TABLE_W - 16, TABLE_H - 8);
    ctx.strokeStyle = "rgba(212,160,23,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(14, 10, TABLE_W - 28, TABLE_H - 20);

    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "rgba(103,232,249,0.28)";
    ctx.strokeRect(CATCH_ZONE.x, CATCH_ZONE.y, CATCH_ZONE.w, CATCH_ZONE.h);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(103,232,249,0.5)";
    ctx.font = "10px 'Hiragino Mincho ProN','Yu Mincho',serif";
    ctx.textAlign = "center";
    ctx.fillText("HOLD BOTH FLIPPERS TO CATCH", CATCH_ZONE.x + CATCH_ZONE.w / 2, CATCH_ZONE.y - 6);

    ctx.fillStyle = "#1e1c2a";
    ctx.strokeStyle = "rgba(245,239,230,0.2)";
    for (const f of physics.engine.world.bodies.filter(b => b.label === "guide" || b.label === "wall")) {
      ctx.beginPath();
      for (const v of f.vertices) ctx.lineTo(v.x, v.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const unlocked = current.seals.length === 2;
    ctx.fillStyle = "#b3352a";
    ctx.fillRect(GATE.x - GATE.w / 2 - 12, 30, 14, 80);
    ctx.fillRect(GATE.x + GATE.w / 2 - 2, 30, 14, 80);
    ctx.fillRect(GATE.x - GATE.w / 2 - 26, 26, GATE.w + 52, 12);
    ctx.fillRect(GATE.x - GATE.w / 2 - 16, 84, GATE.w + 32, 9);
    ctx.fillStyle = "rgba(212,160,23,0.85)";
    ctx.fillRect(GATE.x - GATE.w / 2 - 26, 24, GATE.w + 52, 2);
    if (!unlocked) {
      ctx.strokeStyle = "#e34234";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(GATE.x - GATE.w / 2, GATE.y);
      ctx.lineTo(GATE.x + GATE.w / 2, GATE.y);
      ctx.moveTo(GATE.x, GATE.y - GATE.h / 2);
      ctx.lineTo(GATE.x, GATE.y + GATE.h / 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(227,66,52,0.85)";
      ctx.font = "11px serif";
      ctx.fillText("SEALED", GATE.x, GATE.y + GATE.h / 2 + 16);
    } else {
      ctx.fillStyle = "rgba(103,232,249,0.85)";
      ctx.font = "11px serif";
      ctx.fillText("OPEN", GATE.x, GATE.y + GATE.h / 2 + 16);
    }

    const t = animationFrame;
    for (let i = 0; i < 3; i++) {
      const rr = SHRINE.r + ((t * 0.4 + i * 22) % 44) - 10;
      if (rr <= 4) continue;
      ctx.beginPath();
      ctx.arc(SHRINE.x, SHRINE.y, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(103,232,249,${0.5 - i * 0.14})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(SHRINE.x, SHRINE.y, SHRINE.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(30,58,95,0.75)";
    ctx.fill();
    ctx.strokeStyle = "#67e8f9";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#bff3ff";
    ctx.font = "11px 'Hiragino Mincho ProN','Yu Mincho',serif";
    ctx.fillText("WATER", SHRINE.x, SHRINE.y - 3);
    ctx.fillText("SHRINE", SHRINE.x, SHRINE.y + 9);

    (Object.keys(SEALS) as SealId[]).forEach((id, i) => {
      const s = SEALS[id];
      const quenched = current.seals.includes(id);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = quenched ? "rgba(34,80,100,0.8)" : "rgba(120,32,20,0.8)";
      ctx.fill();
      ctx.strokeStyle = quenched ? "#67e8f9" : "#e34234";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = quenched ? "#bff3ff" : "#ffb59f";
      ctx.font = "12px serif";
      ctx.fillText(quenched ? "水" : "火", s.x, s.y + 4);
      ctx.font = "9px serif";
      ctx.fillStyle = "rgba(245,239,230,0.75)";
      ctx.fillText(`FIRE SEAL ${i === 0 ? "I" : "II"}`, s.x, s.y + s.r + 14);
      if (quenched) {
        ctx.strokeStyle = "#67e8f9";
        ctx.beginPath();
        ctx.moveTo(s.x - s.r * 0.6, s.y - s.r * 0.6);
        ctx.lineTo(s.x + s.r * 0.6, s.y + s.r * 0.6);
        ctx.stroke();
      }
    });

    for (const b of BUMPERS) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = "#2a2836";
      ctx.fill();
      ctx.strokeStyle = "rgba(212,160,23,0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y - 4, 7, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(245,200,80,0.85)";
      ctx.fill();
      ctx.fillStyle = "rgba(245,239,230,0.55)";
      ctx.font = "8px serif";
      ctx.fillText("灯", b.x, b.y + 14);
    }

    for (const f of physics.engine.world.bodies.filter(b => b.label.startsWith("flipper"))) {
      ctx.beginPath();
      for (const v of f.vertices) ctx.lineTo(v.x, v.y);
      ctx.closePath();
      ctx.fillStyle = "#c8a24a";
      ctx.fill();
      ctx.strokeStyle = "#8a6b1f";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (const f of [{ x: 180, y: 705 }, { x: 420, y: 705 }]) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#f5efe6";
      ctx.fill();
    }

    const snap = physics.snapshot();
    if (snap.held && current.phase === "playing") {
      const target = TARGETS[snap.aim];
      ctx.setLineDash([2, 7]);
      ctx.strokeStyle = "rgba(103,232,249,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      let px = SERVE.x, py = SERVE.y;
      let vx = (target.x - px) / N;
      let vy = (target.y - py - GRAV_A * N * (N + 1) / 2) / N;
      ctx.moveTo(px, py);
      for (let i = 0; i < N + 8; i++) {
        vy += GRAV_A; px += vx; py += vy;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(target.x, target.y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = "#67e8f9";
      ctx.stroke();
    }

    const bp = physics.ball.position;
    if (current.phase !== "lost" && current.phase !== "won") {
      if (!snap.paused && !reduceMotion) {
        trail.push({ x: bp.x, y: bp.y });
        if (trail.length > 10) trail.shift();
      }
      for (let i = 0; i < trail.length - 1; i++) {
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, BALL_R * (i / trail.length) * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245,239,230,${0.08 * (i / trail.length)})`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = "#f5efe6";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.stroke();
      if (current.waterArmed) {
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, BALL_R + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#67e8f9";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    } else {
      trail.length = 0;
      if (current.phase === "lost" && reduceMotion) {
        ctx.fillStyle = "#e34234";
        for (let i = 0; i < 6; i++) {
          const angle = i * Math.PI / 3;
          ctx.fillRect(bp.x + Math.cos(angle) * 16, bp.y + Math.sin(angle) * 16, 5, 5);
        }
      }
    }

    if (!reduceMotion) {
      for (const r of rings) {
        if (!snap.paused) { r.r += 4; r.life -= 0.03; }
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(227,66,52,${Math.max(0, r.life)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      rings = rings.filter(r => r.life > 0);
      for (const s of sparks) {
        if (!snap.paused) { s.x += s.vx; s.y += s.vy; s.vy += 0.15; s.life -= 0.025; }
        ctx.fillStyle = `rgba(227,66,52,${Math.max(0, s.life)})`;
        ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
      }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
    }
  }

  function loop(now: number) {
    if (destroyed) return;
    if (!last) last = now;
    acc += Math.min(100, now - last);
    last = now;
    const steps = Math.min(5, Math.floor(acc / STEP_MS));
    if (steps > 0) {
      acc -= steps * STEP_MS;
      physics.advance(steps);
    }
    frame++;
    if (!physics.snapshot().paused && !reduceMotion && current.phase === "playing") animationFrame++;
    draw();
    if (frame % 2 === 0) onSnapshot(physics.snapshot());
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  const api: ChapterTable = {
    setState(next: ChapterState) {
      if (!reduceMotion) {
        if (next.phase === "lost" && lastPhase !== "lost") spawnBurst(physics.ball.position.x, Math.min(physics.ball.position.y, 700));
        if (next.phase === "gate-opening" && lastPhase !== "gate-opening") rings.push({ x: GATE.x, y: GATE.y, r: 10, life: 1 });
      }
      lastPhase = next.phase;
      current = next;
      physics.setState(next);
    },
    setPaused: (p) => physics.setPaused(p),
    aim: (t) => physics.aim(t),
    release: () => physics.release(),
    flip: (s, d) => physics.flip(s, d),
    reset: () => physics.reset(),
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      physics.destroy();
    },
  };
  return api;
}
