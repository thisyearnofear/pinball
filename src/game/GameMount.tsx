import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { preloadAssets } from "@/services/asset-preloader";
import { mountGame, type MountedGame } from "@/domains/game/mount-game";
import { type GameDef, GameMessages, BALLS_PER_GAME } from "@/definitions/game";
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
import { TableCoach, CoachReplayChip } from "./ui/TableCoach";
import { RunHud } from "./ui/RunHud";
import { useIsSmallScreen } from "@/hooks/use-media-query";
import { KanjiWatermark } from "./ui/KanjiWatermark";
import { type WorldReaction } from "@/presentation/world-reactor";
import { isKamikazeMode, getLastTaunt, getTickCount, getTimeScale, consumeMomentumShift, getMachineMood, consumeKillCam, setKillCamEnabled, isShotCallMode, getShotVariant, getShotPhase, getShotAimedLane, getShotGuardLane, getShotMeterPosition, getShotLanes, getLastShotResult, getShotCanRelease, getShotFeintStage, shotRelease, type ShotResult, isStoryMode, isStoryFrozen, getStoryState, getStoryTargets, isStoryBallHeld, storyAction, launchStoryBall, setFlipperState } from "@/model/game";
import { RiveArtboard } from "@/game/ui/RiveArtboard";
import { ActorTypes } from "@/definitions/game";
import { createStoryState, type StoryState } from "@/model/story-run";
import type { StoryTarget } from "@/model/story-table";
import { chapterObjective } from "@/model/shrine-chapter";
import { CHAPTERS, type ChapterConfig } from "@/model/chapters";
import ShrineChapter from "./chapter/ShrineChapter";
import { createKamikazeState, POWERUP_NAMES, type AIDifficulty } from "@/model/kamikaze";
import type { PowerUpSide } from "@/definitions/game";
import { mulberry32 } from "@/utils/rng";
import { describeMood } from "@/utils/mood-display";
import { coachScript, currentCue, noObservations, type CoachCueId, type CoachObservations } from "@/config/table-coach";
import { nextRunSeed, lastSeedSource } from "@/services/quantum-seed";
import * as haptics from "@/utils/haptics";
import { startMachinePulse, stopMachinePulse } from "@/services/audio-service";
import { formatGameScore } from "@/utils/score-format";
import { startReplayRecording, finishReplayRecording, encodeReplay, type ReplayDigest } from "@/model/replay-recorder";
import { uploadReplay } from "@/services/backend-scores-client";
import { keccak256, toUtf8Bytes } from "ethers";

type GameMode = "classic" | "kamikaze";

/**
 * How often the run readout may sample the engine.
 *
 * The physics steps at 60fps, but the readout is text and bars: 20 samples a
 * second is faster than anyone can read a changing number, and it is a third of
 * the reconciliations of the mount tree the panel lives in. The shot-calling
 * timing meter is the deliberate exception — that one is a gameplay input, so
 * it keeps the full frame rate.
 */
const HUD_SAMPLE_MS = 50;

function createRunGame(opts: {
  id: string;
  table: number;
  paused: boolean;
  gameMode: GameMode;
  aiDifficulty?: AIDifficulty;
  worldId?: string;
  controlScheme?: "steer" | "feint" | "precision";
  story?: boolean;
}): GameDef {
  // Quantum when available, local CSPRNG otherwise — both recorded in the
  // replay, so the run stays reproducible either way.
  const rngSeed = nextRunSeed();
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
    seedSource: lastSeedSource(),
    rng: mulberry32(rngSeed),
    // Story runs keep the physical table but skip world-physics wobble: the
    // shrine encounter is a fixed learning loop, not a seeded marble drift.
    worldPhysics: opts.story ? undefined : getWorldById(opts.worldId ?? "")?.physics,
    controlScheme: opts.controlScheme,
    aiDifficulty: opts.aiDifficulty,
    // Resume durable story progress when the run is a fresh story start; a
    // retry calls createStoryState again through the reducer, honouring the
    // same saved progress so retry and lobby-continue never disagree.
    story: opts.story ? createStoryState() : undefined,
  };
}

