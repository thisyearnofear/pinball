import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAppConfig } from "@/config/app-config";
import type { WalletPort } from "@/domains/wallet/wallet-port";
import { stopGame, setSubmissionStateCallback, type SubmissionStep as LegacySubmissionStep } from "@/services/high-scores-service";
import { getTournamentMeta, getAllTournaments, type GameMode } from "@/config/tournaments";
import { getFromStorage } from "@/utils/local-storage";
import { STORED_WORLD_ID } from "@/definitions/settings";
import { START_TABLE_INDEX } from "@/definitions/tables";
import type { AIDifficulty } from "@/model/kamikaze";

import { colors, spacing } from "@/theme/tokens";
import { useWorldTheme, getWorldAccent } from "@/hooks/use-world-theme";
import { usePlayerStats } from "@/hooks/use-player-stats";
import { useWalletPort } from "@/hooks/use-wallet-port";
import { useWalletState } from "@/hooks/use-wallet-state";
import { useTournament } from "@/hooks/use-tournament";
import {
  useToast, ErrorBoundary,
  ScorePopupProvider, ScreenFxProvider,
  CelebrationParticles,
  OnboardingIntro,
  CRTOverlay, ArcadeLobby, AppHeader,
  AmbientBackground, ActivityFeedProvider, useActivityFeed,
} from "@/game/ui";
import { burstAt } from "@/utils/burst-fx";
import { ActivityFeedPanel } from "./ui/ActivityFeed";
import GameMount from "./GameMount";
import { SettingsModal } from "./ui/SettingsModal";
import { HowToPlayModal } from "./ui/HowToPlayModal";
import { AboutModal } from "./ui/AboutModal";
import { LeaderboardModal } from "./ui/LeaderboardModal";
import { TutorialOverlay, hasSeenTutorial, markTutorialSeen } from "./ui/TutorialOverlay";
import { ScoreSubmissionOverlay, type SubmissionStep } from "./ui/ScoreSubmissionOverlay";
import { CelebrationOverlay } from "./ui/CelebrationOverlay";
import { ReplayViewer } from "./ui/ReplayViewer";
import { PauseMenu } from "./ui/PauseMenu";
import { InstallPrompt } from "./ui/InstallPrompt";
import type { ReplayDigest } from "@/model/replay-recorder";
import { decodeReplay } from "@/model/replay-recorder";
import { fetchBestReplay } from "@/services/backend-scores-client";

type View = "lobby" | "game" | "paused";
type ActiveModal = "settings" | "how" | "about" | "leaderboard" | null;

// Raw localStorage key (predates the ps_data blob; migrating would reset user state)
const ONBOARDING_SEEN_KEY = "pinball_onboarding_seen";

function markOnboardingSeen(): void {
  try { localStorage.setItem(ONBOARDING_SEEN_KEY, "true"); } catch {}
}

export default function GameScreen() {
  return (
    <ActivityFeedProvider>
      <GameScreenInner />
    </ActivityFeedProvider>
  );
}

