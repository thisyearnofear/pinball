import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ReplayDigest } from "@/model/replay-recorder";
import { getTickCount } from "@/model/game";
import tables from "@/definitions/tables";
import { formatGameScore } from "@/utils/score-format";

const TICK_MS = 1000 / 60;
const TRAIL_MS = 450;
const STORAGE_KEY = "pinball_ghost_race";

type Props = {
  replay: ReplayDigest;
  leaderScore: number;
  leaderAddress: string;
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

/**
 * Live picture-in-picture ghost of the tournament leader's run, synced to the
 * running game's engine tick so pauses freeze the ghost too.
 */
export function GhostRace({ replay, leaderScore, leaderAddress }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== "off"; } catch { return true; }
  });

  const table = tables[replay.table] ?? tables[0];
  const samples = useMemo(() => parseTrace(replay.trace), [replay.trace]);
  const kamikaze = replay.mode === "kamikaze";
  const lastTick = samples.length ? samples[samples.length - 1].t : replay.tickCount;

  const viewHeight = useMemo(() => {
    const uw = table.underworld ?? table.height;
    const maxY = samples.reduce((m, s) => Math.max(m, s.y), 0);
    return maxY > uw ? table.height : uw;
  }, [table, samples]);

  function toggle(next: boolean) {
    setEnabled(next);
    try { localStorage.setItem(STORAGE_KEY, next ? "on" : "off"); } catch {}
  }

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cssW = 96;
    const cssH = Math.round(cssW * (viewHeight / table.width));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const scale = (cssW * dpr) / table.width;

    let raf = 0;

    function render() {
      const tick = getTickCount();
      const finished = tick >= lastTick;

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.fillStyle = "rgba(10, 10, 25, 0.85)";
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      // drain zone
      const drainY = viewHeight * scale;
      const dGrad = ctx!.createLinearGradient(0, drainY - 14 * dpr, 0, drainY);
      dGrad.addColorStop(0, "transparent");
      dGrad.addColorStop(1, kamikaze ? "rgba(34,197,94,0.5)" : "rgba(255,68,68,0.4)");
      ctx!.fillStyle = dGrad;
      ctx!.fillRect(0, drainY - 14 * dpr, canvas!.width, 14 * dpr);

      // ghost trail
      const tMs = tick * TICK_MS;
      ctx!.lineWidth = 2 * dpr;
      let prev: { x: number; y: number } | null = null;
      for (let ts = tMs - TRAIL_MS; ts <= tMs; ts += TICK_MS * 3) {
        const p = positionAt(samples, ts / TICK_MS);
        if (!p) continue;
        if (prev) {
          const alpha = Math.max(0, (ts - (tMs - TRAIL_MS)) / TRAIL_MS) * 0.5;
          ctx!.strokeStyle = `rgba(168, 85, 247, ${alpha.toFixed(3)})`;
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
        ctx!.arc(pos.x * scale, Math.min(pos.y, viewHeight) * scale, 4 * dpr, 0, Math.PI * 2);
        ctx!.fillStyle = finished ? "rgba(168, 85, 247, 0.45)" : "#a855f7";
        ctx!.shadowBlur = finished ? 0 : 10;
        ctx!.shadowColor = "#a855f7";
        ctx!.fill();
        ctx!.shadowBlur = 0;
      }

      raf = requestAnimationFrame(render);
    }

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [enabled, samples, table, viewHeight, kamikaze, lastTick]);

  const shortAddr = `${leaderAddress.slice(0, 6)}…${leaderAddress.slice(-4)}`;

  if (samples.length === 0) return null;

  if (!enabled) {
    return (
      <button
        onClick={() => toggle(true)}
        style={{
          position: "absolute", bottom: 8, left: 8, zIndex: 30,
          background: "rgba(88, 28, 135, 0.8)", color: "#e9d5ff",
          border: "1px solid rgba(168, 85, 247, 0.5)", borderRadius: 8,
          padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
          letterSpacing: "0.04em",
        }}
      >
        RACE #1
      </button>
    );
  }

  return (
    <div
      style={{
        position: "absolute", bottom: 8, left: 8, zIndex: 30,
        display: "flex", flexDirection: "column", alignItems: "stretch",
        background: "rgba(15, 10, 35, 0.85)", borderRadius: 10,
        border: "1px solid rgba(168, 85, 247, 0.45)", overflow: "hidden",
        boxShadow: "0 4px 18px rgba(0,0,0,0.45)",
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 6px", gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: "#c084fc", letterSpacing: "0.06em" }}>
          GHOST #1
        </span>
        <button
          onClick={() => toggle(false)}
          aria-label="Hide ghost race"
          style={{ background: "none", border: "none", color: "#c084fc", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}
        >
          ✕
        </button>
      </div>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      <div style={{ padding: "3px 6px", fontSize: 9, color: "#d8b4fe", fontVariantNumeric: "tabular-nums", textAlign: "center" }}>
        {formatGameScore(leaderScore, kamikaze)} · {shortAddr}
      </div>
    </div>
  );
}
