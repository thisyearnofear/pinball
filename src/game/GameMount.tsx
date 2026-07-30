import React, { useEffect, useMemo, useRef, useState } from "react";

import { preloadAssets } from "@/services/asset-preloader";
import { mountGame, type MountedGame } from "@/domains/game/mount-game";
import { type GameDef, GameMessages, BALLS_PER_GAME, KAMIKAZE_BUMPER_PENALTY_MS, KAMIKAZE_TRIGGER_PENALTY_MS } from "@/definitions/game";
import { START_TABLE_INDEX } from "@/definitions/tables";
import { stopGame } from "@/services/high-scores-service";
import { getPlayerInfo } from "@/services/contracts/tournament-client";
import type { WalletPort } from "@/domains/wallet/wallet-port";
import type { SubmissionStep } from "./ui/ScoreSubmissionOverlay";
import { mountWorld, isSplatSupported, prefersReducedMotion, type WorldHandle } from "@/presentation";
import { MARBLE_WORLDS, getWorldById } from "@/config/worlds";
import { WorldLoadingOverlay, WorldLoadingIndicator } from "./ui/WorldLoadingOverlay";
import { CelebrationParticles } from "./ui/CelebrationParticles";
import { ShotCallHud } from "./ui/ShotCallHud";
import { IMMERSION } from "@/config/immersion-tuning";
import { GhostRace } from "./ui/GhostRace";
import { StabilityMeter } from "./ui/StabilityMeter";
import { KanjiWatermark } from "./ui/KanjiWatermark";
import { type WorldReaction } from "@/presentation/world-reactor";
import { isKamikazeMode, getLastTaunt, getTickCount, getTimeScale, consumeMomentumShift, getMachineMood, consumeKillCam, setKillCamEnabled, isShotCallMode, getShotVariant, getShotPhase, getShotAimedLane, getShotGuardLane, getShotMeterPosition, getShotLanes, getLastShotResult, getShotCanRelease, getShotFeintStage, shotRelease, type ShotResult } from "@/model/game";
import { createKamikazeState, POWERUP_NAMES, type AIDifficulty } from "@/model/kamikaze";
import type { PowerUpSide } from "@/definitions/game";
import { mulberry32, createRunSeed } from "@/utils/rng";
import * as haptics from "@/utils/haptics";
import { startMachinePulse, stopMachinePulse } from "@/services/audio-service";
import { formatGameScore } from "@/utils/score-format";
import { startReplayRecording, finishReplayRecording, encodeReplay, type ReplayDigest } from "@/model/replay-recorder";
import { uploadReplay } from "@/services/backend-scores-client";
import { keccak256, toUtf8Bytes } from "ethers";

type GameMode = "classic" | "kamikaze";

function createRunGame(opts: {
  id: string;
  table: number;
  paused: boolean;
  gameMode: GameMode;
  aiDifficulty?: AIDifficulty;
  worldId?: string;
  controlScheme?: "steer" | "feint" | "precision";
}): GameDef {
  const rngSeed = createRunSeed();
  return {
    id: opts.id,
    active: false,
    paused: opts.paused,
    table: opts.table,
    score: 0,
    balls: BALLS_PER_GAME,
    multiplier: 1,
    underworld: false,
    kamikaze: opts.gameMode === "kamikaze" ? createKamikazeState(opts.aiDifficulty) : undefined,
    rngSeed,
    rng: mulberry32(rngSeed),
    worldPhysics: getWorldById(opts.worldId ?? "")?.physics,
    controlScheme: opts.controlScheme,
    aiDifficulty: opts.aiDifficulty,
  };
}

function beginRunRecording(g: GameDef, gameMode: GameMode, aiDifficulty?: AIDifficulty, worldId?: string): void {
  startReplayRecording({
    seed: g.rngSeed!,
    table: g.table,
    mode: gameMode,
    world: worldId,
    controlScheme: g.controlScheme,
    aiDifficulty: gameMode === "kamikaze" ? aiDifficulty ?? "medium" : undefined,
  });
}

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

/**
 * A1: the machine's mood drives the taunt overlay color. Calm reads as the
 * classic adversary red; as MAMORU destabilizes the palette shifts toward
 * amber (desperate), white-hot (enraged), and dim indigo (grieving).
 */
const MOOD_COLORS: Record<string, { color: string; border: string }> = {
    calm:      { color: "#ff4444", border: "rgba(255,68,68,0.4)" },
    smug:      { color: "#ff6b6b", border: "rgba(255,107,107,0.5)" },
    wary:      { color: "#fbbf24", border: "rgba(251,191,36,0.5)" },
    desperate: { color: "#f59e0b", border: "rgba(245,158,11,0.6)" },
    enraged:   { color: "#ffffff", border: "rgba(255,255,255,0.8)" },
    grieving:  { color: "#818cf8", border: "rgba(129,140,248,0.5)" },
};

/**
 * Faint directional guide drawn from the ball to the pointer while charging.
 * Shows the player that their hold is aiming a nudge, not just waiting.
 */
