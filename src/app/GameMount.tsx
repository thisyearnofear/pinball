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
import { mountWorld, isSplatSupported, prefersReducedMotion, type WorldHandle } from "@/presentation";
import { MARBLE_WORLDS, getWorldById } from "@/config/worlds";
import { WorldLoadingOverlay, WorldLoadingIndicator } from "./ui/WorldLoadingOverlay";
import { type WorldReaction } from "@/presentation/world-reactor";

function applyWorldReaction(reaction: WorldReaction): void {
  const { type, intensity, data } = reaction;
  
  switch (type) {
    case 'milestone':
      if (data?.effect === 'lights_flicker') {
        document.body.style.filter = `brightness(${1 + intensity * 0.3})`;
        setTimeout(() => { document.body.style.filter = ''; }, reaction.duration);
      } else if (data?.effect === 'particles_appear') {
        document.body.style.boxShadow = `inset 0 0 ${intensity * 50}px rgba(255, 255, 255, ${intensity * 0.2})`;
        setTimeout(() => { document.body.style.boxShadow = ''; }, reaction.duration);
      }
      break;
    case 'weather':
      document.body.style.filter = `saturate(${1 + intensity * 0.5}) hue-rotate(${intensity * 20}deg)`;
      setTimeout(() => { document.body.style.filter = ''; }, reaction.duration);
      break;
    case 'breathe':
      document.body.style.transform = `scale(${1 + intensity * 0.02})`;
      document.body.style.transition = `transform ${reaction.duration}ms ease-in-out`;
      setTimeout(() => {
        document.body.style.transform = '';
        document.body.style.transition = '';
      }, reaction.duration);
      break;
    case 'multiball':
      document.body.style.filter = `brightness(${1 + intensity * 0.2}) saturate(${1 + intensity * 0.3})`;
      setTimeout(() => { document.body.style.filter = ''; }, reaction.duration);
      break;
    case 'impact':
      document.body.style.filter = `brightness(${1 + intensity * 0.15})`;
      setTimeout(() => { document.body.style.filter = ''; }, reaction.duration);
      break;
  }
}