function beginRunRecording(g: GameDef, gameMode: GameMode, aiDifficulty?: AIDifficulty, worldId?: string): void {
  startReplayRecording({
    seed: g.rngSeed!,
    table: g.table,
    mode: gameMode,
    world: worldId,
    controlScheme: g.controlScheme,
    seedSource: g.seedSource,
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

/**
 * Story mode target markers drawn over the live playfield: the water shrine
 * ripples cyan, the two fire-seal bumpers burn red until quenched, and the
 * torii beam fades once both seals are done. Positions follow the canvas
 * viewport (zoom + pan) via the same world→client mapping the aim guide uses.
 */
function StoryMarkers(props: {
  targets: StoryTarget[];
  seals: string[];
  gateOpen: boolean;
  armed: boolean;
  cfg: ChapterConfig;
  containerRef: React.RefObject<HTMLDivElement | null>;
  getClient: (x: number, y: number) => { x: number; y: number } | null;
  getBallClientPos: () => { x: number; y: number } | null;
}) {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    let raf = 0;
    const loop = () => { force((n) => (n + 1) % 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const container = props.containerRef.current;
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  const toLocal = (x: number, y: number) => {
    const p = props.getClient(x, y);
    return p ? { x: p.x - rect.left, y: p.y - rect.top } : null;
  };
  const px = (worldLen: number) => {
    const a = props.getClient(0, 0);
    const b = props.getClient(worldLen, 0);
    return a && b ? Math.abs(b.x - a.x) : worldLen;
  };

  const label = (text: string, sub?: string) => (
    <div style={{
      position: "absolute", left: "50%", bottom: "100%", transform: "translate(-50%, -4px)",
      padding: "2px 8px", borderRadius: 6, background: "rgba(0,0,0,0.7)",
      fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", whiteSpace: "nowrap",
      color: "#f5efe6",
    }}>{text}{sub ? <span style={{ opacity: 0.75, fontWeight: 600 }}> · {sub}</span> : null}</div>
  );

  const ball = props.getBallClientPos();
  const ballLocal = ball ? { x: ball.x - rect.left, y: ball.y - rect.top } : null;

  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6 }}>
      {props.targets.map((t) => {
        const m = props.cfg.markers;
        const tint = props.cfg.tintRgb;
        const p = toLocal(t.x, t.y);
        if (!p) return null;
        if (t.id === "shrine") {
          const r = Math.max(10, px(t.radius));
          return (
            <div key={t.id} style={{ position: "absolute", left: p.x - r, top: p.y - r, width: r * 2, height: r * 2 }}>
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                border: `2px solid rgb(${tint})`, boxShadow: `0 0 14px rgba(${tint},0.7), inset 0 0 18px rgba(${tint},0.35)`,
              }} />
              <div style={{
                position: "absolute", inset: -8, borderRadius: "50%",
                border: `1px solid rgba(${tint},0.45)`,
              }} />
              {label(m.shrineLabel)}
            </div>
          );
        }
        if (t.id === "west" || t.id === "east") {
          const done = props.seals.includes(t.id);
          const r = Math.max(10, px(t.radius) + 6);
          const color = done ? `rgb(${tint})` : "#e34234";
          return (
            <div key={t.id} style={{ position: "absolute", left: p.x - r, top: p.y - r, width: r * 2, height: r * 2 }}>
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                border: `3px solid ${color}`,
                boxShadow: `0 0 16px ${done ? `rgba(${tint},0.7)` : "rgba(227,66,52,0.7)"}`,
                opacity: done ? 0.9 : 1,
              }} />
              {label(`${done ? m.sealDoneGlyph : m.sealHotGlyph} ${m.sealWord} ${t.id === "west" ? "I" : "II"}`, done ? m.sealDoneWord : m.sealHotWord)}
            </div>
          );
        }
        // gate: horizontal beam across the passage
        const halfW = Math.max(12, px(t.radius));
        const h = Math.max(6, px(18));
        return (
          <div key={t.id} style={{ position: "absolute", left: p.x - halfW, top: p.y - h / 2, width: halfW * 2, height: h }}>
            <div style={{
              position: "absolute", inset: 0, borderRadius: 3,
              background: props.gateOpen ? `rgba(${tint},0.15)` : "rgba(227,66,52,0.5)",
              border: `2px solid ${props.gateOpen ? `rgb(${tint})` : "#e34234"}`,
              boxShadow: props.gateOpen ? "none" : "0 0 14px rgba(227,66,52,0.6)",
            }} />
            {label(props.gateOpen ? m.gateOpenLabel : m.gateSealedLabel, props.gateOpen ? m.gateOpenSub : m.gateSealedSub)}
          </div>
        );
      })}
      {props.armed && ballLocal && (
        <div style={{
          position: "absolute", left: ballLocal.x - 16, top: ballLocal.y - 16,
          width: 32, height: 32, borderRadius: "50%",
          border: `2.5px solid rgb(${props.cfg.tintRgb})`, boxShadow: `0 0 12px rgba(${props.cfg.tintRgb},0.8)`,
        }} />
      )}
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
  /** Story mode (Water Shrine): the same table runs the narrative encounter. */
  story?: boolean;
  /** Shared pause toggle owned by GameScreen (the pause menu lives there). */
  onTogglePause?: () => void;
  /** Story terminal panels reuse the parent's restart/quit flows. */
  onRestart?: () => void;
  onQuit?: () => void;
  /** First run: teach on the table itself instead of in an intro screen. */
  coach?: boolean;
  /** Opens the full control reference (How to Play) from the table's coach chip. */
  onOpenControls?: () => void;
  /** Tournament leader's replay for live ghost racing. */
  ghost?: { digest: ReplayDigest; score: number; address: string; replayHash?: string; metadata?: string } | null;
  onActiveChange?: (active: boolean) => void;
  onRunEnd?: (score: number, replayHash?: string, details?: { seedSource?: string; metaData?: string }) => void;
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
  // Timestamp of the last run-readout sample (see HUD_SAMPLE_MS).
  const hudSampleRef = useRef(0);
  // Phones: the table is ~360px wide there, so the readout moves out of the
  // playfield rather than floating in its corner (see RunHud).
  const hudCompact = useIsSmallScreen();
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
  // Rive mood index: calm 0, wary 1, smug 2, desperate 3, enraged 4, grieving 5.
  const moodIndex = useMemo(() => {
    const order = ["calm", "wary", "smug", "desperate", "enraged", "grieving"];
    return Math.max(0, order.indexOf(machineMood));
  }, [machineMood]);
  const [shotHud, setShotHud] = useState<{ variant: "feint" | "precision"; phase: string; aimedLane: number | null; guardLane: number | null; meter: number; lanes: number; lastResult: ShotResult | null; canRelease: boolean; feintStage: string; active: boolean }>(
    { variant: "feint", phase: "aiming", aimedLane: null, guardLane: null, meter: 0, lanes: 2, lastResult: null, canRelease: false, feintStage: "idle", active: false }
  );
  const [activePowerUps, setActivePowerUps] = useState<{ name: string; side: PowerUpSide; remainingMs: number }[]>([]);
  const [slowMoActive, setSlowMoActive] = useState(false);
  const [momentum, setMomentum] = useState(0.5);
  const [momentumShift, setMomentumShift] = useState<"player" | "machine" | null>(null);
  // Phase 2 player agency
  const [chargePower, setChargePower] = useState<number | null>(null);
  const chargePowerRef = useRef<number | null>(null);
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
  // Best-of-3: the fastest completed ball so far (the session headline).
  const [bestDrainMs, setBestDrainMs] = useState<number | null>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const rippleIdRef = useRef(0);
  // Victory FX: incrementing id keys the flash/shake/punch animations; confetti auto-clears.
  const [victoryFx, setVictoryFx] = useState(0);
  const [victoryConfetti, setVictoryConfetti] = useState(false);
  const [victoryTimeText, setVictoryTimeText] = useState<string | null>(null);
  const victoryClearRef = useRef(0);
  // Shake is applied imperatively: re-keying the wrapper would remount (and kill) the canvas.
  const shakeRef = useRef<HTMLDivElement | null>(null);

  // ── Story mode (Water Shrine) ────────────────────────────────
  const storyRun = Boolean(props.story) && props.gameMode === "classic";
  const [storyHud, setStoryHud] = useState<StoryState | null>(null);
  const [storyHeld, setStoryHeld] = useState(false);
  // Rive gauge readiness: while false (WASM loading / reduced motion / failure),
  // the DOM pips + button render as the fallback. While true, the gauge
  // artboard overlays them (same geometry, driven by the same state).
  const [riveGaugeReady, setRiveGaugeReady] = useState(false);
  const [storyTargets, setStoryTargets] = useState<StoryTarget[]>([]);
  const [trialEncounter, setTrialEncounter] = useState<number | null>(null);
  // A1: mood drives the taunt overlay colour and the named state in the HUD.
  // Memoised so the memoised RunHud can bail out when nothing else changed.
  const moodDisplay = useMemo(() => describeMood(machineMood), [machineMood]);
  // First-run coach: what the table has seen the player do, and which cues they
  // have already waved away. Both survive the best-of-3 balls, so the teaching
  // does not restart every ball.
  const [coachObs, setCoachObs] = useState<CoachObservations>(noObservations);
  /** Last damage kind seen on the story HUD, to edge-trigger burn/drain cues. */
  const lastDamageSeenRef = useRef<string | null>(null);
  /** Whether a charged save (power > 1.05 release) has landed in story mode. */
  const storySaveSeenRef = useRef(false);
  const [coachDismissed, setCoachDismissed] = useState<CoachCueId[]>([]);
  // Set once the player asks for the tips again. The first run teaches
  // unprompted; after that the coach only speaks when invited.
  const [coachArmed, setCoachArmed] = useState(false);
  // The coach copy adapts to the input device, so detect it the same way the
  // rest of the UI does (coarse pointer rather than viewport width).
  const coachTouchscreen = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches === true,
    [],
  );
  // Story mode plays under gameMode "classic", so the coach script is chosen
  // explicitly from the story flag rather than inferred from the mode.
  const coachCues = useMemo(
    () => coachScript(
      storyRun ? "story" : props.gameMode,
      coachTouchscreen,
      storyHud ? CHAPTERS[storyHud.chapterId] : undefined,
    ),
    [storyRun, props.gameMode, coachTouchscreen, storyHud?.chapterId],
  );
  const coachCue = useMemo(
    () => (props.coach || coachArmed ? currentCue(coachCues, coachObs, new Set<string>(coachDismissed)) : null),
    [props.coach, coachArmed, coachCues, coachObs, coachDismissed],
  );
  const dismissCoachCue = useCallback((id: CoachCueId) => {
    setCoachDismissed((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);
  // Replay on demand: wipe what the coach has already said and play the script
  // from the top, without leaving the table.
  const replayCoach = useCallback(() => {
    setCoachObs(noObservations());
    setCoachDismissed([]);
    setCoachArmed(true);
  }, []);
  const observeCoach = useCallback((patch: Partial<CoachObservations>) => {
    setCoachObs((prev) => {
      const next = { ...prev, ...patch };
      return (Object.keys(patch) as Array<keyof CoachObservations>).every((k) => prev[k] === next[k]) ? prev : next;
    });
  }, []);

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

  /**
   * Why the machine just saved the ball. An adversary that simply refuses to
   * lose reads as "unfair"; naming the mechanism (and its counter-play) turns
   * the same event into a legible rule the player can beat.
   */
  function describeSave(): string {
    const g = gameRef.current;
    const now = performance.now();
    const counter = g?.kamikaze?.activePowerUps.find((p) => p.side === "machine" && p.expiresAt > now);
    if (counter) return `countermeasure: ${POWERUP_NAMES[counter.type]}`;
    const saves = g?.kamikaze?.aiSavesUsed ?? 0;
    if (saves > 1) return `emergency save #${saves} — its grip is tiring`;
    return "emergency save — a drainward nudge beats the roll";
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
  /** Running total of the table's time tax, for edge-triggering the coach cue. */
  const taxSeenRef = useRef(0);

  const initialGame = useMemo<GameDef>(
    () => createRunGame({ id: storyRun ? "story-initial" : "practice", table: START_TABLE_INDEX, paused: false, gameMode: props.gameMode, aiDifficulty: props.aiDifficulty, worldId: props.worldId, controlScheme: props.controlScheme, story: storyRun }),
    [props.gameMode, props.aiDifficulty, storyRun],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!containerRef.current) return;

      // Shared loader: loads sprites + pathseg for SVG collision parsing.
      await preloadAssets();
      if (cancelled) return;

      // Check if we should render a Marble world. It loads in parallel with the
      // table so a heavy splat download never blocks the run (or Story mode).
      const shouldRenderWorld = isSplatSupported() && !prefersReducedMotion() && Boolean((getWorldById(props.worldId || '') || MARBLE_WORLDS.HOBBITON).spzUrl);

      if (shouldRenderWorld && worldContainerRef.current) {
        const worldKey = props.worldId || 'HOBBITON';
        const world = getWorldById(worldKey) || MARBLE_WORLDS.HOBBITON;

        mountWorld(worldContainerRef.current, world, {
          onProgress: (progress) => setWorldLoadingProgress(progress),
        }).then((handle) => {
          // Async resolve after unmount: dispose immediately rather than leak.
          if (cancelled) {
            handle.dispose();
            return;
          }
          worldHandleRef.current = handle;
          handle.setOnWorldReaction((reaction) => {
            applyWorldReaction(reaction);
          });
          handle.setBallTracking(true);
        }).catch((e) => {
          if (cancelled) return;
          console.warn('Failed to mount world, using fallback:', e);
          setWorldFallback(true);
        });
      } else {
        setWorldFallback(true);
      }

      const mounted = await mountGame({
        container: containerRef.current,
        game: initialGame,
        touchscreen: true,
        onTogglePause: props.onTogglePause,
        inputEnabled: () => {
          const g = gameRef.current;
          if (!g) return true;
          if (g.story) return g.story.phase === "playing" && !g.paused;
          return !g.paused;
        },
        onCharge: (power) => {
          setChargePower(power);
          // A released charge is a deliberate save — in story it proves the
          // drain coaching landed (the observation is monotonic, so firing this
          // every frame costs nothing).
          if (storyRun && power === null && chargePowerRef.current !== null && chargePowerRef.current > 1.05) {
            storySaveSeenRef.current = true;
          }
          chargePowerRef.current = power;
        },
        onDive: () => { observeCoach({ dived: true }); showAgencyBanner("突っ込む · DIVE!"); },
        onNudge: (power) => showAgencyBanner(power >= 2.9 ? "全力 · MAX NUDDGE!" : "突き · POWER NUDDGE!"),
        onDeploy: () => {
          const g = gameRef.current;
          const active = g?.kamikaze?.activePowerUps.find((p) => p.side === "player");
          showAgencyBanner(active ? `発動 · ${POWERUP_NAMES[active.type]}!` : "発動 · MUNITION DEPLOYED!");
        },
        onTiltLock: () => showAgencyBanner("封 · TILT-LOCK!"),
        onTiltLockCooldown: () => showAgencyBanner("…still charging"),
        onFirstAction: () => { observeCoach({ engaged: true }); props.onFirstAction?.(); },
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

            [GameMessages.POWERUP_ROULETTE]: "Munitions crate! Rolling…",
            [GameMessages.POWERUP_PLAYER]: "Munition activated!",
            [GameMessages.POWERUP_MACHINE]: "Countermeasure deployed!",
            [GameMessages.SAKURA_STORM]: "桜吹雪 · SAKURA STORM! The machine is blinded.",
            [GameMessages.KAMIS_WRATH]: "神の怒り · KAMI'S WRATH! The table hurls the ball.",
            [GameMessages.UNSTOPPABLE]: "無双 · UNSTOPPABLE!",
          };
          // Saves must explain themselves: name what caught the ball.
          if (msg === GameMessages.SAVED) {
            kamikazeMessages[GameMessages.SAVED] = `守 CATCHES IT — ${describeSave()}`;
          }
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

      // Async resolve after unmount: destroy the mounted game rather than leak
      // a second engine competing for the singleton table.
      if (cancelled) {
        mounted.destroy();
        return;
      }
      mountedRef.current = mounted;

      gameRef.current = initialGame;

      // A2: the kill cam plays in live + attract modes but is suppressed while
      // racing/viewing a ghost so the comparison timeline stays pure.
      setKillCamEnabled(!props.ghost);

      // The runKey effect can't record the first run (it bails while the mount
      // is still in flight), so start recording for the initial game here.
      // Story runs are never recorded: they are not ranked and never upload.
      if (!initialGame.story) {
        beginRunRecording(initialGame, props.gameMode, props.aiDifficulty, props.worldId);
      }
      runStartRef.current = performance.now();

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
      id: storyRun ? `story-${props.runKey}` : (props.mode === "tournament" && props.tournamentId ? String(props.tournamentId) : "practice"),
      table: props.tableIndex,
      paused: props.paused,
      gameMode: props.gameMode,
      aiDifficulty: props.aiDifficulty,
      worldId: props.worldId,
      controlScheme: props.controlScheme,
      story: storyRun,
    });

    if (!g.story) {
      beginRunRecording(g, props.gameMode, props.aiDifficulty, props.worldId);
    }
    setTrialEncounter(null);
    setStoryHud(null);
    runStartRef.current = performance.now();

    multiballRef.current = false;
    prevActiveRef.current = false;
    gameOverRef.current = false;
    taxSeenRef.current = 0;
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

      // Shot-calling HUD: poll the live duel state. The timing meter is a
      // gameplay input rather than a readout, so this one keeps the full rate.
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

      // The run readout is sampled at ~20Hz rather than 60 (see HUD_SAMPLE_MS).
      // Engine work that genuinely needs every frame — camera tracking, audio
      // reactivity, submit detection — stays outside this gate.
      const frameNow = performance.now();
      const sampleHud = frameNow - hudSampleRef.current >= HUD_SAMPLE_MS;
      if (sampleHud) {
        hudSampleRef.current = frameNow;
        // Bail-out compares: only re-render when values change.
        setHud((prev) =>
          prev.score === g.score && prev.balls === g.balls && prev.multiplier === g.multiplier
            ? prev
            : { score: g.score, balls: g.balls, multiplier: g.multiplier },
        );
        setKamikazeActive(isKamikazeMode());
        // A1: surface the machine's mood so the taunt overlay can color-shift.
        const mood = getMachineMood();
        setMachineMood((prev) => (prev === mood ? prev : mood));
        if (g.story) {
          const s = getStoryState();
          setStoryHud((prev) => (prev === s ? prev : s));
          setStoryHeld(isStoryBallHeld());
          setStoryTargets((prev) => (prev.length ? prev : getStoryTargets()));
          // Coach observations ride the same sample: derive what the player has
          // proven from the story state, edge-triggering damage causes so the
          // burn/drain cues fire on the tick they hurt, not forever after.
          if (s) {
            const dmgKind = s.lastDamage ?? null;
            const dmgChanged = dmgKind !== lastDamageSeenRef.current;
            lastDamageSeenRef.current = dmgKind;
            setCoachObs((prev) => {
              const next = {
                ...prev,
                captured: prev.captured || s.phase === "lesson",
                learned: prev.learned || s.learned,
                armed: prev.armed || s.armed,
                sealsQuenched: Math.max(prev.sealsQuenched, s.seals.length),
                gateOpen: prev.gateOpen || s.seals.length === 2,
                won: prev.won || s.phase === "won",
                burned: prev.burned || (dmgChanged && dmgKind === "burn"),
                drained: prev.drained || (dmgChanged && dmgKind === "drain"),
                saved: prev.saved || storySaveSeenRef.current,
              };
              return (Object.keys(next) as Array<keyof CoachObservations>).every((k) => prev[k] === next[k]) ? prev : next;
            });
          }
        }
      }

      // The presentation world freezes with the run: menu pause AND the story
      // encounter (any non-playing phase). Resources stay mounted; the last
      // rendered frame remains visible under the dialog.
      const worldPaused = props.paused || Boolean(g.story && g.story.phase !== "playing");
      worldHandleRef.current?.setPaused(worldPaused);

      // Slow-mo + momentum (Phase 1 immersion)
      if (sampleHud) {
        const ts = getTimeScale();
        setSlowMoActive((prev) => ((ts < 0.85) !== prev ? ts < 0.85 : prev));
      }
      if (sampleHud && g.kamikaze?.enabled) {
        setMomentum((prev) => (prev === g.kamikaze!.rubberBandBias ? prev : g.kamikaze!.rubberBandBias));
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
        // Coach: the first time the table taxes the player is the only moment
        // the tax is worth explaining. Edge-triggered on the running total so a
        // replayed coach waits for a *new* hit instead of firing immediately on
        // a tax the player already understood.
        const taxTotal = g.kamikaze.totalBumperHits + g.kamikaze.totalTriggerGroupCompletions;
        if (taxTotal > taxSeenRef.current) {
          taxSeenRef.current = taxTotal;
          observeCoach({ taxed: true });
        }
        const completedBalls = g.kamikaze.completedBallScores;
        setBestDrainMs((prev) => {
          const next = completedBalls.length ? Math.min(...completedBalls) : null;
          return prev === next ? prev : next;
        });
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
      if (sampleHud && g.kamikaze?.enabled) {
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
          if (sampleHud && g.kamikaze?.enabled) {
            const tableHeight = mountedRef.current.getTableHeight();
            if (tableHeight > 0) {
              const proximity = Math.max(0, Math.min(1, ballPos.y / tableHeight));
              setStability((prev) => (prev === proximity ? prev : proximity));
              // Check if machine is actively saving (force field or save power-up)
              const now = performance.now();
              const saving = g.kamikaze.activePowerUps.some(
                (p) => p.side === "machine" && p.expiresAt > now,
              );
              setMachineSaving((prev) => (prev === saving ? prev : saving));
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

      if (!g.story && wasActive && !isActive && g.score > 0) {
        const replay = finishReplayRecording(g.score, getTickCount());
        if (replay) props.onReplayAvailable?.(replay);
        const replayJson = replay ? encodeReplay(replay) : null;
        const replayHash = replayJson ? keccak256(toUtf8Bytes(replayJson)) : undefined;
        const duration = Math.min(
          3_600_000,
          Math.max(1, Math.round(performance.now() - runStartRef.current)),
        );

        // Built before the run-end notification so the replay viewer can verify
        // the replay's hash against the exact payload that gets submitted/signed.
        const metadata = JSON.stringify({
          table: g.table,
          multiplier: g.multiplier,
          multiball: multiballRef.current,
          mode: props.gameMode,
          duration,
          ...(replayHash ? { replayHash } : {}),
          ...(props.gameMode === "kamikaze" ? { aiDifficulty: props.aiDifficulty ?? "medium" } : {}),
        });

        props.onRunEnd?.(g.score, replayHash, {
          seedSource: g.seedSource,
          ...(props.mode === "tournament" ? { metaData: metadata } : {}),
        });

        if (props.mode !== "tournament") return;

        const tournamentId = props.tournamentId;
        const address = props.playerAddress;

        if (!tournamentId || !address || !props.walletPort) return;

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

  // An open trial unmounts as soon as the encounter phase ends for any reason —
  // abandoned, resolved, or superseded by a new run.
  useEffect(() => {
    if (trialEncounter !== null && storyHud?.phase !== "lesson") {
      setTrialEncounter(null);
    }
  }, [storyHud?.phase, trialEncounter]);

  const storyCfg = CHAPTERS[storyHud?.chapterId ?? "water-shrine"];
  // Story mode readout: objective + resources + the chapter's verbs, as a
  // strip above the playfield on all widths so it never occludes the ball's lane.
  const storyStrip = storyRun && storyHud ? (
    <div
      data-testid="story-hud"
      style={{
        marginBottom: 8,
        padding: "10px 14px",
        borderRadius: 10,
        background: "rgba(0,0,0,0.6)",
        border: `1px solid rgba(${storyCfg.tintRgb},0.35)`,
        color: "#f5efe6",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "baseline", justifyContent: "space-between" }}>
        <b style={{ fontSize: 13, letterSpacing: "0.06em" }}>{chapterObjective(storyHud)}</b>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>Integrity {"●".repeat(storyHud.integrity)}{"○".repeat(Math.max(0, 3 - storyHud.integrity))}</span>
          <span aria-label={`Mana ${storyHud.mana} of 3`} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ opacity: 0.8, marginRight: 4 }}>Mana</span>
            <span style={{ position: "relative", width: 84, height: 24, display: "inline-block" }}>
              <span
                aria-hidden
                style={{
                  position: "absolute", inset: 0,
                  display: "inline-flex", alignItems: "center", gap: 5,
                  visibility: riveGaugeReady ? "hidden" : undefined,
                }}
              >
                {Array.from({ length: 3 }, (_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 11, height: 11, borderRadius: "50%",
                      display: "inline-block",
                      border: `1px solid rgba(${storyCfg.tintRgb},0.8)`,
                      background: i < storyHud.mana ? `rgba(${storyCfg.tintRgb},0.9)` : "transparent",
                      boxShadow: i < storyHud.mana ? `0 0 6px rgba(${storyCfg.tintRgb},0.7)` : "none",
                      transition: "background 160ms ease, box-shadow 160ms ease",
                    }}
                  />
                ))}
              </span>
              {/* The artboard must mount from the start: onReady is what
                  flips riveGaugeReady, and mounting only when it is already
                  true deadlocks the gauge in fallback forever (caught by
                  tests/visual — docs/TRAPS.md #10). */}
              <span style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                <RiveArtboard
                  src="/rive/hud.riv"
                  artboard="hud_gauge"
                  data={{ mana: storyHud.mana, armed: storyHud.armed }}
                  style={{ width: "100%", height: "100%" }}
                  onReady={setRiveGaugeReady}
                />
              </span>
            </span>
          </span>
          <span>{storyHud.learned ? (storyHud.armed ? storyCfg.blessingWord.armed : storyCfg.blessingWord.learned) : storyCfg.blessingWord.none}</span>
          <span>{storyCfg.markers.sealPlural} {storyHud.seals.length}/2</span>
        </span>
      </div>
      <div aria-live="polite" style={{ opacity: 0.85, marginTop: 4 }}>{storyHud.notice}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          disabled={!storyHud.learned || storyHud.mana === 0 || storyHud.armed || storyHud.phase !== "playing"}
          onClick={() => storyAction({ type: "arm" })}
          style={{
            padding: "8px 14px", borderRadius: 8, border: `1px solid rgba(${storyCfg.tintRgb},0.5)`,
            background: storyHud.armed ? `rgba(${storyCfg.tintRgb},0.25)` : `rgba(${storyCfg.tintRgb},0.12)`,
            color: `rgb(${storyCfg.tintRgb})`, fontWeight: 700, fontSize: 12, cursor: "pointer", minHeight: 36,
          }}
        >
          {storyHud.armed ? storyCfg.blessingWord.armed : `Arm ${storyCfg.verb.name} (${storyCfg.verb.key})`}
        </button>
        <button
          type="button"
          disabled={!storyHeld || storyHud.phase !== "playing"}
          onClick={() => launchStoryBall()}
          style={{
            padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(212,160,23,0.5)",
            background: "rgba(212,160,23,0.15)", color: "#ffd98a",
            fontWeight: 700, fontSize: 12, cursor: "pointer", minHeight: 36,
          }}
        >
          Launch (Space)
        </button>
        <span style={{ fontSize: 11, opacity: 0.65 }}>
          Tap/hold to guide or launch · swipe up to arm Water · ← → flippers · Space launch + charge
        </span>
      </div>
    </div>
  ) : null;

  // One readout, two placements: over the playfield on desktop, above it on
  // phones (see RunHud — the desktop panel is ~200×300, which on a 358px-wide
  // table would cover the corner the ball actually plays in). Exactly one of
  // the two spots below renders it.
  const runHud = storyRun ? storyStrip : (
    <RunHud
      kamikazeActive={kamikazeActive}
      hud={hud}
      mood={moodDisplay}
      bestDrainMs={bestDrainMs}
      drainStreak={drainStreak}
      penaltyBumper={penaltyBumper}
      penaltyTrigger={penaltyTrigger}
      stability={stability}
      machineSaving={machineSaving}
      momentum={momentum}
      storedMunition={storedMunition}
      underworldCharge={underworldCharge}
      chargePower={chargePower}
      powerUps={activePowerUps}
      shotCalling={shotHud.active}
      coached={Boolean(props.coach)}
      paused={props.paused}
      variant={hudCompact ? "strip" : "overlay"}
    />
  );

  return (
    <div style={{ marginTop: 16 }}>
      {hudCompact && runHud}
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
        {/* Victory stinger: torii rises, petals fly. Pulse fires once per
            victory; the artboard mounts only while the celebration is up. */}
        {victoryConfetti && (
          <div
            aria-hidden
            style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: 320, height: 180, zIndex: 12, pointerEvents: "none",
            }}
          >
            <RiveArtboard
              src="/rive/hud.riv"
              artboard="victory_sting"
              pulse="fire"
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        )}
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
        {/* Fallback notice when 3D world unavailable. Sits above the "How to
            win" chip rather than under it so the two never overlap. */}
        {worldFallback && (
          <div
            style={{
              position: "absolute",
              bottom: 40,
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
        {storyRun && storyHud && (
          <StoryMarkers
            targets={storyTargets}
            seals={storyHud.seals}
            gateOpen={storyHud.seals.length === 2}
            armed={storyHud.armed}
            cfg={storyCfg}
            containerRef={shakeRef}
            getClient={(x, y) => mountedRef.current?.getPointClientPosition(x, y) ?? null}
            getBallClientPos={() => mountedRef.current?.getBallClientPosition() ?? null}
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
        {!hudCompact && runHud}

        {/* Kamikaze power-up bar: player munitions (green) vs machine
            countermeasures (red). Phones show these inline in the readout strip
            instead — the top-right column would land on top of it. */}
        {kamikazeActive && activePowerUps.length > 0 && !hudCompact && (
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
            replayHash={props.ghost.replayHash}
            metadata={props.ghost.metadata}
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
              border: `1px solid ${moodDisplay.border}`,
              color: moodDisplay.color,
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
        {/* The machine's face: a Rive sigil whose grin widens as the machine
            gains the upper hand (mood 0..5, artboard states). DOM taunt text
            above still carries the words; this carries the *attitude*. */}
        {kamikazeActive && (
          <div aria-hidden style={{ position: "absolute", top: 8, right: 8, width: 56, height: 56, zIndex: 9, pointerEvents: "none", opacity: 0.9 }}>
            <RiveArtboard
              src="/rive/hud.riv"
              artboard="mood_sigil"
              data={{ mood: moodIndex }}
              style={{ width: "100%", height: "100%" }}
              ariaLabel={`Machine mood: ${machineMood}`}
            />
          </div>
        )}
        {/* First-run coach: the teaching, on the table, while the ball is live. */}
        {coachCue && (
          <TableCoach
            cue={coachCue}
            onDismiss={dismissCoachCue}
            splash={coachCue.kanji ? (
              <span
                key={coachCue.id}
                style={{ display: "block", width: "100%", height: "100%" }}
              >
                <RiveArtboard
                  src="/rive/hud.riv"
                  artboard="coach_kanji"
                  pulse="reveal"
                  style={{ width: "100%", height: "100%" }}
                />
              </span>
            ) : undefined}
          />
        )}
        {/* …and the standing way to ask for it again (tap) or for the whole
            reference (hold). */}
        {!mountError && <CoachReplayChip onReplay={replayCoach} onOpenGuide={props.onOpenControls} />}
        {/* Charge ring: grows while holding to build a power nudge */}
        {(kamikazeActive || storyRun) && !shotHud.active && chargePower !== null && chargePower > 1.05 && (
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
        {/* ── Story encounter panels (shrine dialog / trial / results) ── */}
        {storyRun && storyHud && (
          <>
            {storyHud.phase === "lesson" && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Water shrine encounter"
                style={{
                  position: "absolute", inset: 0, zIndex: 20,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(5,8,16,0.72)", overflowY: "auto",
                }}
              >
                {trialEncounter !== null ? (
                  <div style={{ width: "min(720px, 96%)", maxHeight: "100%", overflowY: "auto", borderRadius: 12, border: `1px solid rgba(${storyCfg.tintRgb},0.4)`, background: "#0a0a0f" }}>
                    <ShrineChapter
                      embedded
                      paused={props.paused}
                      onResult={(outcome) => {
                        const encounterId = trialEncounter;
                        setTrialEncounter(null);
                        storyAction({ type: "trial-result", encounterId, outcome });
                      }}
                    />
                  </div>
                ) : (
                  <div style={{
                    width: "min(420px, 92%)", padding: "22px 24px", borderRadius: 14,
                    background: "rgba(10,10,15,0.96)", border: `1px solid rgba(${storyCfg.tintRgb},0.45)`,
                    color: "#f5efe6", textAlign: "center",
                  }}>
                    <p style={{ fontSize: 10, letterSpacing: "0.35em", textTransform: "uppercase", color: `rgba(${storyCfg.tintRgb},0.8)`, margin: "0 0 6px" }}>Shrine encounter</p>
                    <h3 style={{ margin: "0 0 10px", fontSize: 22 }}>{storyCfg.glyph} {storyCfg.overlay.shrineHeading}</h3>
                    <p style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
                      The main ball is safely held. {storyHud.learned
                        ? storyCfg.overlay.shrinePractice
                        : storyCfg.overlay.shrineOffer}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                      <button
                        type="button"
                        onClick={() => setTrialEncounter(storyHud.encounterId)}
                        style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: `rgba(${storyCfg.tintRgb},0.85)`, color: storyCfg.tintInk, fontWeight: 800, fontSize: 13, cursor: "pointer", minHeight: 44 }}
                      >
                        {storyHud.learned ? storyCfg.overlay.trialLearned : storyCfg.overlay.trialFresh}
                      </button>
                      {storyHud.learned && (
                        <button
                          type="button"
                          onClick={() => storyAction({ type: "refill", encounterId: storyHud.encounterId })}
                          style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid rgba(${storyCfg.tintRgb},0.5)`, background: `rgba(${storyCfg.tintRgb},0.12)`, color: storyCfg.tintText, fontWeight: 700, fontSize: 13, cursor: "pointer", minHeight: 44 }}
                        >
                          Refill mana & return
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => storyAction({ type: "trial-result", encounterId: storyHud.encounterId, outcome: "abandoned" })}
                        style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(245,239,230,0.25)", background: "transparent", color: "rgba(245,239,230,0.75)", fontSize: 12, cursor: "pointer", minHeight: 40 }}
                      >
                        Leave the shrine — no penalty
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {(storyHud.phase === "blessing" || storyHud.phase === "gate-opening") && (
              <div
                role="dialog"
                aria-modal="true"
                style={{
                  position: "absolute", inset: 0, zIndex: 20,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(5,8,16,0.72)",
                }}
              >
                <div style={{
                  width: "min(420px, 92%)", padding: "22px 24px", borderRadius: 14,
                  background: "rgba(10,10,15,0.96)", border: `1px solid rgba(${storyCfg.tintRgb},0.45)`,
                  color: "#f5efe6", textAlign: "center",
                }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 20 }}>
                    {storyHud.phase === "blessing" ? storyCfg.overlay.blessingTitle : storyCfg.overlay.gateTitle}
                  </h3>
                  <p style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>{storyHud.notice}</p>
                  <button
                    type="button"
                    onClick={() => storyAction({ type: "continue" })}
                    style={{ marginTop: 12, padding: "10px 18px", borderRadius: 8, border: "none", background: `rgba(${storyCfg.tintRgb},0.85)`, color: storyCfg.tintInk, fontWeight: 800, fontSize: 13, cursor: "pointer", minHeight: 44 }}
                  >
                    {storyHud.phase === "blessing" ? storyCfg.overlay.continueBlessing : storyCfg.overlay.continueGate}
                  </button>
                </div>
              </div>
            )}
            {(storyHud.phase === "won" || storyHud.phase === "lost") && (
              <div
                role="dialog"
                aria-modal="true"
                style={{
                  position: "absolute", inset: 0, zIndex: 20,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(5,8,16,0.78)",
                }}
              >
                <div style={{
                  width: "min(420px, 92%)", padding: "24px", borderRadius: 14,
                  background: "rgba(10,10,15,0.96)",
                  border: `1px solid ${storyHud.phase === "won" ? `rgba(${storyCfg.tintRgb},0.6)` : "rgba(227,66,52,0.6)"}`,
                  color: "#f5efe6", textAlign: "center",
                }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 22 }}>
                    {storyHud.phase === "won" ? storyCfg.overlay.winTitle : "The Story Falters"}
                  </h3>
                  <p style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>{storyHud.notice}</p>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => props.onRestart?.()}
                      style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: `rgba(${storyCfg.tintRgb},0.85)`, color: storyCfg.tintInk, fontWeight: 800, fontSize: 13, cursor: "pointer", minHeight: 44 }}
                    >
                      {storyHud.phase === "won" ? "Play Story again" : "Retry Story"}
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onQuit?.()}
                      style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(245,239,230,0.3)", background: "transparent", color: "#f5efe6", fontSize: 13, cursor: "pointer", minHeight: 44 }}
                    >
                      Back to lobby
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {storyRun && (
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 10 }}>
          {([ActorTypes.LEFT_FLIPPER, ActorTypes.RIGHT_FLIPPER] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-label={type === ActorTypes.LEFT_FLIPPER ? "Left flipper" : "Right flipper"}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setFlipperState(type, true); }}
              onPointerUp={() => setFlipperState(type, false)}
              onPointerCancel={() => setFlipperState(type, false)}
              onLostPointerCapture={() => setFlipperState(type, false)}
              onBlur={() => setFlipperState(type, false)}
              style={{
                minWidth: 120, minHeight: 44, borderRadius: 10,
                border: "1px solid rgba(245,239,230,0.3)", background: "rgba(0,0,0,0.55)",
                color: "#f5efe6", fontWeight: 800, fontSize: 14, cursor: "pointer",
                touchAction: "none",
              }}
            >
              {type === ActorTypes.LEFT_FLIPPER ? "◀ FLIPPER" : "FLIPPER ▶"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