function AimGuide(props: {
  aimPoint: { x: number; y: number } | null;
  charging: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  getBallClientPos: () => { x: number; y: number } | null;
}) {
  const [, force] = React.useState(0);
  // Repaint every frame while charging so the line tracks the moving pointer.
  React.useEffect(() => {
    if (!props.charging) return;
    let raf = 0;
    const loop = () => { force((n) => (n + 1) % 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [props.charging]);

  if (!props.charging || !props.aimPoint) return null;
  const container = props.containerRef.current;
  if (!container) return null;
  const ball = props.getBallClientPos();
  if (!ball) return null;
  const rect = container.getBoundingClientRect();
  const fromX = ball.x - rect.left;
  const fromY = ball.y - rect.top;
  const toX = props.aimPoint.x - rect.left;
  const toY = props.aimPoint.y - rect.top;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 4) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const lineLen = Math.min(len, 160);
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10 }}>
      <div
        style={{
          position: "absolute",
          left: fromX,
          top: fromY,
          width: lineLen,
          height: 2,
          transformOrigin: "0 50%",
          transform: `rotate(${angle}deg)`,
          background: "linear-gradient(90deg, rgba(74,222,128,0.9), rgba(74,222,128,0))",
          boxShadow: "0 0 6px rgba(74,222,128,0.6)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: fromX - 4,
          top: fromY - 4,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "rgba(74,222,128,0.85)",
        }}
      />
    </div>
  );
}

