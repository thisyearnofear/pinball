import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { getTrials, rewardForTrials, type TimingTrial, type MemoryTrial, type DrawingTrial } from "@/config/kami-trials";
import { grantBoon } from "@/model/game";
import { POWERUP_NAMES } from "@/model/kamikaze";
import { getFromStorage, setInStorage } from "@/utils/local-storage";

import { colors, spacing, typography, radius } from "@/theme/tokens";

type Props = {
  onClose: () => void;
  /** Called with the granted boon name (or null) so the caller can toast/announce it. */
  onResult: (boonName: string | null, accuracy: number) => void;
};

const SALT_KEY = "pinball_kami_trial_salt";

/**
 * Advance a per-day salt so each pause surfaces fresh trial content, while the
 * base seed stays date-anchored (everyone sees the same three archetypes per
 * day). Deterministic, no backend.
 */
function nextSeed(): number {
  const dayKey = new Date().toDateString();
  const raw = getFromStorage(SALT_KEY);
  let parsed: { day: string; n: number } | null = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  const n = parsed && parsed.day === dayKey ? parsed.n + 1 : 1;
  setInStorage(SALT_KEY, JSON.stringify({ day: dayKey, n }));
  // Mix the day string into a stable base, then fold in the salt.
  let base = 0x811c9dc5;
  for (let i = 0; i < dayKey.length; i++) {
    base ^= dayKey.charCodeAt(i);
    base = Math.imul(base, 0x01000193);
  }
  return (base ^ (n * 0x9e3779b9)) >>> 0;
}

export function KamiTrialModal(props: Props) {
  const seed = useMemo(() => nextSeed(), []);
  const trials = useMemo(() => getTrials(seed), [seed]);
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<number[]>([]);

  const handleTrialDone = useCallback((accuracy: number) => {
    setScores((prev) => {
      const next = [...prev, accuracy];
      if (index + 1 < trials.length) {
        setIndex(index + 1);
      } else {
        finish(next);
      }
      return next;
    });
  }, [index, trials.length]);

  function finish(finalScores: number[]) {
    const avg = finalScores.reduce((a, b) => a + b, 0) / finalScores.length;
    const reward = rewardForTrials(seed, avg);
    if (reward) {
      grantBoon(reward.type, reward.durationMs);
      props.onResult(POWERUP_NAMES[reward.type], avg);
    } else {
      props.onResult(null, avg);
    }
  }

  const trial = trials[index];

  return (
    <Modal title="神の試練 · Kami Trials" onClose={props.onClose} size="md">
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
        <div style={{ display: "flex", justifyContent: "center", gap: spacing.xs }}>
          {trials.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === index ? 28 : 10,
                height: 6,
                borderRadius: radius.full,
                background: i < index ? "#22c55e" : i === index ? colors.accent.primary : colors.border.default,
                transition: "all 0.25s ease",
              }}
            />
          ))}
        </div>
        <div style={{ textAlign: "center", fontSize: typography.size.xs, color: colors.text.muted, letterSpacing: "0.15em", textTransform: "uppercase" }}>
          Trial {index + 1} of {trials.length}
        </div>

        {trial.kind === "timing" && <TimingGame trial={trial} onDone={handleTrialDone} />}
        {trial.kind === "memory" && <MemoryGame trial={trial} onDone={handleTrialDone} />}
        {trial.kind === "drawing" && <DrawingGame trial={trial} onDone={handleTrialDone} />}
      </div>
    </Modal>
  );
}

/* ── Timing mini-game ─────────────────────────────────────────── */
function TimingGame(props: { trial: TimingTrial; onDone: (acc: number) => void }) {
  const [pos, setPos] = useState(0);
  const [locked, setLocked] = useState<number | null>(null);
  const dirRef = useRef(1);
  const posRef = useRef(0);

  useEffect(() => {
    if (locked !== null) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      posRef.current += dirRef.current * props.trial.speed * dt;
      if (posRef.current >= 1) { posRef.current = 1; dirRef.current = -1; }
      if (posRef.current <= 0) { posRef.current = 0; dirRef.current = 1; }
      setPos(posRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [locked, props.trial.speed]);

  const stop = useCallback(() => {
    if (locked !== null) return;
    const p = posRef.current;
    setLocked(p);
    const { zoneStart, zoneEnd } = props.trial;
    let acc = 0;
    if (p >= zoneStart && p <= zoneEnd) {
      // Closer to zone centre = better.
      const center = (zoneStart + zoneEnd) / 2;
      const half = (zoneEnd - zoneStart) / 2;
      acc = 1 - Math.abs(p - center) / half * 0.4; // 0.6-1.0 inside zone
    } else {
      const dist = p < zoneStart ? zoneStart - p : p - zoneEnd;
      acc = Math.max(0, 0.5 - dist * 2);
    }
    window.setTimeout(() => props.onDone(acc), 550);
  }, [locked, props]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg, alignItems: "center" }}>
      <div style={{ fontSize: typography.size.lg, color: colors.text.primary, textAlign: "center" }}>{props.trial.prompt}</div>
      <div style={{ position: "relative", width: "100%", maxWidth: 320, height: 28, borderRadius: 14, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          left: `${props.trial.zoneStart * 100}%`,
          width: `${(props.trial.zoneEnd - props.trial.zoneStart) * 100}%`,
          background: "linear-gradient(180deg, rgba(34,197,94,0.5), rgba(34,197,94,0.3))",
        }} />
        <div style={{
          position: "absolute", top: 2, bottom: 2, width: 4, borderRadius: 2,
          left: `calc(${pos * 100}% - 2px)`,
          background: locked !== null ? "#fbbf24" : "#f0abfc",
          boxShadow: "0 0 8px rgba(240,171,252,0.8)",
        }} />
      </div>
      <Button size="lg" onClick={stop} disabled={locked !== null}>
        {locked !== null ? "…" : "STOP"}
      </Button>
      <div style={{ fontSize: typography.size.xs, color: colors.text.muted }}>Stop the marker inside the green zone</div>
    </div>
  );
}

