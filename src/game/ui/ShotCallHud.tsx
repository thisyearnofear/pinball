import React from "react";

type Props = {
  phase: string;
  lanes: number;
  aimedLane: number;
  guardLane: number | null;
  /** Timing-meter marker position, 0..1. */
  meter: number;
  /** Sweet-spot half-width (0..1 of the half-range). */
  sweetSpot: number;
  onRelease: () => void;
};

/**
 * Shot-calling HUD — the serve-based duel surface. Deliberately sparse: it
 * shows the two things the player controls (WHERE via the aimed lane, HOW WELL
 * via the timing meter) and the one thing the machine does (WHICH lane MAMORU
 * is guarding). Tap a side of the table to aim; release on the sweet spot.
 */
export function ShotCallHud(props: Props) {
  const aiming = props.phase === "aiming";
  const laneLabels = props.lanes === 2 ? ["◀ LEFT", "RIGHT ▶"] : Array.from({ length: props.lanes }, (_, i) => `LANE ${i + 1}`);
  const sweetLeft = (0.5 - props.sweetSpot) * 100;
  const sweetWidth = props.sweetSpot * 2 * 100;

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
            border: `1px solid ${aiming ? "rgba(74,222,128,0.6)" : "rgba(255,255,255,0.25)"}`,
            color: aiming ? "#4ade80" : "rgba(255,255,255,0.7)",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.12em",
          }}
        >
          {aiming ? "守 · CALL YOUR SHOT" : "…RESOLVING"}
        </span>
      </div>

      {/* Bottom cluster: lanes, meter, release */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Lane indicators: green = your aim, red = MAMORU's guard */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {laneLabels.map((label, i) => {
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
                <div>{label}</div>
                <div style={{ fontSize: 10, marginTop: 2, opacity: 0.9 }}>
                  {guarded ? "守 GUARDED" : aimed ? "YOUR SHOT" : "open"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Timing meter: release when the marker crosses the sweet spot */}
        <div style={{ background: "rgba(0,0,0,0.55)", borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "rgba(255,255,255,0.55)", marginBottom: 6, textAlign: "center" }}>
            RELEASE ON THE SWEET SPOT
          </div>
          <div style={{ position: "relative", height: 16, borderRadius: 8, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            {/* sweet spot band (centered) */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${sweetLeft}%`,
                width: `${sweetWidth}%`,
                background: "rgba(74,222,128,0.35)",
                borderLeft: "1px solid rgba(74,222,128,0.7)",
                borderRight: "1px solid rgba(74,222,128,0.7)",
              }}
            />
            {/* marker */}
            <div
              style={{
                position: "absolute",
                top: -2,
                bottom: -2,
                left: `calc(${props.meter * 100}% - 2px)`,
                width: 4,
                borderRadius: 2,
                background: "#fff",
                boxShadow: "0 0 8px rgba(255,255,255,0.9)",
              }}
            />
          </div>
        </div>

        {/* Release button */}
        <button
          onClick={props.onRelease}
          disabled={!aiming}
          style={{
            pointerEvents: aiming ? "auto" : "none",
            padding: "14px 0",
            borderRadius: 12,
            border: "none",
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "0.14em",
            color: "#0a0a0a",
            background: aiming ? "linear-gradient(135deg, #4ade80, #22c55e)" : "rgba(255,255,255,0.15)",
            opacity: aiming ? 1 : 0.5,
            cursor: aiming ? "pointer" : "default",
          }}
        >
          {aiming ? "RELEASE 神風" : "…"}
        </button>
        <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em" }}>
          tap a side to aim · feint to draw 守 off · RELEASE (or Space) to fire
        </div>
      </div>
    </div>
  );
}