type Props = {
  runKey: number;
  mode: "practice" | "tournament";
  tournamentId: number | null;
  playerAddress: string | null;
  walletPort: WalletPort | null;
  playerName: string;
  tableIndex: number;
  worldId?: string; // Optional world override (for themed tournaments)
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
  const worldContainerRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef<MountedGame | null>(null);
  const worldHandleRef = useRef<WorldHandle | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hud, setHud] = useState<{ score: number; balls: number; multiplier: number }>({
    score: 0,
    balls: BALLS_PER_GAME,
    multiplier: 1,
  });
  const [worldFallback, setWorldFallback] = useState(false);
  const [worldLoadingProgress, setWorldLoadingProgress] = useState<number | null>(null);
  const multiballRef = useRef(false);
  const gameRef = useRef<GameDef | null>(null);
  const prevActiveRef = useRef<boolean>(false);
  const activeRef = useRef<boolean>(false);
  const prevBallsRef = useRef<number>(BALLS_PER_GAME);
  const prevScoreRef = useRef<number>(0);
  const gameOverRef = useRef<boolean>(false);
  const lastDuckTimeRef = useRef<number>(0);
  const worldContainerStyleRef = useRef<HTMLDivElement | null>(null);

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

      // Check if we should render a Marble world
      const shouldRenderWorld = isSplatSupported() && !prefersReducedMotion();
      
      if (shouldRenderWorld && worldContainerRef.current) {
        const worldKey = props.worldId || 'HOBBITON';
        const world = getWorldById(worldKey) || MARBLE_WORLDS.HOBBITON;
        
        try {
          worldHandleRef.current = await mountWorld(worldContainerRef.current, world, {
            onProgress: (progress) => setWorldLoadingProgress(progress),
          });

          // Set up world reaction handler
          worldHandleRef.current.setOnWorldReaction((reaction) => {
            applyWorldReaction(reaction);
          });
        } catch (e) {
          console.warn('Failed to mount world, using fallback:', e);
          setWorldFallback(true);
        }
      } else {
        setWorldFallback(true);
      }

      mountedRef.current = await mountGame({
        container: containerRef.current,
        game: initialGame,
        touchscreen: true,
        onMessage: (msg: GameMessages | null) => {
          if (!msg) return;
          setMessage(String(msg));
          if (String(msg).toLowerCase().includes("multiball")) {
            multiballRef.current = true;
          }
          window.setTimeout(() => setMessage(null), 1500);
        },
      });

      gameRef.current = initialGame;

      // Enable ball-following camera when world is loaded
      worldHandleRef.current?.setBallTracking(true);
    }

    run().catch((e) => {
      console.error("Failed to mount game:", e);
    });

    return () => {
      cancelled = true;
      mountedRef.current?.destroy();
      mountedRef.current = null;
      worldHandleRef.current?.dispose();
      worldHandleRef.current = null;
      gameRef.current = null;
    };
  }, [initialGame, props.worldId]);

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
    gameOverRef.current = false;
    gameRef.current = g;

    // Reset world reactor for new game
    worldHandleRef.current?.resetReactor();

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

      setHud({
        score: g.score,
        balls: g.balls,
        multiplier: g.multiplier,
      });

      // Update world reactor with game state
      if (g.active) {
        worldHandleRef.current?.updateReactor(g.score, multiballRef.current);
      }

      // Update ball position for camera tracking
      if (g.active && mountedRef.current) {
        const ballPos = mountedRef.current.getBallPosition();
        if (ballPos) {
          worldHandleRef.current?.updateBallPosition(ballPos.x, ballPos.y);
          worldHandleRef.current?.updateBallLight(ballPos.x, ballPos.y, 10);
        }
      }

      // Duck ambience on score changes (ball hits/bumpers)
      if (g.score > prevScoreRef.current && g.active) {
        const now = performance.now();
        if (now - lastDuckTimeRef.current > 150) {
          worldHandleRef.current?.duckAmbience(300);
          worldHandleRef.current?.triggerImpact(0.4);
          lastDuckTimeRef.current = now;
        }
      }
      prevScoreRef.current = g.score;

      // Ball drain detection - fly camera on ball loss
      if (prevBallsRef.current > g.balls && g.balls > 0) {
        worldHandleRef.current?.pauseBallTracking(true);
        worldHandleRef.current?.flyToPreset('drain', { duration: 600, onComplete: () => {
          worldHandleRef.current?.pauseBallTracking(false);
        }});
      }
      // Ball start - fly camera to plunger for next ball
      if (prevBallsRef.current < g.balls || (!prevActiveRef.current && isActive)) {
        worldHandleRef.current?.pauseBallTracking(true);
        worldHandleRef.current?.flyToPreset('plunger', { duration: 800, onComplete: () => {
          worldHandleRef.current?.pauseBallTracking(false);
        }});
      }
      // Game over - fly camera to overview for share screen
      if (g.balls === 0 && !gameOverRef.current && g.score > 0) {
        gameOverRef.current = true;
        worldHandleRef.current?.pauseBallTracking(true);
        worldHandleRef.current?.flyToPreset('overview', { duration: 1200, onComplete: () => {
          worldHandleRef.current?.pauseBallTracking(false);
        }});
      }
      prevBallsRef.current = g.balls;

      if (wasActive && !isActive && g.score > 0) {
        props.onRunEnd?.(g.score);

        if (props.mode !== "tournament") return;

        const tournamentId = props.tournamentId;
        const address = props.playerAddress;

        if (!tournamentId || !address || !props.walletPort) return;

        try {
          props.onStatus?.("Submitting score…");
          props.onSubmissionStep?.("validating");

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
      {message ? (
        <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>Event: {message}</div>
      ) : null}
      <div style={{ position: "relative" }}>
        <div
          ref={worldContainerRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            zIndex: -1,
            background: worldFallback
              ? (getWorldById(props.worldId || '')?.gradient || "linear-gradient(180deg, #1a0a2e 0%, #16213e 50%, #0f0f23 100%)")
              : undefined,
          }}
        />
        {/* World loading progress overlay */}
        {worldLoadingProgress !== null && worldLoadingProgress < 1 && (
          <WorldLoadingOverlay
            world={getWorldById(props.worldId || '') || MARBLE_WORLDS.HOBBITON}
            progress={worldLoadingProgress}
            onDismiss={() => setWorldLoadingProgress(null)}
          />
        )}
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "75vh",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            overflow: "hidden",
            background: "transparent",
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