type Props = {
  runKey: number;
  mode: "practice" | "tournament";
  gameMode: "classic" | "kamikaze";
  aiDifficulty?: AIDifficulty;
  tournamentId: number | null;
  playerAddress: string | null;
  walletPort: WalletPort | null;
  playerName: string;
  tableIndex: number;
  worldId?: string; // Optional world override (for themed tournaments)
  controlScheme?: "steer" | "feint" | "precision"; // Kamikaze control: nudge vs the two shot-calling variants
  paused: boolean;
  /** Tournament leader's replay for live ghost racing. */
  ghost?: { digest: ReplayDigest; score: number; address: string } | null;
  onActiveChange?: (active: boolean) => void;
  onRunEnd?: (score: number, replayHash?: string) => void;
  /** Fired once on the player's first deliberate in-run action (early win). */
  onFirstAction?: () => void;
  onReplayAvailable?: (replay: ReplayDigest) => void;
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
  const [mountError, setMountError] = useState<string | null>(null);
  const [hud, setHud] = useState<{ score: number; balls: number; multiplier: number }>({
    score: 0,
    balls: BALLS_PER_GAME,
    multiplier: 1,
  });
  const [kamikazeActive, setKamikazeActive] = useState(false);
  const [stability, setStability] = useState(0);
  const [machineSaving, setMachineSaving] = useState(false);
  const [kamikazeMessage, setKamikazeMessage] = useState<string | null>(null);
  const [machineMood, setMachineMood] = useState<string>("calm");
  const [shotHud, setShotHud] = useState<{ variant: "feint" | "precision"; phase: string; aimedLane: number | null; guardLane: number | null; meter: number; lanes: number; lastResult: ShotResult | null; canRelease: boolean; feintStage: string; active: boolean }>(
    { variant: "feint", phase: "aiming", aimedLane: null, guardLane: null, meter: 0, lanes: 2, lastResult: null, canRelease: false, feintStage: "idle", active: false }
  );
  const [activePowerUps, setActivePowerUps] = useState<{ name: string; side: PowerUpSide; remainingMs: number }[]>([]);
  const [slowMoActive, setSlowMoActive] = useState(false);
  const [momentum, setMomentum] = useState(0.5);
  const [momentumShift, setMomentumShift] = useState<"player" | "machine" | null>(null);
  // Phase 2 player agency
  const [chargePower, setChargePower] = useState<number | null>(null);
  const [storedMunition, setStoredMunition] = useState<string | null>(null);
  const [underworldCharge, setUnderworldCharge] = useState(0);
  const [agencyBanner, setAgencyBanner] = useState<string | null>(null);
  const [aimPoint, setAimPoint] = useState<{ x: number; y: number } | null>(null);
  const agencyBannerClearRef = useRef(0);
  const momentumShiftClearRef = useRef(0);
  // Phase 3 HUD polish
  const [drainStreak, setDrainStreak] = useState(0);
  const [penaltyBumper, setPenaltyBumper] = useState(0);
  const [penaltyTrigger, setPenaltyTrigger] = useState(0);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rippleIdRef = useRef(0);
  // Victory FX: incrementing id keys the flash/shake/punch animations; confetti auto-clears.
  const [victoryFx, setVictoryFx] = useState(0);
  const [victoryConfetti, setVictoryConfetti] = useState(false);
  const [victoryTimeText, setVictoryTimeText] = useState<string | null>(null);
  const victoryClearRef = useRef(0);
  // Shake is applied imperatively: re-keying the wrapper would remount (and kill) the canvas.
  const shakeRef = useRef<HTMLDivElement | null>(null);

  function fireVictoryFx() {
    const g = gameRef.current;
    setVictoryFx((v) => v + 1);
    setVictoryConfetti(true);
    setVictoryTimeText(g ? formatGameScore(g.score, true) : null);
    const shakeEl = shakeRef.current;
    if (shakeEl) {
      shakeEl.style.animation = "none";
      void shakeEl.offsetWidth; // restart the CSS animation
      shakeEl.style.animation = "victoryShake 0.5s ease-out";
    }
    window.clearTimeout(victoryClearRef.current);
    victoryClearRef.current = window.setTimeout(() => {
      setVictoryConfetti(false);
      setVictoryTimeText(null);
    }, 2200);

    const world = worldHandleRef.current;
    world?.triggerImpact(1.0);
    world?.duckAmbience(800);
    world?.pauseBallTracking(true);
    world?.flyToPreset("drain", {
      duration: 500,
      onComplete: () => world?.pauseBallTracking(false),
    });
  }

  function spawnRipple(e: React.MouseEvent<HTMLDivElement>) {
    if (!isKamikazeMode()) return;
    haptics.nudge();
    const rect = e.currentTarget.getBoundingClientRect();
    const id = ++rippleIdRef.current;
    setRipples((prev) => [...prev.slice(-4), { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    window.setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
  }

  // Phase 2 agency: transient banner for deliberate verbs (dive / deploy).
  function showAgencyBanner(text: string) {
    setAgencyBanner(text);
    window.clearTimeout(agencyBannerClearRef.current);
    agencyBannerClearRef.current = window.setTimeout(() => setAgencyBanner(null), 1400);
  }
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
  const runStartRef = useRef<number>(0);
  const worldContainerStyleRef = useRef<HTMLDivElement | null>(null);

  const initialGame = useMemo<GameDef>(
    () => createRunGame({ id: "practice", table: START_TABLE_INDEX, paused: false, gameMode: props.gameMode, aiDifficulty: props.aiDifficulty, worldId: props.worldId, controlScheme: props.controlScheme }),
    [props.gameMode, props.aiDifficulty],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!containerRef.current) return;

      // Shared loader: loads sprites + pathseg for SVG collision parsing.
      await preloadAssets();
      if (cancelled) return;

      // Check if we should render a Marble world
      const shouldRenderWorld = isSplatSupported() && !prefersReducedMotion() && Boolean((getWorldById(props.worldId || '') || MARBLE_WORLDS.HOBBITON).spzUrl);
      
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
        onCharge: (power) => setChargePower(power),
        onDive: () => showAgencyBanner("突っ込む · DIVE!"),
        onNudge: (power) => showAgencyBanner(power >= 2.9 ? "全力 · MAX NUDDGE!" : "突き · POWER NUDDGE!"),
        onDeploy: () => {
          const g = gameRef.current;
          const active = g?.kamikaze?.activePowerUps.find((p) => p.side === "player");
          showAgencyBanner(active ? `発動 · ${POWERUP_NAMES[active.type]}!` : "発動 · MUNITION DEPLOYED!");
        },
        onTiltLock: () => showAgencyBanner("封 · TILT-LOCK!"),
        onTiltLockCooldown: () => showAgencyBanner("…still charging"),
        onFirstAction: () => props.onFirstAction?.(),
        onAim: (x, y) => setAimPoint(x !== null && y !== null ? { x, y } : null),
        onMessage: (msg: GameMessages | null) => {
          if (!msg) return;
          setMessage(String(msg));

          // Kamikaze Ball messages
          if (msg === GameMessages.DRAINED) {
            // The winning drain: full victory spectacle (the AI_TAUNT banner follows)
            fireVictoryFx();
            return;
          }
          const kamikazeMessages: Record<number, string> = {
            [GameMessages.KAMIKAZE_START]: "神風 — DRAIN IT!",
            [GameMessages.SAVED]: "The machine catches the blossom.",
            [GameMessages.POWERUP_ROULETTE]: "Munitions crate! Rolling…",
            [GameMessages.POWERUP_PLAYER]: "Munition activated!",
            [GameMessages.POWERUP_MACHINE]: "Countermeasure deployed!",
            [GameMessages.SAKURA_STORM]: "桜吹雪 · SAKURA STORM! The machine is blinded.",
            [GameMessages.KAMIS_WRATH]: "神の怒り · KAMI'S WRATH! The table hurls the ball.",
            [GameMessages.UNSTOPPABLE]: "無双 · UNSTOPPABLE!",
          };
          const kamMsg = msg === GameMessages.AI_TAUNT
            ? `守: "${getLastTaunt()}"`
            : kamikazeMessages[msg];
          if (kamMsg) {
            setKamikazeMessage(kamMsg);
            window.setTimeout(() => setKamikazeMessage(null), msg === GameMessages.UNSTOPPABLE ? 3200 : 2500);
          }
          if (msg === GameMessages.UNSTOPPABLE) {
            fireVictoryFx();
          }

          if (String(msg).toLowerCase().includes("multiball")) {
            multiballRef.current = true;
          }
          window.setTimeout(() => setMessage(null), 1500);
        },
      });

      gameRef.current = initialGame;

      // A2: the kill cam plays in live + attract modes but is suppressed while
      // racing/viewing a ghost so the comparison timeline stays pure.
      setKillCamEnabled(!props.ghost);

      // The runKey effect can't record the first run (it bails while the mount
      // is still in flight), so start recording for the initial game here.
      beginRunRecording(initialGame, props.gameMode, props.aiDifficulty, props.worldId);
      runStartRef.current = performance.now();

      // Enable ball-following camera when world is loaded
      worldHandleRef.current?.setBallTracking(true);

      // B3: MAMORU's heartbeat — the machine pulse reads the live mood and
      // beats under the music (calm 60bpm → desperate 120bpm → grieving stops).
      if (props.gameMode === "kamikaze") startMachinePulse(getMachineMood);
    }

    run().catch((e) => {
      console.error("Failed to mount game:", e);
      setMountError(e?.message ?? "Failed to load the game engine.");
    });

    return () => {
      cancelled = true;
      stopMachinePulse();
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

    const g = createRunGame({
      id: props.mode === "tournament" && props.tournamentId ? String(props.tournamentId) : "practice",
      table: props.tableIndex,
      paused: props.paused,
      gameMode: props.gameMode,
      aiDifficulty: props.aiDifficulty,
      worldId: props.worldId,
      controlScheme: props.controlScheme,
    });

    beginRunRecording(g, props.gameMode, props.aiDifficulty, props.worldId);
    runStartRef.current = performance.now();

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

      // Bail-out compares: this runs at 60fps, only re-render when values change.
      setHud((prev) =>
        prev.score === g.score && prev.balls === g.balls && prev.multiplier === g.multiplier
          ? prev
          : { score: g.score, balls: g.balls, multiplier: g.multiplier },
      );
      setKamikazeActive(isKamikazeMode());
      // A1: surface the machine's mood so the taunt overlay can color-shift.
      const mood = getMachineMood();
      setMachineMood((prev) => (prev === mood ? prev : mood));
      // Shot-calling HUD: poll the live duel state (the meter animates per frame).
      if (isShotCallMode()) {
        setShotHud({
          active: true,
          variant: getShotVariant(),
          phase: getShotPhase(),
          aimedLane: getShotAimedLane(),
          guardLane: getShotGuardLane(),
          meter: getShotMeterPosition(),
          lanes: getShotLanes(),
          lastResult: getLastShotResult(),
          canRelease: getShotCanRelease(),
          feintStage: getShotFeintStage(),
        });
      } else {
        setShotHud((prev) => (prev.active ? { ...prev, active: false } : prev));
      }

      // Slow-mo + momentum (Phase 1 immersion)
      const ts = getTimeScale();
      setSlowMoActive((prev) => (ts < 0.85) !== prev ? ts < 0.85 : prev);
      if (g.kamikaze?.enabled) {
        setMomentum(g.kamikaze.rubberBandBias);
        // Phase 2 agency: surface banked munition + underworld charge
        const banked = g.kamikaze.storedPowerUp;
        setStoredMunition((prev) => {
          const next = banked !== null ? POWERUP_NAMES[banked] : null;
          return prev === next ? prev : next;
        });
        setUnderworldCharge((prev) => (Math.abs(prev - g.kamikaze!.underworldCharge) < 0.01 ? prev : g.kamikaze!.underworldCharge));
        // Phase 3 HUD polish: streak + live penalty breakdown
        setDrainStreak((prev) => (prev === g.kamikaze!.drainStreak ? prev : g.kamikaze!.drainStreak));
        setPenaltyBumper((prev) => (prev === g.kamikaze!.totalBumperHits ? prev : g.kamikaze!.totalBumperHits));
        setPenaltyTrigger((prev) => (prev === g.kamikaze!.totalTriggerGroupCompletions ? prev : g.kamikaze!.totalTriggerGroupCompletions));
        const shift = consumeMomentumShift();
        if (shift) {
          setMomentumShift(shift);
          window.clearTimeout(momentumShiftClearRef.current);
          momentumShiftClearRef.current = window.setTimeout(() => setMomentumShift(null), 2200);
        }
        // A2 KILL CAM: directed camera push on the playfield frame. Applied to
        // containerRef (inner, overflow:hidden) so it never fights the
        // victoryShake animation running on shakeRef (outer). The 3D world
        // impact + fly-to-drain already fire from fireVictoryFx on DRAINED;
        // this adds the slow push-in that makes the drain a clip-able moment.
        if (consumeKillCam()) {
          const frame = containerRef.current;
          if (frame) {
            frame.style.transition = "transform 900ms cubic-bezier(0.16, 1, 0.3, 1)";
            frame.style.transform = "scale(1.06) translateY(-2%)";
            window.setTimeout(() => {
              frame.style.transition = "transform 450ms ease-out";
              frame.style.transform = "";
            }, 900);
          }
        }
      }

      // Kamikaze power-up HUD: active effects per side with countdown
      if (g.kamikaze?.enabled) {
        const now = performance.now();
        setActivePowerUps((prev) => {
          const next = g.kamikaze!.activePowerUps
            .filter((p) => p.expiresAt > now)
            .map((p) => ({ name: POWERUP_NAMES[p.type], side: p.side, remainingMs: p.expiresAt - now }));
          return prev.length === 0 && next.length === 0 ? prev : next;
        });
      }

      // Update world reactor with game state.
      // Kamikaze: score is a running timer, not points — skip score milestones.
      if (g.active) {
        worldHandleRef.current?.updateReactor(g.kamikaze?.enabled ? 0 : g.score, multiballRef.current);
      }

      // Update ball position for camera tracking + stability meter
      if (g.active && mountedRef.current) {
        const ballPos = mountedRef.current.getBallPosition();
        if (ballPos) {
          worldHandleRef.current?.updateBallPosition(ballPos.x, ballPos.y);
          worldHandleRef.current?.updateBallLight(ballPos.x, ballPos.y, 10);

          // Stability meter: how close is the ball to the drain (bottom of table)?
          if (g.kamikaze?.enabled) {
            const tableHeight = mountedRef.current.getTableHeight();
            if (tableHeight > 0) {
              const proximity = Math.max(0, Math.min(1, ballPos.y / tableHeight));
              setStability(proximity);
              // Check if machine is actively saving (force field or save power-up)
              const now = performance.now();
              const saving = g.kamikaze.activePowerUps.some(
                (p) => p.side === "machine" && p.expiresAt > now,
              );
              setMachineSaving(saving);
            }
          }
        }
      }

      // Duck ambience on score changes (ball hits/bumpers).
      // Skipped in kamikaze mode where score is a running timer.
      if (g.score > prevScoreRef.current && g.active && !g.kamikaze?.enabled) {
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
        // Kamikaze: the drain fly already happened at the DRAINED message; a new
        // ball is spawning now, so fly to the plunger instead.
        const preset = g.kamikaze?.enabled ? 'plunger' : 'drain';
        worldHandleRef.current?.pauseBallTracking(true);
        worldHandleRef.current?.flyToPreset(preset, { duration: 600, onComplete: () => {
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
        const replay = finishReplayRecording(g.score, getTickCount());
        if (replay) props.onReplayAvailable?.(replay);
        const replayJson = replay ? encodeReplay(replay) : null;
        const replayHash = replayJson ? keccak256(toUtf8Bytes(replayJson)) : undefined;
        const duration = Math.min(
          3_600_000,
          Math.max(1, Math.round(performance.now() - runStartRef.current)),
        );

        props.onRunEnd?.(g.score, replayHash);

        if (props.mode !== "tournament") return;

        const tournamentId = props.tournamentId;
        const address = props.playerAddress;

        if (!tournamentId || !address || !props.walletPort) return;

        const metadata = JSON.stringify({
          table: g.table,
          multiplier: g.multiplier,
          multiball: multiballRef.current,
          mode: props.gameMode,
          duration,
          ...(replayHash ? { replayHash } : {}),
          ...(props.gameMode === "kamikaze" ? { aiDifficulty: props.aiDifficulty ?? "medium" } : {}),
        });

        // Ship the full replay to the backend BEFORE requesting the signature:
        // the backend looks the replay up by its hash to verify it pre-signing.
        try {
          props.onStatus?.("Submitting score…");
          props.onSubmissionStep?.("validating");
          if (replayJson) props.onSubmissionStep?.("verifying");

          const [p] = await Promise.all([
            getPlayerInfo(tournamentId, address),
            replayJson
              ? uploadReplay({ tournamentId, address, replay: replayJson }).catch((e) =>
                  console.warn("Replay upload failed:", e),
                )
              : Promise.resolve(),
          ]);
          if (!p.entered) {
            props.onSubmissionStep?.("error", "You are not entered in the active tournament.");
            return;
          }

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
              metaData: metadata,
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
      <div
        ref={shakeRef}
        style={{ position: "relative" }}
        onClick={spawnRipple}
      >
        {props.gameMode === "kamikaze" && !mountError && <KanjiWatermark size="table" />}
        <style>{`
          @keyframes kamikazeRipple { from { transform: translate(-50%, -50%) scale(0.3); opacity: 0.8; } to { transform: translate(-50%, -50%) scale(2); opacity: 0; } }
          @keyframes victoryShake {
            0%, 100% { transform: translate(0, 0); }
            10% { transform: translate(-8px, 4px); }
            20% { transform: translate(9px, -3px); }
            30% { transform: translate(-7px, -5px); }
            40% { transform: translate(6px, 4px); }
            50% { transform: translate(-5px, 3px); }
            60% { transform: translate(4px, -3px); }
            70% { transform: translate(-3px, 2px); }
            80% { transform: translate(2px, -1px); }
            90% { transform: translate(-1px, 1px); }
          }
          @keyframes victoryFlash {
            0% { opacity: 0.9; }
            100% { opacity: 0; }
          }
          @keyframes victoryPunch {
            0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
            30% { transform: translate(-50%, -50%) scale(1.25); opacity: 1; }
            45% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            80% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1.1); opacity: 0; }
          }
          @keyframes momentumShiftIn {
            0% { transform: translateY(-12px) scale(0.9); opacity: 0; }
            18% { transform: translateY(0) scale(1.03); opacity: 1; }
            78% { transform: translateY(0) scale(1); opacity: 1; }
            100% { transform: translateY(-8px) scale(0.98); opacity: 0; }
          }
        `}</style>
        {victoryFx > 0 && victoryTimeText && (
          <>
            <div
              key={`flash-${victoryFx}`}
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at 50% 80%, rgba(255,255,255,0.95) 0%, rgba(255,68,68,0.5) 40%, transparent 75%)",
                pointerEvents: "none",
                zIndex: 11,
                animation: "victoryFlash 0.7s ease-out forwards",
                borderRadius: 8,
              }}
            />
            <div
              key={`punch-${victoryFx}`}
              style={{
                position: "absolute",
                top: "55%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 12,
                textAlign: "center",
                animation: "victoryPunch 2s ease-out forwards",
              }}
            >
              <div
                style={{
                  fontSize: 52,
                  fontWeight: 900,
                  letterSpacing: 4,
                  color: "#fff",
                  textShadow: "0 0 24px rgba(255,68,68,0.9), 0 0 60px rgba(255,68,68,0.6)",
                }}
              >
                DRAINED!
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: "#22c55e",
                  textShadow: "0 0 16px rgba(34,197,94,0.8)",
                }}
              >
                {victoryTimeText}
              </div>
            </div>
          </>
        )}
        <CelebrationParticles active={victoryConfetti} />
        {ripples.map((r) => (
          <div
            key={r.id}
            style={{
              position: "absolute",
              left: r.x,
              top: r.y,
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "2px solid rgba(255, 68, 68, 0.8)",
              pointerEvents: "none",
              zIndex: 9,
              animation: "kamikazeRipple 0.6s ease-out forwards",
            }}
          />
        ))}
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
        {/* Fallback notice when 3D world unavailable */}
        {worldFallback && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              padding: "4px 10px",
              borderRadius: 6,
              background: "rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.5)",
              fontSize: 11,
              lineHeight: 1.4,
              pointerEvents: "none",
              zIndex: 5,
            }}
          >
            3D world unavailable — playing in 2D mode
          </div>
        )}
        {mountError ? (
          <div
            style={{
              width: "100%",
              height: "75vh",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              background: "rgba(239, 68, 68, 0.05)",
            }}
          >
            <div style={{ fontSize: 32 }}>🎯</div>
            <div style={{ color: "#fca5a5", fontSize: 14, textAlign: "center", maxWidth: 300 }}>
              {mountError}
            </div>
            <button
              onClick={() => { setMountError(null); window.location.reload(); }}
              style={{
                padding: "8px 20px", borderRadius: 8, border: "none",
                background: "rgba(99, 102, 241, 0.8)", color: "#fff",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        ) : (
        <div
          ref={containerRef}
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            height: "75vh",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            overflow: "hidden",
            background: "transparent",
          }}
        />
        )}
        {/* Slow-motion cinematic FX: vignette + letterbox bars */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 4,
            pointerEvents: "none",
            opacity: slowMoActive ? 1 : 0,
            transition: "opacity 220ms ease",
            boxShadow: "inset 0 0 120px 40px rgba(0,0,0,0.75)",
            background: "radial-gradient(ellipse at center, transparent 55%, rgba(20,10,30,0.35) 100%)",
          }}
        >
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 26, background: "linear-gradient(180deg, rgba(0,0,0,0.85), transparent)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 26, background: "linear-gradient(0deg, rgba(0,0,0,0.85), transparent)" }} />
          <div style={{
            position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
            fontSize: 11, letterSpacing: "0.4em", color: "rgba(255,255,255,0.5)", fontWeight: 700,
          }}>スロー</div>
        </div>
        {/* Momentum shift banner */}
        {momentumShift && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "38%",
              left: 0,
              right: 0,
              zIndex: 8,
              pointerEvents: "none",
              textAlign: "center",
              animation: "momentumShiftIn 2.2s ease-out forwards",
            }}
          >
            <div style={{
              display: "inline-block",
              padding: "10px 28px",
              borderRadius: 10,
              background: momentumShift === "player" ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)",
              border: `1px solid ${momentumShift === "player" ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)"}`,
              color: momentumShift === "player" ? "#4ade80" : "#f87171",
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: "0.12em",
              textShadow: "0 0 12px rgba(0,0,0,0.8)",
            }}>
              {momentumShift === "player" ? "風向きが変わる · THE WIND SHIFTS" : "鉄壁 · THE MACHINE HARDENS"}
            </div>
          </div>
        )}
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
          {kamikazeActive ? (
            <>
              <div style={{ color: "#ff4444", fontWeight: "bold" }}>神風 KAMIKAZE BALL</div>
              <div>Time: {formatGameScore(hud.score, true)}</div>
              {/* Lives as sakura petals: one per ball, faded when spent */}
              <div style={{ marginTop: 4, display: "flex", gap: 3, alignItems: "center" }}>
                <span style={{ fontSize: 9, opacity: 0.6, marginRight: 2, letterSpacing: "0.1em" }}>命</span>
                {Array.from({ length: BALLS_PER_GAME }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 14,
                      lineHeight: 1,
                      opacity: i < hud.balls ? 1 : 0.18,
                      filter: i < hud.balls ? "none" : "grayscale(1)",
                      transition: "opacity 300ms ease, filter 300ms ease",
                    }}
                  >🌸</span>
                ))}
              </div>
              {/* Streak: consecutive drains without a save */}
              {drainStreak > 0 && (
                <div style={{ marginTop: 4, fontSize: 10, color: "#fbbf24", fontWeight: 700, letterSpacing: "0.1em" }}>
                  🔥 STREAK ×{drainStreak}{drainStreak >= 2 ? " — 無双 soon" : ""}
                </div>
              )}
              {/* Penalty breakdown: how the machine is racking up your time */}
              {(penaltyBumper > 0 || penaltyTrigger > 0) && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 9, opacity: 0.6, marginBottom: 3, letterSpacing: "0.15em" }}>PENALTY</div>
                  <div style={{ fontSize: 10, lineHeight: 1.6 }}>
                    {penaltyBumper > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ opacity: 0.7 }}>番兵 bumpers ×{penaltyBumper}</span>
                        <span style={{ color: "#f87171" }}>+{formatGameScore(penaltyBumper * KAMIKAZE_BUMPER_PENALTY_MS, true)}</span>
                      </div>
                    )}
                    {penaltyTrigger > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ opacity: 0.7 }}>門 trigger groups ×{penaltyTrigger}</span>
                        <span style={{ color: "#f87171" }}>+{formatGameScore(penaltyTrigger * KAMIKAZE_TRIGGER_PENALTY_MS, true)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                <StabilityMeter value={stability} machineSaving={machineSaving} />
              </div>
              {/* Momentum tug-of-war: player (green) vs machine (red) */}
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 9, opacity: 0.6, marginBottom: 3, letterSpacing: "0.15em" }}>MOMENTUM</div>
                <div style={{ position: "relative", height: 8, borderRadius: 4, overflow: "hidden", background: "rgba(255,255,255,0.12)" }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${momentum * 100}%`,
                    background: "linear-gradient(90deg, #22c55e, #4ade80)",
                    transition: "width 500ms ease",
                    boxShadow: "0 0 8px rgba(34,197,94,0.6)",
                  }} />
                  <div style={{
                    position: "absolute", right: 0, top: 0, bottom: 0,
                    width: `${(1 - momentum) * 100}%`,
                    background: "linear-gradient(90deg, #f87171, #ef4444)",
                    transition: "width 500ms ease",
                    boxShadow: "0 0 8px rgba(239,68,68,0.6)",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, opacity: 0.5, marginTop: 2 }}>
                  <span style={{ color: "#4ade80" }}>YOU</span>
                  <span style={{ color: "#f87171" }}>MACHINE</span>
                </div>
              </div>
              {/* Banked munition: double-tap / D to deploy */}
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 9, opacity: 0.6, marginBottom: 3, letterSpacing: "0.15em" }}>MUNITION</div>
                {storedMunition ? (
                  <div style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: 6,
                    background: "rgba(34,197,94,0.18)", border: "1px solid rgba(34,197,94,0.6)",
                    color: "#4ade80", fontSize: 10, fontWeight: 700,
                  }}>
                    {storedMunition} · tap×2
                  </div>
                ) : (
                  <div style={{ fontSize: 10, opacity: 0.4 }}>— clear a target bank to earn one</div>
                )}
              </div>
              {/* Underworld charge meter */}
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 9, opacity: 0.6, marginBottom: 3, letterSpacing: "0.15em" }}>
                  UNDERWORLD {underworldCharge >= 1 ? "· READY" : ""}
                </div>
                <div style={{ position: "relative", height: 6, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,0.12)" }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${underworldCharge * 100}%`,
                    background: underworldCharge >= 1
                      ? "linear-gradient(90deg, #a855f7, #f0abfc)"
                      : "linear-gradient(90deg, #7c3aed, #a855f7)",
                    transition: "width 400ms ease",
                    boxShadow: underworldCharge >= 1 ? "0 0 8px rgba(168,85,247,0.8)" : "none",
                  }} />
                </div>
              </div>
              {/* Contextual hint: surfaces the most relevant verb right now
                  instead of a static cheat-sheet players tune out. */}
              {storedMunition ? (
                <div style={{ fontSize: 10, opacity: 0.95, marginTop: 6, lineHeight: 1.5, color: "#4ade80", fontWeight: 700 }}>
                  ⚡ {storedMunition} banked — double-tap to deploy!
                </div>
              ) : underworldCharge >= 1 ? (
                <div style={{ fontSize: 10, opacity: 0.95, marginTop: 6, lineHeight: 1.5, color: "#c084fc", fontWeight: 700 }}>
                  👆 UNDERWORLD READY — swipe up to tilt-lock!
                </div>
              ) : chargePower !== null && chargePower > 1.05 ? (
                <div style={{ fontSize: 10, opacity: 0.95, marginTop: 6, lineHeight: 1.5, color: "#4ade80", fontWeight: 700 }}>
                  Release to fire your nudge
                </div>
              ) : (
                <div style={{ fontSize: 9, opacity: 0.6, marginTop: 6, lineHeight: 1.5 }}>
                  {shotHud.active ? "tap a side to aim · RELEASE (or Space) to fire" : "HOLD charge · SWIPE↓ dive · SWIPE↑ tilt-lock · tap×2 deploy"}
                </div>
              )}
            </>
          ) : (
            <>
              <div>Score: {hud.score}</div>
              <div>Balls: {hud.balls}</div>
              <div>Multiplier: {hud.multiplier}x</div>
            </>
          )}
          {props.paused ? <div style={{ opacity: 0.85 }}>Paused</div> : null}
        </div>

        {/* Kamikaze power-up bar: player munitions (green) vs machine countermeasures (red) */}
        {kamikazeActive && activePowerUps.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              pointerEvents: "none",
              zIndex: 6,
            }}
          >
            {activePowerUps.map((p) => (
              <div
                key={`${p.side}-${p.name}`}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.6)",
                  border: `1px solid ${p.side === "player" ? "rgba(34,197,94,0.6)" : "rgba(255,68,68,0.6)"}`,
                  color: p.side === "player" ? "#22c55e" : "#ff4444",
                  fontSize: 12,
                  fontWeight: "bold",
                  minWidth: 140,
                }}
              >
                <div>{p.side === "player" ? "YOU" : "守"} · {p.name}</div>
                <div
                  style={{
                    marginTop: 4,
                    height: 3,
                    borderRadius: 2,
                    background: "rgba(255,255,255,0.15)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, (p.remainingMs / 5000) * 100)}%`,
                      background: p.side === "player" ? "#22c55e" : "#ff4444",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Kamikaze Ball message overlay (taunts, power-ups) */}
        {props.ghost && (
          <GhostRace
            replay={props.ghost.digest}
            leaderScore={props.ghost.score}
            leaderAddress={props.ghost.address}
          />
        )}
        {kamikazeMessage && (
          <div
            style={{
              position: "absolute",
              top: "40%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              padding: "12px 24px",
              borderRadius: 12,
              background: "rgba(0,0,0,0.75)",
              border: `1px solid ${MOOD_COLORS[machineMood]?.border ?? MOOD_COLORS.calm.border}`,
              color: MOOD_COLORS[machineMood]?.color ?? MOOD_COLORS.calm.color,
              fontSize: 18,
              fontWeight: "bold",
              textTransform: "uppercase",
              letterSpacing: 1,
              pointerEvents: "none",
              zIndex: 10,
              animation: "fadeIn 0.3s ease-out",
              transition: "color 0.4s ease, border-color 0.4s ease",
            }}
          >
            {kamikazeMessage}
          </div>
        )}
        {/* Charge ring: grows while holding to build a power nudge */}
        {kamikazeActive && !shotHud.active && chargePower !== null && chargePower > 1.05 && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 11,
              pointerEvents: "none",
              textAlign: "center",
            }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              margin: "0 auto",
              border: `3px solid ${chargePower >= 2.9 ? "#f0abfc" : "#22c55e"}`,
              boxShadow: `0 0 ${8 + chargePower * 6}px ${chargePower >= 2.9 ? "rgba(240,171,252,0.7)" : "rgba(34,197,94,0.6)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800,
              color: chargePower >= 2.9 ? "#f0abfc" : "#4ade80",
              transition: "box-shadow 120ms ease",
            }}>
              {chargePower.toFixed(1)}×
            </div>
            <div style={{ fontSize: 9, opacity: 0.7, marginTop: 4, letterSpacing: "0.15em" }}>CHARGE</div>
          </div>
        )}
        {/* Aim guide: while charging, a faint line from ball → pointer shows the
            nudge direction so the input feels deliberate, not random. */}
        <AimGuide aimPoint={aimPoint} charging={chargePower !== null && chargePower > 1.05 && !shotHud.active} containerRef={shakeRef} getBallClientPos={() => mountedRef.current?.getBallClientPosition() ?? null} />
        {/* Agency banner: dive / deploy feedback */}
        {agencyBanner && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "30%",
              left: "50%",
              transform: "translateX(-50%)",
              padding: "8px 20px",
              borderRadius: 10,
              background: "rgba(0,0,0,0.75)",
              border: "1px solid rgba(74,222,128,0.6)",
              color: "#4ade80",
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: "0.08em",
              pointerEvents: "none",
              zIndex: 11,
              animation: "momentumShiftIn 1.4s ease-out forwards",
            }}
          >
            {agencyBanner}
          </div>
        )}
        {/* Shot-calling duel surface: aim a lane, read MAMORU's guard, release
            on the sweet spot. Replaces continuous nudging. */}
        {shotHud.active && (
          <ShotCallHud
            variant={shotHud.variant}
            phase={shotHud.phase}
            lanes={shotHud.lanes}
            aimedLane={shotHud.aimedLane}
            guardLane={shotHud.guardLane}
            meter={shotHud.meter}
            sweetSpot={IMMERSION.shotCalling.meterSweetSpot}
            lastResult={shotHud.lastResult}
            canRelease={shotHud.canRelease}
            feintStage={shotHud.feintStage}
            onRelease={() => shotRelease()}
          />
        )}
      </div>
    </div>
  );
}