/* ── Memory mini-game ─────────────────────────────────────────── */
function MemoryGame(props: { trial: MemoryTrial; onDone: (acc: number) => void }) {
  const [phase, setPhase] = useState<"show" | "input" | "done">("show");
  const [showIdx, setShowIdx] = useState(0);
  const [input, setInput] = useState<string[]>([]);
  const options = useMemo(() => shuffle(props.trial.sequence, props.trial.id), [props.trial]);

  useEffect(() => {
    if (phase !== "show") return;
    if (showIdx >= props.trial.sequence.length) {
      const t = window.setTimeout(() => setPhase("input"), 400);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setShowIdx((i) => i + 1), props.trial.flashMs);
    return () => window.clearTimeout(t);
  }, [phase, showIdx, props.trial]);

  const tapGlyph = useCallback((g: string) => {
    if (phase !== "input") return;
    const next = [...input, g];
    setInput(next);
    if (next.length >= props.trial.sequence.length) {
      setPhase("done");
      const correct = next.filter((v, i) => v === props.trial.sequence[i]).length;
      window.setTimeout(() => props.onDone(correct / props.trial.sequence.length), 500);
    }
  }, [phase, input, props]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg, alignItems: "center" }}>
      <div style={{ fontSize: typography.size.lg, color: colors.text.primary, textAlign: "center" }}>{props.trial.prompt}</div>
      <div style={{
        width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 44, fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
        color: "#fbbf24", border: "1px solid rgba(212,160,23,0.4)", borderRadius: radius.md,
        background: "rgba(212,160,23,0.08)",
      }}>
        {phase === "show" && showIdx < props.trial.sequence.length ? props.trial.sequence[showIdx] : phase === "show" ? "…" : "?"}
      </div>
      {phase === "input" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: spacing.xs, maxWidth: 320 }}>
          {options.map((g) => (
            <button
              key={g}
              onClick={() => tapGlyph(g)}
              style={{
                width: 52, height: 52, fontSize: 26, cursor: "pointer",
                fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
                color: colors.text.primary, background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.15)", borderRadius: radius.sm,
              }}
            >{g}</button>
          ))}
        </div>
      )}
      <div style={{ fontSize: typography.size.xs, color: colors.text.muted, textAlign: "center" }}>
        {phase === "show" ? "Watch the sequence…" : phase === "input" ? `Repeat it in order (${input.length}/${props.trial.sequence.length})` : "…"}
      </div>
    </div>
  );
}

function shuffle(arr: string[], key: string): string[] {
  const a = [...arr];
  let seed = 0;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── Drawing mini-game ────────────────────────────────────────── */
function DrawingGame(props: { trial: DrawingTrial; onDone: (acc: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const [done, setDone] = useState(false);

  const SIZE = 240;

  const toNorm = useCallback((e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }, []);

  const drawIdeal = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = "rgba(212,160,23,0.35)";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    props.trial.points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x * SIZE, y * SIZE);
      else ctx.lineTo(x * SIZE, y * SIZE);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }, [props.trial]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) drawIdeal(ctx);
  }, [drawIdeal]);

  const onDown = useCallback((e: React.PointerEvent) => {
    if (done) return;
    drawingRef.current = true;
    pointsRef.current = [toNorm(e)];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [done, toNorm]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drawingRef.current || done) return;
    pointsRef.current.push(toNorm(e));
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawIdeal(ctx);
    ctx.strokeStyle = "#f0abfc";
    ctx.lineWidth = 4;
    ctx.beginPath();
    pointsRef.current.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x * SIZE, p.y * SIZE);
      else ctx.lineTo(p.x * SIZE, p.y * SIZE);
    });
    ctx.stroke();
  }, [done, toNorm, drawIdeal]);

  const finishStroke = useCallback(() => {
    if (!drawingRef.current || done) return;
    drawingRef.current = false;
    setDone(true);
    // Score: for each ideal point, find the min distance to a traced point.
    const traced = pointsRef.current;
    if (traced.length < 2) { window.setTimeout(() => props.onDone(0), 400); return; }
    let total = 0;
    for (const [ix, iy] of props.trial.points) {
      let min = Infinity;
      for (const p of traced) min = Math.min(min, Math.hypot(p.x - ix, p.y - iy));
      total += min <= props.trial.tolerance ? 1 : Math.max(0, 1 - (min - props.trial.tolerance) * 3);
    }
    const acc = total / props.trial.points.length;
    window.setTimeout(() => props.onDone(acc), 400);
  }, [done, props]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg, alignItems: "center" }}>
      <div style={{ fontSize: typography.size.lg, color: colors.text.primary, textAlign: "center" }}>{props.trial.prompt}</div>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={finishStroke}
        onPointerLeave={finishStroke}
        style={{ touchAction: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: radius.md, background: "rgba(0,0,0,0.3)", cursor: "crosshair" }}
      />
      <div style={{ fontSize: typography.size.xs, color: colors.text.muted, textAlign: "center" }}>
        {done ? "…" : "Trace the golden path in one stroke"}
      </div>
    </div>
  );
}
