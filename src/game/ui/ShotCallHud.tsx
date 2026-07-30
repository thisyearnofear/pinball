import React from "react";
import type { ShotResult } from "@/model/game";

type Props = {
  variant: "feint" | "precision";
  phase: string;
  lanes: number;
  aimedLane: number | null;
  guardLane: number | null;
  /** Timing-meter marker position, 0..1 (precision only). */
  meter: number;
  /** Sweet-spot half-width (0..1 of the half-range). */
  sweetSpot: number;
  /** Outcome of the previous shot, for causal feedback. */
  lastResult: ShotResult | null;
  /** Whether the engine currently allows a release (variant-gated). */
  canRelease: boolean;
  /** Feint sub-phase: idle | baiting | break. */
  feintStage: string;
  onRelease: () => void;
};

const laneName = (l: number | null, lanes: number) =>
  l === null ? "—" : lanes === 2 ? (l === 0 ? "LEFT" : "RIGHT") : `LANE ${l + 1}`;

/**
 * Shot-calling HUD — the serve-based duel surface, variant-aware:
 *  - feint:      no meter; release before MAMORU covers your lane.
 *  - precision:  timing meter; MAMORU pre-commits a lane, you pick + execute.
 * Shows the causal chain after each shot so input → error → outcome is legible.
 */
export function ShotCallHud(props: Props) {
  const aiming = props.phase === "aiming";
  const canFire = props.canRelease;
  const lanes = props.lanes;
  const sweetLeft = (0.5 - props.sweetSpot) * 100;
  const sweetWidth = props.sweetSpot * 2 * 100;

  // Causal feedback for the previous shot (shown on the terminal saved/drained beat).
  const r = props.lastResult;
  const drift = r ? (Math.abs(r.offset) < 0.05 ? "true line" : r.offset < 0 ? "drifted LEFT" : "drifted RIGHT") : "";
  const showResult = r !== null && (props.phase === "saved" || props.phase === "drained");
  // Teach the rule when a save was the player's own doing.
  let hint = "";
  if (r && r.result === "save") {
    if (r.calledLane !== null && r.calledLane === r.guardLane) {
      hint = props.variant === "feint"
        ? "you fired where 守 was guarding — switch lanes to beat it"
        : "you called the guarded lane — pick the open side";
    } else {
      hint = "your shot drifted into 守's guard";
    }
  }

  const banner = !aiming
    ? props.phase === "saved" ? "守 SAVED IT" : props.phase === "drained" ? "神風 DRAINED" : "…RESOLVING"
    : props.variant === "feint"
      ? props.feintStage === "break" ? "守 COMMITTED — BREAK!" : props.feintStage === "baiting" ? "BAIT — WAIT FOR 守" : "守 · FEINT THE GUARD"
      : "守 · CALL YOUR SHOT";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 12,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 12,
      }}
    >
      {/* Phase banner */}
      <div style={{ textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            padding: "6px 16px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.6)",
            border: `1px solid ${aiming ? "rgba(74,222,128,0.6)" : props.phase === "saved" ? "rgba(227,66,52,0.6)" : "rgba(74,222,128,0.6)"}`,
            color: aiming ? "#4ade80" : props.phase === "saved" ? "#fca5a5" : "#86efac",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.12em",
          }}
        >
          {banner}
        </span>
      </div>

      {/* Bottom cluster */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Causal feedback for the last shot */}
        {showResult && r && (
          <div
            style={{
              textAlign: "center",
              padding: "8px 12px",
              borderRadius: 10,
              background: r.result === "save" ? "rgba(227,66,52,0.18)" : "rgba(74,222,128,0.16)",
              border: `1px solid ${r.result === "save" ? "rgba(227,66,52,0.6)" : "rgba(74,222,128,0.6)"}`,
              color: r.result === "save" ? "#fca5a5" : "#86efac",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.03em",
            }}
          >
            {props.variant === "precision" ? `${Math.round(r.accuracy * 100)}% · ${drift} · ` : ""}
            called {laneName(r.calledLane, lanes)} · landed {laneName(r.landingLane, lanes)} · 守 held {laneName(r.guardLane, lanes)}
            {" → "}
            <strong>{r.result === "save" ? "SAVED" : "DRAINED"}</strong>
            {hint && (
              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, opacity: 0.9 }}>
                {hint}
              </div>
            )}
          </div>
        )}

        {/* Lane indicators: green = your aim, red = MAMORU's guard */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {Array.from({ length: lanes }, (_, i) => {
            const aimed = i === props.aimedLane;
            const guarded = i === props.guardLane;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  maxWidth: 160,
                  textAlign: "center",
                  padding: "8px 6px",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  background: guarded ? "rgba(227,66,52,0.22)" : aimed ? "rgba(74,222,128,0.18)" : "rgba(0,0,0,0.45)",
                  border: `2px solid ${guarded ? "rgba(227,66,52,0.85)" : aimed ? "rgba(74,222,128,0.85)" : "rgba(255,255,255,0.15)"}`,
                  color: guarded ? "#f87171" : aimed ? "#4ade80" : "rgba(255,255,255,0.6)",
                }}
              >
                <div>{laneName(i, lanes)}</div>
                <div style={{ fontSize: 10, marginTop: 2, opacity: 0.9 }}>
                  {guarded ? "守 GUARDED" : aimed ? "YOUR SHOT" : "open"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Timing meter (precision variant only) */}
        {props.variant === "precision" && (
          <div style={{ background: "rgba(0,0,0,0.55)", borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "rgba(255,255,255,0.55)", marginBottom: 6, textAlign: "center" }}>
              {props.aimedLane === null ? "CALL A LANE TO START THE METER" : "RELEASE ON THE SWEET SPOT"}
            </div>
            <div style={{ position: "relative", height: 16, borderRadius: 8, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
              <div
                style={{
                  position: "absolute", top: 0, bottom: 0, left: `${sweetLeft}%`, width: `${sweetWidth}%`,
                  background: "rgba(74,222,128,0.35)",
                  borderLeft: "1px solid rgba(74,222,128,0.7)", borderRight: "1px solid rgba(74,222,128,0.7)",
                }}
              />
              <div
                style={{
                  position: "absolute", top: -2, bottom: -2, left: `calc(${props.meter * 100}% - 2px)`,
                  width: 4, borderRadius: 2, background: "#fff", boxShadow: "0 0 8px rgba(255,255,255,0.9)",
                }}
              />
            </div>
          </div>
        )}

        {/* Release button */}
        <button
          onClick={props.onRelease}
          disabled={!canFire}
          style={{
            pointerEvents: canFire ? "auto" : "none",
            padding: "14px 0",
            borderRadius: 12,
            border: "none",
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "0.14em",
            color: canFire ? "#0a0a0a" : "rgba(255,255,255,0.5)",
            background: canFire ? "linear-gradient(135deg, #4ade80, #22c55e)" : "rgba(255,255,255,0.15)",
            cursor: canFire ? "pointer" : "default",
          }}
        >
          {props.variant === "feint"
            ? props.feintStage === "break" ? "FIRE 神風" : props.feintStage === "baiting" ? "WAIT FOR 守…" : "CALL A LANE FIRST"
            : props.aimedLane === null ? "CALL A LANE FIRST" : "RELEASE 神風"}
        </button>
        <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>
          {props.variant === "feint"
            ? "tap a lane to BAIT · wait for 守 to commit · SWITCH lanes, then FIRE before it recovers"
            : "tap the OPEN lane · RELEASE (or Space) on the sweet spot"}
        </div>
      </div>
    </div>
  );
}
