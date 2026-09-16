import React from "react";
import {
  BALLS_PER_GAME,
  KAMIKAZE_BUMPER_PENALTY_MS,
  KAMIKAZE_TRIGGER_PENALTY_MS,
  type PowerUpSide,
} from "@/definitions/game";
import type { MoodDisplay } from "@/utils/mood-display";
import { formatGameScore } from "@/utils/score-format";
import { StabilityMeter } from "./StabilityMeter";

export type RunPowerUp = { name: string; side: PowerUpSide; remainingMs: number };

export type RunHudProps = {
  kamikazeActive: boolean;
  hud: { score: number; balls: number; multiplier: number };
  mood: MoodDisplay;
  bestDrainMs: number | null;
  drainStreak: number;
  penaltyBumper: number;
  penaltyTrigger: number;
  stability: number;
  machineSaving: boolean;
  momentum: number;
  storedMunition: string | null;
  underworldCharge: number;
  chargePower: number | null;
  /** Live power-up effects. Rendered inline by the strip layout, ignored by the overlay. */
  powerUps: RunPowerUp[];
  /** Shot-calling mode swaps the control hint for the aim/RELEASE line. */
  shotCalling: boolean;
  /** The first-run coach is talking, so the cheat-sheet stays out of its way. */
  coached: boolean;
  paused: boolean;
  /**
   * Phones get `strip`: a slim band pinned across the top of the playfield.
   * The desktop overlay panel is ~200×300, which on a 358×477 table would cover
   * most of the corner the ball actually plays in.
   */
  variant: "overlay" | "strip";
};

const TAX = "TIME TAX";

function MeterLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 3, letterSpacing: "0.15em" }}>{children}</div>;
}

/** Reads positionally (green grows from the left, red from the right) and is
 *  labelled for screen readers rather than with a second row of text. */
function MomentumBar({ momentum }: { momentum: number }) {
  return (
    <div
      role="img"
      aria-label={`Momentum: ${Math.round(momentum * 100)}% yours, ${Math.round((1 - momentum) * 100)}% the machine's`}
      style={{ position: "relative", height: 8, borderRadius: 4, overflow: "hidden", background: "rgba(255,255,255,0.12)" }}
    >
      <div
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${momentum * 100}%`,
          background: "linear-gradient(90deg, #22c55e, #4ade80)",
          transition: "width 500ms ease",
          boxShadow: "0 0 8px rgba(34,197,94,0.6)",
        }}
      />
      <div
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0,
          width: `${(1 - momentum) * 100}%`,
          background: "linear-gradient(90deg, #f87171, #ef4444)",
          transition: "width 500ms ease",
          boxShadow: "0 0 8px rgba(239,68,68,0.6)",
        }}
      />
    </div>
  );
}

function UnderworldBar({ charge, height = 6 }: { charge: number; height?: number }) {
  const ready = charge >= 1;
  return (
    <div style={{ position: "relative", height, borderRadius: height / 2, overflow: "hidden", background: "rgba(255,255,255,0.12)" }}>
      <div
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${charge * 100}%`,
          background: ready
            ? "linear-gradient(90deg, #a855f7, #f0abfc)"
            : "linear-gradient(90deg, #7c3aed, #a855f7)",
          transition: "width 400ms ease",
          boxShadow: ready ? "0 0 8px rgba(168,85,247,0.8)" : "none",
        }}
      />
    </div>
  );
}

/** Lives as sakura petals: one per ball, faded when spent. */
function Lives({ balls, compact = false }: { balls: number; compact?: boolean }) {
  const size = compact ? 12 : 14;
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {!compact && <span style={{ fontSize: 11, opacity: 0.6, marginRight: 2, letterSpacing: "0.1em" }}>命</span>}
      {Array.from({ length: BALLS_PER_GAME }).map((_, i) => (
        <span
          key={i}
          style={{
            fontSize: size,
            lineHeight: 1,
            opacity: i < balls ? 1 : 0.18,
            filter: i < balls ? "none" : "grayscale(1)",
            transition: "opacity 300ms ease, filter 300ms ease",
          }}
        >
          🌸
        </span>
      ))}
    </span>
  );
}

