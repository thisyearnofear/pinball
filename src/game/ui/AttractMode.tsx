import React, { useEffect, useRef, useState } from "react";

import { type GameDef, BALLS_PER_GAME } from "@/definitions/game";
import { mulberry32, createRunSeed } from "@/utils/rng";

type MountedGame = {
  start: (game: GameDef) => Promise<void>;
  setPaused: (paused: boolean) => void;
  destroy: () => void;
};

/**
 * Lobby attract mode: the real engine plays a silent kamikaze demo —
 * the machine AI defends while gravity hunts the drain. No player input.
 * All engine modules are imported dynamically to stay out of the SSR chain.
 */
export function AttractMode({ height = 240 }: { height?: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFailed(true);
      return;
    }

    let cancelled = false;
    let mounted: MountedGame | null = null;
    let game: GameDef | null = null;
    let restartTimer = 0;
    let poll = 0;
    let sawActive = false;
    let unsuppressAudio: (() => void) | null = null;

    // On failure the component renders null, but the effect stays mounted —
    // tear the engine/interval/audio-suppression down explicitly.
    function fail() {
      window.clearInterval(poll);
      window.clearTimeout(restartTimer);
      mounted?.destroy();
      mounted = null;
      unsuppressAudio?.();
      unsuppressAudio = null;
      setFailed(true);
    }

    async function run() {
      if (!containerRef.current) return;
      try {
        const [
          { preloadAssets },
          { mountGame },
          { createKamikazeState },
          { setAudioSuppressed },
          { START_TABLE_INDEX },
        ] = await Promise.all([
          import("@/services/asset-preloader"),
          import("@/domains/game/mount-game"),
          import("@/model/kamikaze"),
          import("@/services/audio-service"),
          import("@/definitions/tables"),
        ]);
        if (cancelled) return;

        setAudioSuppressed(true);
        unsuppressAudio = () => setAudioSuppressed(false);

        const makeDemoGame = (): GameDef => {
          const rngSeed = createRunSeed();
          return {
            id: "attract",
            active: false,
            paused: false,
            table: START_TABLE_INDEX,
            score: 0,
            balls: BALLS_PER_GAME,
            multiplier: 1,
            underworld: false,
            kamikaze: createKamikazeState("medium"),
            rngSeed,
            rng: mulberry32(rngSeed),
          };
        };

        await preloadAssets();
        if (cancelled || !containerRef.current) return;

        game = makeDemoGame();
        mounted = await mountGame({ container: containerRef.current, game, attract: true });
        if (cancelled) {
          mounted.destroy();
          return;
        }

        // Loop forever: when the demo run ends, start a fresh one.
        poll = window.setInterval(() => {
          if (!game || !mounted) return;
          if (game.active) {
            sawActive = true;
          } else if (sawActive && !restartTimer) {
            restartTimer = window.setTimeout(() => {
              restartTimer = 0;
              sawActive = false;
              if (cancelled || !mounted) return;
              game = makeDemoGame();
              mounted.start(game).catch(() => fail());
            }, 1500);
          }
        }, 500);
      } catch (e) {
        console.warn("Attract mode unavailable:", e);
        fail();
      }
    }

    const onVisibility = () => {
      if (game) {
        game.paused = document.hidden;
        mounted?.setPaused(document.hidden);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    run();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(poll);
      window.clearTimeout(restartTimer);
      mounted?.destroy();
      unsuppressAudio?.();
    };
  }, []);

  if (failed) return (
    <div
      style={{
        height,
        borderRadius: 12,
        border: "1px solid rgba(255, 255, 255, 0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        color: "rgba(255, 255, 255, 0.3)",
      }}
    >
      Demo preview unavailable
    </div>
  );

  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(255, 68, 68, 0.25)",
        pointerEvents: "none",
        userSelect: "none",
      }}
      aria-hidden
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%", opacity: 0.85 }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.45) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.75)",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#ff4444",
            boxShadow: "0 0 6px #ff4444",
            animation: "attractPulse 1.6s ease-in-out infinite",
          }}
        />
        Live demo · the machine plays itself
      </div>
      <style>{`
        @keyframes attractPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
