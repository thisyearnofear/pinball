import React, { useEffect, useMemo, useRef, useState } from "react";

import { preloadAssets } from "@/services/asset-preloader";
import { mountGame, type MountedGame } from "@/domains/game/mount-game";
import type { GameDef, GameMessages } from "@/definitions/game";
import { BALLS_PER_GAME } from "@/definitions/game";
import { START_TABLE_INDEX } from "@/definitions/tables";
import { stopGame } from "@/services/high-scores-service";
import { getPlayerInfo } from "@/services/contracts/tournament-client";
import type { WalletPort } from "@/domains/wallet/wallet-port";
import type { SubmissionStep } from "./ui/ScoreSubmissionOverlay";

type Props = {
  runKey: number;
  mode: "practice" | "tournament";
  tournamentId: number | null;
  playerAddress: string | null;
  walletPort: WalletPort | null;
  playerName: string;
  tableIndex: number;
  paused: boolean;
  onActiveChange?: (active: boolean) => void;
  onRunEnd?: (score: number) => void;
  onSubmissionStep?: (step: SubmissionStep, errorMessage?: string) => void;
  onSubmissionAvailable?: (submission: {
    tournamentId: number;
    score: number;
    playerName: string;
    metaData: string;
    walletPort: WalletPort;
  } | null) => void;
  onSubmitted?: () => void;
  onStatus?: (s: string) => void;
  onError?: (e: string) => void;
};

export default function GameMount(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef<MountedGame | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hud, setHud] = useState<{ score: number; balls: number; multiplier: number }>({
    score: 0,
    balls: BALLS_PER_GAME,
    multiplier: 1,
  });
  const multiballRef = useRef(false);
  const gameRef = useRef<GameDef | null>(null);
  const prevActiveRef = useRef<boolean>(false);
  const activeRef = useRef<boolean>(false);

  const initialGame = useMemo<GameDef>(
    () => ({
      id: "practice",
      active: false,
      paused: false,
      table: START_TABLE_INDEX,
      score: 0,
      balls: BALLS_PER_GAME,
      multiplier: 1,
      underworld: false,
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!containerRef.current) return;

      // Shared loader: loads sprites + pathseg for SVG collision parsing.
      await preloadAssets();
      if (cancelled) return;

      mountedRef.current = await mountGame({
        container: containerRef.current,
        game: initialGame,
        touchscreen: true,
        onMessage: (msg: GameMessages | null) => {
          // Keep UI minimal: surface only high-signal messages.
          if (!msg) return;
          setMessage(String(msg));
          if (String(msg).toLowerCase().includes("multiball")) {
            multiballRef.current = true;
          }
          window.setTimeout(() => setMessage(null), 1500);
        },
      });

      gameRef.current = initialGame;
    }

    run().catch((e) => {
      console.error("Failed to mount game:", e);
    });

    return () => {
      cancelled = true;
      mountedRef.current?.destroy();
      mountedRef.current = null;
      gameRef.current = null;
    };
  }, [initialGame]);

  // Start/restart run when runKey changes.
  useEffect(() => {
    if (!mountedRef.current) return;

    const g: GameDef = {
      id: props.mode === "tournament" && props.tournamentId ? String(props.tournamentId) : "practice",
      active: false,
      paused: props.paused,
      table: props.tableIndex,
      score: 0,
      balls: BALLS_PER_GAME,
      multiplier: 1,
      underworld: false,
    };

    multiballRef.current = false;
    prevActiveRef.current = false;
    gameRef.current = g;

    mountedRef.current.start(g).catch((e) => {
      console.error(e);
      props.onError?.(e?.message ?? "Failed to start game");
    });
  }, [props.runKey, props.mode, props.tournamentId, props.tableIndex]);

  // Pause/unpause from parent.
  useEffect(() => {
    if (!mountedRef.current || !gameRef.current) return;
    gameRef.current.paused = props.paused;
    mountedRef.current.setPaused(props.paused);
  }, [props.paused]);

  // Detect end-of-run and submit if tournament mode.
  useEffect(() => {
    let raf = 0;
    let running = true;

    async function maybeSubmit() {
      const g = gameRef.current;
      if (!g) return;

      const wasActive = prevActiveRef.current;
      const isActive = Boolean(g.active);
      prevActiveRef.current = isActive;
      if (activeRef.current !== isActive) {
        activeRef.current = isActive;
        props.onActiveChange?.(isActive);
      }

      // HUD updates (throttle-ish via raf)
      setHud({
        score: g.score,
        balls: g.balls,
        multiplier: g.multiplier,
      });

      // Transition: active -> inactive, with a non-zero score
      if (wasActive && !isActive && g.score > 0) {
        props.onRunEnd?.(g.score);

        if (props.mode !== "tournament") {
          return;
        }

        const tournamentId = props.tournamentId;
        const address = props.playerAddress;

        if (!tournamentId || !address || !props.walletPort) return;

        try {
          props.onStatus?.("Submitting score…");
          props.onSubmissionStep?.("validating");

          // Ensure user is entered (guardrail for clearer UX).
          const p = await getPlayerInfo(tournamentId, address);
          if (!p.entered) {
            props.onSubmissionStep?.("error", "You are not entered in the active tournament.");
            return;
          }

          const metadata = JSON.stringify({
            table: g.table,
            multiplier: g.multiplier,
            multiball: multiballRef.current,
          });

          const name = (props.playerName || "").trim();
          props.onSubmissionAvailable?.({
            tournamentId,
            score: g.score,
            playerName: name,
            metaData: metadata,
            walletPort: props.walletPort,
          });

          await stopGame(String(tournamentId), g.score, name, metadata, props.walletPort);
          props.onStatus?.("Score submitted.");
          props.onSubmissionAvailable?.(null);
          props.onSubmitted?.();
        } catch (e: any) {
          console.error(e);
          const msg = String(e?.message ?? "Score submission failed.");
          if (msg === "SCORE_NOT_IMPROVED") {
            props.onSubmissionStep?.("skipped");
            props.onSubmissionAvailable?.(null);
          } else {
            props.onSubmissionStep?.("error", msg);
            props.onSubmissionAvailable?.({
              tournamentId,
              score: g.score,
              playerName: (props.playerName || "").trim(),
              metaData: JSON.stringify({
                table: g.table,
                multiplier: g.multiplier,
                multiball: multiballRef.current,
              }),
              walletPort: props.walletPort,
            });
          }
        }
      }
    }

    function tick() {
      if (!running) return;
      maybeSubmit().finally(() => {
        raf = window.requestAnimationFrame(tick);
      });
    }

    raf = window.requestAnimationFrame(tick);
    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
    };
  }, [props.mode, props.tournamentId, props.playerAddress, props.walletPort, props.playerName, props.onActiveChange]);

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
        Game mounted directly (no iframe) — React shell is now hosting the engine.
      </div>
      {message ? (
        <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>Event: {message}</div>
      ) : null}
      <div style={{ position: "relative" }}>
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "75vh",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            overflow: "hidden",
            background: "#000",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 10,
            top: 10,
            padding: "8px 10px",
            borderRadius: 10,
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            fontSize: 12,
            lineHeight: 1.5,
            pointerEvents: "none",
          }}
        >
          <div>Score: {hud.score}</div>
          <div>Balls: {hud.balls}</div>
          <div>Multiplier: {hud.multiplier}x</div>
          {props.paused ? <div style={{ opacity: 0.85 }}>Paused</div> : null}
        </div>
      </div>
    </div>
  );
}