/** How the machine is racking up your time. Two labelled rows, or one terse line. */
function TimeTax({ bumpers, triggers, compact = false }: { bumpers: number; triggers: number; compact?: boolean }) {
  if (bumpers <= 0 && triggers <= 0) return null;
  const total =
    bumpers * KAMIKAZE_BUMPER_PENALTY_MS + triggers * KAMIKAZE_TRIGGER_PENALTY_MS;
  if (compact) {
    return (
      <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "#f87171" }}>
        {TAX} · {bumpers > 0 ? `番兵×${bumpers}` : ""}
        {bumpers > 0 && triggers > 0 ? " " : ""}
        {triggers > 0 ? `門×${triggers}` : ""} · +{formatGameScore(total, true)}
      </div>
    );
  }
  return (
    <div>
      <MeterLabel>{TAX}</MeterLabel>
      <div style={{ fontSize: 11, lineHeight: 1.6 }}>
        {bumpers > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ opacity: 0.7 }}>番兵 bumpers ×{bumpers}</span>
            <span style={{ color: "#f87171" }}>+{formatGameScore(bumpers * KAMIKAZE_BUMPER_PENALTY_MS, true)}</span>
          </div>
        )}
        {triggers > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ opacity: 0.7 }}>門 trigger groups ×{triggers}</span>
            <span style={{ color: "#f87171" }}>+{formatGameScore(triggers * KAMIKAZE_TRIGGER_PENALTY_MS, true)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Whatever the player can do right now — the one line worth reading mid-run. */
function actionFor(p: RunHudProps): { text: string; color: string } | null {
  if (p.storedMunition) return { text: `${p.storedMunition} banked — double-tap to deploy`, color: "#4ade80" };
  if (p.underworldCharge >= 1) return { text: "UNDERWORLD READY — swipe up to tilt-lock", color: "#c084fc" };
  if (p.chargePower !== null && p.chargePower > 1.05) return { text: "Release to fire your nudge", color: "#4ade80" };
  return null;
}

function PowerUpPills({ powerUps }: { powerUps: RunPowerUp[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, pointerEvents: "none" }}>
      {powerUps.map((p) => (
        <div
          key={`${p.side}-${p.name}`}
          style={{
            padding: "2px 7px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.6)",
            border: `1px solid ${p.side === "player" ? "rgba(34,197,94,0.6)" : "rgba(255,68,68,0.6)"}`,
            color: p.side === "player" ? "#22c55e" : "#ff4444",
            fontSize: 10,
            fontWeight: "bold",
            whiteSpace: "nowrap",
          }}
        >
          {p.side === "player" ? "YOU" : "守"} · {p.name}
        </div>
      ))}
    </div>
  );
}

/**
 * The live run readout: the timer/score, lives, MAMORU's named state, and the
 * meters that explain *why* the run is going the way it is.
 *
 * Core Principles:
 * - PERFORMANT: `React.memo` + a parent that samples state at ~20Hz rather than
 *   60. Unchanged samples bail out here, so a quiet table reconciles nothing.
 * - INTUITIVE: two layouts — an overlay panel on desktop, a slim strip on
 *   phones where an overlay would sit on top of the playfield.
 * - CLEAN: presentational only. No state, no effects, no engine imports.
 */