function GameScreenInner() {
  const { address, isConnected } = useWalletState();
  const toast = useToast();
  const activityFeed = useActivityFeed();
  const { stats, recordRun } = usePlayerStats();
  const walletPort = useWalletPort();
  const { tournament, setTournament, isLoading: isLoadingTournament, refresh: refreshTournament, enterTournament: doEnterTournament } = useTournament(address, walletPort);

  const [mode, setMode] = useState<"practice" | "tournament">("practice");
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    try { return (localStorage.getItem("pinball_game_mode") as GameMode) || "kamikaze"; } catch { return "kamikaze"; }
  });
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(() => {
    try { return (localStorage.getItem("pinball_kamikaze_difficulty") as AIDifficulty) || "medium"; } catch { return "medium"; }
  });
  const [runKey, setRunKey] = useState(0);
  const [selectedWorldId, setSelectedWorldId] = useState<string>(() => getFromStorage(STORED_WORLD_ID) || "hobbiton");
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [view, setView] = useState<View>("lobby");
  const [gameActive, setGameActive] = useState(false);
  const [tableIndex] = useState<number>(START_TABLE_INDEX);
  const [playerName] = useState<string>(() => {
    try { return localStorage.getItem("pinball_player_name") ?? ""; } catch { return ""; }
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastScore, setLastScore] = useState<number>(0);
  const [lastReplay, setLastReplay] = useState<ReplayDigest | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [ghost, setGhost] = useState<{ digest: ReplayDigest; score: number; address: string } | null>(null);
  const [submission, setSubmission] = useState<{
    tournamentId: number; score: number; playerName: string; metaData: string; walletPort: WalletPort;
  } | null>(null);
  const [submissionStep, setSubmissionStep] = useState<SubmissionStep | null>(null);
  const [submissionError, setSubmissionError] = useState<string>("");
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem(ONBOARDING_SEEN_KEY); } catch { return true; }
  });

  // Judge demo mode (?demo=1): skip onboarding/tutorial and launch a guided
  // kamikaze practice run with narrated step toasts.
  const isDemo = useMemo(() => {
    if (typeof window === "undefined") return false;
    try { return new URLSearchParams(window.location.search).get("demo") === "1"; } catch { return false; }
  }, []);
  const demoStartedRef = useRef(false);

  useEffect(() => {
    if (!isDemo || demoStartedRef.current) return;
    demoStartedRef.current = true;
    markOnboardingSeen();
    setShowOnboarding(false);
    markTutorialSeen();
    selectGameMode("kamikaze");
    const t = window.setTimeout(() => {
      setMode("practice");
      setShowCelebration(false);
      setRunKey((k) => k + 1);
      setView("game");
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo]);

  useEffect(() => {
    if (!isDemo || view !== "game") return;
    const script: Array<[number, string]> = [
      [1_500, "KAMIKAZE MODE — you want to DRAIN the ball; the machine fights to save it"],
      [7_000, "Tap anywhere on the table to nudge the ball toward the drain"],
      [14_000, "Grab munition crates for power-ups — the machine rolls its own countermeasures"],
      [22_000, "Every run is recorded: replays are verified server-side before a score can be signed"],
      [30_000, "Drain fast, beat the ghost of the tournament leader, win MATIC on Polygon"],
    ];
    const timers = script.map(([ms, text]) => window.setTimeout(() => toast.addToast(text, "info"), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, view, runKey]);

  const activeWorldId = useMemo(() => {
    if (mode === "tournament" && tournament.worldId) return tournament.worldId;
    return selectedWorldId;
  }, [mode, tournament.worldId, selectedWorldId]);

  useWorldTheme(activeWorldId);
  const worldAccent = getWorldAccent(activeWorldId);

  const canStartTournamentRun = useMemo(() => {
    if (!isConnected) return false;
    if (!tournament.tournamentId) return false;
    return tournament.entered;
  }, [isConnected, tournament.tournamentId, tournament.entered]);

  function selectGameMode(next: GameMode) {
    setGameMode(next);
    try { localStorage.setItem("pinball_game_mode", next); } catch {}
  }

  function selectDifficulty(next: AIDifficulty) {
    setAiDifficulty(next);
    try { localStorage.setItem("pinball_kamikaze_difficulty", next); } catch {}
  }

  function startPractice() {
    setMode("practice");
    setShowCelebration(false);
    if (!hasSeenTutorial()) setShowTutorial(true);
    setRunKey((k) => k + 1);
    setView("game");
  }

  function startTournament() {
    setMode("tournament");
    if (!canStartTournamentRun) {
      toast.addToast(isConnected ? "Enter the active tournament first." : "Connect your wallet first.", "warning");
      return;
    }
    setShowCelebration(false);
    if (!hasSeenTutorial()) setShowTutorial(true);
    setRunKey((k) => k + 1);
    setView("game");
  }

  const tournamentName = useMemo(() => {
    if (mode === "tournament" && tournament.tournamentId) {
      return getTournamentMeta(tournament.tournamentId)?.name || `Tournament #${tournament.tournamentId}`;
    }
    return null;
  }, [mode, tournament.tournamentId]);

  // Tournament runs play in the tournament's mode; practice uses the player's choice.
  const effectiveGameMode = useMemo<GameMode>(() => {
    if (mode === "tournament" && tournament.tournamentId) {
      return getTournamentMeta(tournament.tournamentId)?.mode ?? "classic";
    }
    return gameMode;
  }, [mode, tournament.tournamentId, gameMode]);

  const pausedEffective = view === "paused" || activeModal !== null || showTutorial || showCelebration || showReplay || submissionStep !== null;

  // Ghost racing: fetch the tournament leader's replay for each run. Skip when
  // the leader's replay is for a different mode or the leader is the player.
  useEffect(() => {
    if (view !== "game" || !tournament.tournamentId) return;
    let cancelled = false;
    setGhost(null);
    fetchBestReplay(tournament.tournamentId)
      .then((best) => {
        if (cancelled || !best) return;
        if (address && best.address.toLowerCase() === address.toLowerCase()) return;
        try {
          const digest = decodeReplay(best.replay);
          if (digest.v !== 1 || digest.mode !== effectiveGameMode || !digest.trace?.length) return;
          setGhost({ digest, score: best.score, address: best.address });
        } catch {
          // corrupt replay payload: no ghost
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [view, runKey, tournament.tournamentId, effectiveGameMode, address]);

  useEffect(() => {
    const cb = (step: LegacySubmissionStep, errorMessage?: string) => {
      if (step === "error") {
        setSubmissionError(errorMessage ?? "Score submission failed.");
        setSubmissionStep("error");
        return;
      }
      setSubmissionError("");
      setSubmissionStep(step as unknown as SubmissionStep);
    };
    setSubmissionStateCallback(cb);
    return () => setSubmissionStateCallback(null);
  }, []);

  const handleRunEnd = useCallback((score: number) => {
    setLastScore(score);
    recordRun({ score, mode, gameMode: effectiveGameMode, worldId: activeWorldId, tournamentId: tournament.tournamentId ?? undefined });
    setShowCelebration(true);
    activityFeed.log(
      effectiveGameMode === "kamikaze" ? "drain" : "score",
      effectiveGameMode === "kamikaze"
        ? `Ball drained in ${(score / 1000).toFixed(1)}s`
        : `Score submitted: ${score.toLocaleString()} pts`,
    );
  }, [mode, effectiveGameMode, activeWorldId, tournament.tournamentId, recordRun, activityFeed]);

  return (
    <ScreenFxProvider>
      <ScorePopupProvider>
        <div style={{ minHeight: "100vh", background: colors.background.primary, position: "relative" }}>
          <AmbientBackground />
          <div style={{ position: "relative", zIndex: 1 }}>
          <AppHeader
            view={view}
            gameActive={gameActive}
            tournamentName={tournamentName}
            worldAccent={worldAccent}
            onOpenMenu={() => setView("paused")}
            onOpenModal={(m) => setActiveModal(m)}
          />

          <main style={{ padding: spacing.lg }}>
            {view === "lobby" && <InstallPrompt />}
            {view === "lobby" && (
              <ArcadeLobby
                tournaments={getAllTournaments()}
                activeTournamentId={tournament.tournamentId}
                entered={tournament.entered}
                isConnected={isConnected}
                loading={isLoadingTournament}
                gameMode={gameMode}
                aiDifficulty={aiDifficulty}
                playerAddress={address ?? null}
                playerStats={stats}
                onSelectGameMode={selectGameMode}
                onSelectDifficulty={selectDifficulty}
                onSelectTournament={(id) => setTournament((prev) => ({ ...prev, tournamentId: id }))}
                onEnterTournament={(_id: number) => {
                  doEnterTournament()
                    .then(() => {
                      toast.addToast("Entered tournament!", "success");
                      activityFeed.log("entry", `Player entered tournament #${_id}`);
                    })
                    .catch((e: any) => toast.addToast(e?.message ?? "Failed to enter tournament.", "error"));
                }}
                onStartTournament={(id) => {
                  setTournament((prev) => ({ ...prev, tournamentId: id }));
                  setMode("tournament");
                  setShowCelebration(false);
                  if (!hasSeenTutorial()) setShowTutorial(true);
                  setRunKey((k) => k + 1);
                  setView("game");
                }}
                onPractice={startPractice}
              />
            )}
            {view === "lobby" && (
              <div style={{ maxWidth: 900, margin: "0 auto", padding: `0 ${spacing.lg}px` }}>
                <ActivityFeedPanel />
              </div>
            )}

            {view === "paused" && (
              <PauseMenu
                score={lastScore}
                kamikaze={effectiveGameMode === "kamikaze"}
                onResume={() => setView("game")}
                onRestart={() => { setRunKey((k) => k + 1); setView("game"); }}
                onSettings={() => setActiveModal("settings")}
                onQuitToLobby={() => setView("lobby")}
              />
            )}

            {view === "game" && (
              <ErrorBoundary>
                <CRTOverlay intensity={0.25}>
                  <GameMount
                    runKey={runKey}
                    mode={mode}
                    gameMode={effectiveGameMode}
                    aiDifficulty={aiDifficulty}
                    tournamentId={tournament.tournamentId}
                    worldId={mode === "practice" ? selectedWorldId : tournament.worldId}
                    playerAddress={address ?? null}
                    walletPort={walletPort}
                    playerName={playerName}
                    tableIndex={tableIndex}
                    paused={pausedEffective}
                    ghost={ghost}
                    onActiveChange={setGameActive}
                    onRunEnd={handleRunEnd}
                    onReplayAvailable={setLastReplay}
                    onSubmissionStep={(step, err) => { setSubmissionStep(step); setSubmissionError(err ?? ""); }}
                    onSubmissionAvailable={setSubmission}
                    onSubmitted={() => {
                      refreshTournament();
                      activityFeed.log("score", "Score verified and submitted onchain");
                    }}
                    onStatus={() => {}}
                    onError={(e) => toast.addToast(e, "error")}
                  />
                </CRTOverlay>
              </ErrorBoundary>
            )}
          </main>

          {activeModal === "settings" && <SettingsModal onClose={() => setActiveModal(null)} />}
          {activeModal === "how" && <HowToPlayModal onClose={() => setActiveModal(null)} />}
          {activeModal === "about" && <AboutModal onClose={() => setActiveModal(null)} />}
          {activeModal === "leaderboard" && (
            <LeaderboardModal onClose={() => setActiveModal(null)} rows={tournament.leaderboard} playerAddress={address} loading={isLoadingTournament} inverted={tournament.invertedWinCondition} />
          )}

          {showTutorial && <TutorialOverlay gameMode={effectiveGameMode} onClose={() => { markTutorialSeen(); setShowTutorial(false); }} />}

          {submissionStep && (
            <ScoreSubmissionOverlay
              score={submission?.score ?? lastScore}
              step={submissionStep}
              kamikaze={effectiveGameMode === "kamikaze"}
              errorMessage={submissionError}
              onClose={() => { setSubmissionStep(null); setSubmissionError(""); }}
              onRetry={submission && submissionStep === "error" ? async () => {
                try {
                  await stopGame(String(submission.tournamentId), submission.score, submission.playerName, submission.metaData, submission.walletPort);
                  setSubmissionStep(null);
                  setSubmissionError("");
                  toast.addToast("Score submitted!", "success");
                  refreshTournament();
                } catch (e: any) {
                  setSubmissionError(String(e?.message ?? "Retry failed."));
                  setSubmissionStep("error");
                }
              } : undefined}
            />
          )}

          {showCelebration && (
            <CelebrationOverlay
              score={lastScore}
              isPractice={mode === "practice"}
              kamikaze={effectiveGameMode === "kamikaze"}
              aiDifficulty={effectiveGameMode === "kamikaze" ? aiDifficulty : undefined}
              worldId={mode === "practice" ? selectedWorldId : tournament.worldId || undefined}
              tournamentName={tournamentName || undefined}
              onDismiss={() => setShowCelebration(false)}
              onPlayAgain={() => { setShowCelebration(false); if (mode === "practice") startPractice(); else startTournament(); }}
              onPlayTournament={() => { setShowCelebration(false); startTournament(); }}
              onViewLeaderboard={() => { setShowCelebration(false); setActiveModal("leaderboard"); }}
              onWatchReplay={lastReplay ? () => setShowReplay(true) : undefined}
              onBackToLobby={() => { setShowCelebration(false); setView("lobby"); }}
            />
          )}

          {showReplay && lastReplay && (
            <ReplayViewer replay={lastReplay} onClose={() => setShowReplay(false)} />
          )}

          <CelebrationParticles active={showCelebration} />

          {showOnboarding && (
            <OnboardingIntro
              onComplete={() => { markOnboardingSeen(); setShowOnboarding(false); }}
              onSkip={() => { markOnboardingSeen(); setShowOnboarding(false); }}
            />
          )}
          </div>
        </div>
      </ScorePopupProvider>
    </ScreenFxProvider>
  );
}
