import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./index";
import type { ReplayDigest, ReplayEvent } from "@/model/replay-recorder";
import tables from "@/definitions/tables";
import { formatGameScore } from "@/utils/score-format";
import { colors, spacing, typography } from "@/theme/tokens";

const TICK_MS = 1000 / 60;
const TRAIL_MS = 550;
const EVENT_FX_MS = 450;

type Props = {
  replay: ReplayDigest;
  onClose: () => void;
};

type TraceSample = { t: number; x: number; y: number };

function parseTrace(trace: number[] | undefined): TraceSample[] {
  if (!trace || trace.length < 3) return [];
  const out: TraceSample[] = [];
  for (let i = 0; i + 2 < trace.length; i += 3) {
    out.push({ t: trace[i], x: trace[i + 1], y: trace[i + 2] });
  }
  return out;
}

function positionAt(samples: TraceSample[], tick: number): { x: number; y: number } | null {
  if (samples.length === 0) return null;
  if (tick <= samples[0].t) return samples[0];
  const last = samples[samples.length - 1];
  if (tick >= last.t) return last;

  // binary search for the surrounding pair
  let lo = 0;
  let hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= tick) lo = mid; else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const f = b.t === a.t ? 0 : (tick - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

export function ReplayViewer({ replay, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [timeMs, setTimeMs] = useState(0);

  const playheadRef = useRef(0);
  const playingRef = useRef(true);
  const speedRef = useRef(1);

  const table = tables[replay.table] ?? tables[0];
  const samples = useMemo(() => parseTrace(replay.trace), [replay.trace]);
  const kamikaze = replay.mode === "kamikaze";
  const totalMs = Math.max(1, replay.tickCount * TICK_MS);

  // Visible playfield: main table unless the trace dips into the underworld.
  const viewHeight = useMemo(() => {
    const uw = table.underworld ?? table.height;
    const maxY = samples.reduce((m, s) => Math.max(m, s.y), 0);
    return maxY > uw ? table.height : uw;
  }, [table, samples]);

  const drainEvents = useMemo(
    () => replay.events.filter((e) => e.e === "drain"),
    [replay.events],
  );

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cssW = 300;
    const cssH = Math.round(cssW * (viewHeight / table.width));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const scale = (cssW * dpr) / table.width;
    const accentDrain = kamikaze ? "#22c55e" : "#ff4444";

    let raf = 0;
    let lastFrame = performance.now();

    function drawFlipper(fx: number, fy: number, angleDeg: number, isLeft: boolean, lit: boolean) {
      ctx!.save();
      ctx!.translate(fx * scale, fy * scale);
      ctx!.rotate((angleDeg * Math.PI) / 180);
      ctx!.fillStyle = lit ? "#fbbf24" : "rgba(255,255,255,0.35)";
      ctx!.shadowBlur = lit ? 10 : 0;
      ctx!.shadowColor = "#fbbf24";
      const len = 130 * scale;
      const th = 22 * scale;
      ctx!.beginPath();
      const x0 = isLeft ? 0 : -len;
      ctx!.roundRect(x0, 0, len, th, th / 2);
      ctx!.fill();
      ctx!.restore();
    }

    function render(now: number) {
      const dt = now - lastFrame;
      lastFrame = now;

      if (playingRef.current) {
        playheadRef.current = Math.min(totalMs, playheadRef.current + dt * speedRef.current);
        if (playheadRef.current >= totalMs) playingRef.current = false;
        setTimeMs(playheadRef.current);
        setPlaying(playingRef.current);
      }

      const t = playheadRef.current;
      const tick = t / TICK_MS;

      // background
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      const grad = ctx!.createLinearGradient(0, 0, 0, canvas!.height);
      grad.addColorStop(0, "#0d0d1f");
      grad.addColorStop(1, "#1a0a2e");
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      // bumpers (only those inside the visible view)
      for (const b of table.bumpers) {
        const cy = b.top + b.height / 2;
        if (cy > viewHeight) continue;
        ctx!.beginPath();
        ctx!.arc((b.left + b.width / 2) * scale, cy * scale, (b.width / 2) * scale, 0, Math.PI * 2);
        ctx!.strokeStyle = "rgba(139, 92, 246, 0.7)";
        ctx!.lineWidth = 2;
        ctx!.stroke();
        ctx!.fillStyle = "rgba(139, 92, 246, 0.15)";
        ctx!.fill();
      }

      // flippers — lit while held (between +/- events on that side)
      let leftHeld = false;
      let rightHeld = false;
      for (const e of replay.events) {
        if (e.t > tick) break;
        if (e.e === "L+") leftHeld = true;
        else if (e.e === "L-") leftHeld = false;
        else if (e.e === "R+") rightHeld = true;
        else if (e.e === "R-") rightHeld = false;
      }
      for (const f of table.flippers) {
        if (f.top > viewHeight) continue;
        const isLeft = String(f.type).toLowerCase().includes("left");
        drawFlipper(f.left, f.top, f.angle ?? 0, isLeft, isLeft ? leftHeld : rightHeld);
      }

      // drain zone
      const drainY = viewHeight * scale - 2 * dpr;
      const dGrad = ctx!.createLinearGradient(0, drainY - 24 * dpr, 0, drainY);
      dGrad.addColorStop(0, "transparent");
      dGrad.addColorStop(1, kamikaze ? "rgba(34,197,94,0.45)" : "rgba(255,68,68,0.35)");
      ctx!.fillStyle = dGrad;
      ctx!.fillRect(0, drainY - 24 * dpr, canvas!.width, 24 * dpr);

      // ball trail
      const trailStart = t - TRAIL_MS;
      ctx!.lineWidth = 3 * dpr;
      let prev: { x: number; y: number } | null = null;
      for (let ts = trailStart; ts <= t; ts += TICK_MS * 2) {
        const p = positionAt(samples, ts / TICK_MS);
        if (!p) continue;
        if (prev) {
          const alpha = Math.max(0, (ts - trailStart) / TRAIL_MS) * 0.6;
          ctx!.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          ctx!.beginPath();
          ctx!.moveTo(prev.x * scale, prev.y * scale);
          ctx!.lineTo(p.x * scale, p.y * scale);
          ctx!.stroke();
        }
        prev = p;
      }

      // ghost ball
      const pos = positionAt(samples, tick);
      if (pos) {
        ctx!.beginPath();
        ctx!.arc(pos.x * scale, pos.y * scale, 6 * dpr, 0, Math.PI * 2);
        ctx!.fillStyle = "#ffffff";
        ctx!.shadowBlur = 14;
        ctx!.shadowColor = kamikaze ? "#22c55e" : "#6366f1";
        ctx!.fill();
        ctx!.shadowBlur = 0;
      }

      // recent event FX (nudges + drains)
      for (const e of replay.events) {
        const eMs = e.t * TICK_MS;
        const age = t - eMs;
        if (age < 0 || age > EVENT_FX_MS) continue;
        const f = age / EVENT_FX_MS;
        if (e.e === "nudge" && e.x !== undefined && e.y !== undefined) {
          ctx!.beginPath();
          ctx!.arc(e.x * scale, Math.min(e.y, viewHeight) * scale, (8 + 30 * f) * dpr, 0, Math.PI * 2);
          ctx!.strokeStyle = `rgba(255, 255, 255, ${(0.7 * (1 - f)).toFixed(3)})`;
          ctx!.lineWidth = 2 * dpr;
          ctx!.stroke();
        } else if (e.e === "drain") {
          const p = positionAt(samples, e.t) ?? { x: table.width / 2, y: viewHeight };
          ctx!.beginPath();
          ctx!.arc(p.x * scale, Math.min(p.y, viewHeight) * scale, (10 + 50 * f) * dpr, 0, Math.PI * 2);
          ctx!.strokeStyle = kamikaze
            ? `rgba(34, 197, 94, ${(1 - f).toFixed(3)})`
            : `rgba(255, 68, 68, ${(1 - f).toFixed(3)})`;
          ctx!.lineWidth = 3 * dpr;
          ctx!.stroke();
        }
      }

      raf = requestAnimationFrame(render);
    }

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [samples, table, viewHeight, totalMs, kamikaze, replay.events]);

  function seek(ms: number) {
    playheadRef.current = Math.max(0, Math.min(totalMs, ms));
    setTimeMs(playheadRef.current);
  }

  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  return (
    <Modal title="Replay" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.md, alignItems: "center" }}>
        <div style={{ display: "flex", gap: spacing.md, alignItems: "baseline" }}>
          <span style={{ fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.text.primary }}>
            {formatGameScore(replay.finalScore, kamikaze)}
          </span>
          <span style={{ fontSize: typography.size.sm, color: colors.text.muted }}>
            {kamikaze ? `Kamikaze · ${replay.aiDifficulty ?? "medium"} AI` : "Classic"}
          </span>
        </div>

        {samples.length === 0 ? (
          <div style={{ color: colors.text.secondary, padding: spacing.lg, textAlign: "center" }}>
            No ghost trace was recorded for this run.
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", maxWidth: "100%" }}
            />

            <div style={{ width: "100%", position: "relative" }}>
              <input
                type="range"
                min={0}
                max={totalMs}
                step={TICK_MS}
                value={timeMs}
                onChange={(e) => seek(Number(e.target.value))}
                style={{ width: "100%", accentColor: kamikaze ? "#22c55e" : "#6366f1" }}
              />
              {drainEvents.map((e: ReplayEvent, i: number) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: `${Math.min(100, ((e.t * TICK_MS) / totalMs) * 100)}%`,
                    top: -2,
                    width: 2,
                    height: 8,
                    background: kamikaze ? "#22c55e" : "#ff4444",
                    pointerEvents: "none",
                  }}
                />
              ))}
            </div>

            <div style={{ display: "flex", gap: spacing.sm, alignItems: "center", width: "100%", justifyContent: "space-between" }}>
              <span style={{ fontSize: typography.size.sm, color: colors.text.muted, fontVariantNumeric: "tabular-nums" }}>
                {fmt(timeMs)} / {fmt(totalMs)}
              </span>
              <div style={{ display: "flex", gap: spacing.sm }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!playing && playheadRef.current >= totalMs) seek(0);
                    setPlaying((p) => !p);
                  }}
                >
                  {playing ? "Pause" : playheadRef.current >= totalMs ? "Replay" : "Play"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSpeed((s) => (s >= 4 ? 1 : s * 2))}
                >
                  {speed}x
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