function RunHudView(p: RunHudProps) {
  const { hud, mood, storedMunition, underworldCharge, penaltyBumper, penaltyTrigger } = p;
  const ballNumber = Math.min(BALLS_PER_GAME, BALLS_PER_GAME - hud.balls + 1);
  const action = actionFor(p);
  const taxing = penaltyBumper > 0 || penaltyTrigger > 0;

  const shell: React.CSSProperties = {
    borderRadius: 10,
    color: "#fff",
    pointerEvents: "none",
    ...(p.variant === "strip"
      ? {
          // In flow above the playfield: the strip cannot afford to sit on top
          // of a 358×477 table, but every row in it is a row the player reads.
          position: "relative",
          marginBottom: 8,
          padding: "6px 10px",
          background: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(255,255,255,0.12)",
          fontSize: 12,
          lineHeight: 1.4,
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }
      : {
          position: "absolute",
          left: 10,
          top: 10,
          padding: "8px 10px",
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.15)",
          fontSize: 12,
          lineHeight: 1.5,
        }),
  };

  if (!p.kamikazeActive) {
    return (
      <div style={shell}>
        <div>Score: {hud.score}</div>
        <div>Balls: {hud.balls}</div>
        <div>Multiplier: {hud.multiplier}x</div>
        {p.paused ? <div style={{ opacity: 0.85 }}>Paused</div> : null}
      </div>
    );
  }

  if (p.variant === "strip") {
    return (
      <div style={shell}>
        {/* Identity and the number that is the score. */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ color: "#ff4444", fontWeight: 800, fontSize: 11, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
              神風
            </span>
            <span
              title={mood.meaning}
              style={{ fontSize: 10, letterSpacing: "0.08em", color: mood.color, whiteSpace: "nowrap" }}
            >
              守 {mood.label}
            </span>
            {p.paused && <span style={{ fontSize: 10, opacity: 0.7 }}>· PAUSED</span>}
          </div>
          <div style={{ fontWeight: 800, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
            {formatGameScore(hud.score, true)}
          </div>
        </div>

        {/* Session shape: lives, the best ball so far, and the current streak. */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            fontSize: 10,
            letterSpacing: "0.06em",
            opacity: 0.85,
          }}
        >
          <Lives balls={hud.balls} compact />
          <span>BALL {ballNumber}/{BALLS_PER_GAME}</span>
          {p.bestDrainMs !== null && <span>· BEST {formatGameScore(p.bestDrainMs, true)}</span>}
          {p.drainStreak > 0 && (
            <span style={{ color: "#fbbf24", fontWeight: 700 }}>· STREAK ×{p.drainStreak}</span>
          )}
        </div>

        {/* The three tension meters, as thin a band as they can be. */}
        <MomentumBar momentum={p.momentum} />
        {underworldCharge > 0 && (
          <>
            <MeterLabel>UNDERWORLD {underworldCharge >= 1 ? "· READY" : ""}</MeterLabel>
            <UnderworldBar charge={underworldCharge} />
          </>
        )}
        <StabilityMeter value={p.stability} machineSaving={p.machineSaving} />

        {taxing && <TimeTax bumpers={penaltyBumper} triggers={penaltyTrigger} compact />}

        {/* Live power-up effects read inline here rather than in the desktop
            top-right column, which would land on top of the strip. */}
        {p.powerUps.length > 0 && <PowerUpPills powerUps={p.powerUps} />}

        {action && (
          <div style={{ fontSize: 11, color: action.color, fontWeight: 700, lineHeight: 1.4 }}>{action.text}</div>
        )}
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={{ color: "#ff4444", fontWeight: "bold" }}>神風 KAMIKAZE BALL</div>
      {/* MAMORU's state, named. The machine's difficulty is rubber-banded, so
          naming the state (and saying why) makes the escalation read as
          character rather than as the game quietly cheating. */}
      <div title={mood.meaning} style={{ marginTop: 2, fontSize: 10, letterSpacing: "0.08em", color: mood.color }}>
        守 MAMORU · {mood.label}
      </div>
      {/* Session shape: a run is the best of 3 balls, so say so — the 4s drain
          is the clip, the three-ball arc is the session. */}
      <div style={{ marginTop: 2, fontSize: 10, opacity: 0.75, letterSpacing: "0.08em" }}>
        BEST OF {BALLS_PER_GAME} · BALL {ballNumber}
        {p.bestDrainMs !== null ? ` · BEST ${formatGameScore(p.bestDrainMs, true)}` : ""}
      </div>
      <div style={{ marginTop: 2 }}>Time: {formatGameScore(hud.score, true)}</div>
      <div style={{ marginTop: 4, display: "flex", gap: 3, alignItems: "center" }}>
        <Lives balls={hud.balls} />
      </div>
      {/* Streak: consecutive drains without a save */}
      {p.drainStreak > 0 && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#fbbf24", fontWeight: 700, letterSpacing: "0.1em" }}>
          STREAK ×{p.drainStreak}
          {p.drainStreak >= 2 ? " — 無双 soon" : ""}
        </div>
      )}
      {/* Penalty breakdown: how the machine is racking up your time */}
      {taxing && (
        <div style={{ marginTop: 6 }}>
          <TimeTax bumpers={penaltyBumper} triggers={penaltyTrigger} />
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        <StabilityMeter value={p.stability} machineSaving={p.machineSaving} />
      </div>
      <div style={{ marginTop: 6 }}>
        <MeterLabel>MOMENTUM</MeterLabel>
        <MomentumBar momentum={p.momentum} />
      </div>
      {/* Banked munition: shown only when you actually have one. */}
      {storedMunition && (
        <div style={{ marginTop: 6 }}>
          <MeterLabel>MUNITION</MeterLabel>
          <div
            style={{
              display: "inline-block", padding: "2px 8px", borderRadius: 6,
              background: "rgba(34,197,94,0.18)", border: "1px solid rgba(34,197,94,0.6)",
              color: "#4ade80", fontSize: 11, fontWeight: 700,
            }}
          >
            {storedMunition} · tap×2
          </div>
        </div>
      )}
      {/* Underworld charge meter: hidden until it is actually charging. */}
      {underworldCharge > 0 && (
        <div style={{ marginTop: 6 }}>
          <MeterLabel>UNDERWORLD {underworldCharge >= 1 ? "· READY" : ""}</MeterLabel>
          <UnderworldBar charge={underworldCharge} />
        </div>
      )}
      {/* Live action feedback — transient, shown only while it applies. */}
      {action && (
        <div style={{ fontSize: 11, opacity: 0.95, marginTop: 6, lineHeight: 1.5, color: action.color, fontWeight: 700 }}>
          {action.text}
        </div>
      )}
      {/* Persistent cheat-sheet: first ball only, and never while the first-run
          coach is on the table saying the same thing. Later balls leave it out —
          a four-second run cannot afford reading. Phones drop it entirely: the
          coach and the "How to win" chip carry it, and the strip has no room. */}
      {!p.coached && hud.balls === BALLS_PER_GAME && !storedMunition && underworldCharge < 1 && (
        <div style={{ fontSize: 10, opacity: 0.55, marginTop: 6, lineHeight: 1.5 }}>
          {p.shotCalling
            ? "tap a side to aim · RELEASE to fire"
            : "HOLD charge · SWIPE↓ dive · SWIPE↑ tilt-lock"}
        </div>
      )}
      {p.paused ? <div style={{ opacity: 0.85 }}>Paused</div> : null}
    </div>
  );
}

export const RunHud = React.memo(RunHudView);
