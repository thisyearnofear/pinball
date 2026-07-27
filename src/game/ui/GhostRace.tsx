import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ReplayDigest } from "@/model/replay-recorder";
import { TICK_MS, parseTrace, positionAt, traceViewHeight } from "@/model/replay-trace";
import { getTickCount } from "@/model/game";
import tables from "@/definitions/tables";
import { formatGameScore } from "@/utils/score-format";
import { shortenAddress } from "@/utils/address";
import { getFromStorage, setInStorage } from "@/utils/local-storage";
import { STORED_GHOST_RACE } from "@/definitions/settings";

const TRAIL_MS = 450;

type Props = {
  replay: ReplayDigest;
  leaderScore: number;
  leaderAddress: string;
};

/**
 * Live picture-in-picture ghost of the tournament leader's run, synced to the
 * running game's engine tick so pauses freeze the ghost too.
 */
export function GhostRace({ replay, leaderScore, leaderAddress }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [enabled, setEnabled] = useState(() => getFromStorage(STORED_GHOST_RACE) !== "off");

  const table = tables[replay.table] ?? tables[0];
  const samples = useMemo(() => parseTrace(replay.trace), [replay.trace]);
  const kamikaze = replay.mode === "kamikaze";
  const lastTick = samples.length ? samples[samples.length - 1].t : replay.tickCount;

  const viewHeight = useMemo(() => traceViewHeight(table, samples), [table, samples]);

  function toggle(next: boolean) {
    setEnabled(next);
    setInStorage(STORED_GHOST_RACE, next ? "on" : "off");
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

    // static per-effect resources — no need to rebuild every frame
    const drainY = viewHeight * scale;
    const dGrad = ctx.createLinearGradient(0, drainY - 14 * dpr, 0, drainY);
    dGrad.addColorStop(0, "transparent");
    dGrad.addColorStop(1, kamikaze ? "rgba(34,197,94,0.5)" : "rgba(255,68,68,0.4)");

    let raf = 0;
    let lastRenderedTick = -1;

    function render() {
      const tick = getTickCount();
      if (tick === lastRenderedTick) {
        raf = requestAnimationFrame(render);
        return;
      }
      lastRenderedTick = tick;
      const finished = tick >= lastTick;

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.fillStyle = "rgba(10, 10, 25, 0.85)";
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      // drain zone
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

  const shortAddr = shortenAddress(leaderAddress);

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
