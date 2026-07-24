import React, { useCallback, useEffect, useMemo, useState } from "react";

import { getAppConfig } from "@/config/app-config";
import type { WalletPort } from "@/domains/wallet/wallet-port";
import { stopGame, setSubmissionStateCallback, type SubmissionStep as LegacySubmissionStep } from "@/services/high-scores-service";
import { getTournamentMeta, getAllTournaments } from "@/config/tournaments";
import { getFromStorage } from "@/utils/local-storage";
import { STORED_WORLD_ID } from "@/definitions/settings";
import { START_TABLE_INDEX } from "@/definitions/tables";

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
} from "@/game/ui";
import GameMount from "./GameMount";
import { SettingsModal } from "./ui/SettingsModal";
import { HowToPlayModal } from "./ui/HowToPlayModal";
import { AboutModal } from "./ui/AboutModal";
import { LeaderboardModal } from "./ui/LeaderboardModal";
import { TutorialOverlay, hasSeenTutorial, markTutorialSeen } from "./ui/TutorialOverlay";
import { ScoreSubmissionOverlay, type SubmissionStep } from "./ui/ScoreSubmissionOverlay";
import { CelebrationOverlay } from "./ui/CelebrationOverlay";
import { PauseMenu } from "./ui/PauseMenu";

type View = "lobby" | "game" | "paused";
type ActiveModal = "settings" | "how" | "about" | "leaderboard" | null;

export default function GameScreen() {
  const { address, isConnected } = useWalletState();
  const toast = useToast();
  const { recordRun } = usePlayerStats();
  const walletPort = useWalletPort();
  const { tournament, setTournament, isLoading: isLoadingTournament, refresh: refreshTournament, enterTournament: doEnterTournament } = useTournament(address, walletPort);

  const [mode, setMode] = useState<"practice" | "tournament">("practice");
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
  const [submission, setSubmission] = useState<{
    tournamentId: number; score: number; playerName: string; metaData: string; walletPort: WalletPort;
  } | null>(null);
  const [submissionStep, setSubmissionStep] = useState<SubmissionStep | null>(null);
  const [submissionError, setSubmissionError] = useState<string>("");
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem("pinball_onboarding_seen"); } catch { return true; }
  });

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

  const pausedEffective = view === "paused" || activeModal !== null || showTutorial || showCelebration || submissionStep !== null;

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
    recordRun({ score, mode, worldId: activeWorldId, tournamentId: tournament.tournamentId ?? undefined });
    setShowCelebration(true);
  }, [mode, activeWorldId, tournament.tournamentId, recordRun]);

  return (
    <ScreenFxProvider>
      <ScorePopupProvider>
        <div style={{ minHeight: "100vh", background: colors.background.primary }}>
          <AppHeader
            view={view}
            gameActive={gameActive}
            tournamentName={tournamentName}
            worldAccent={worldAccent}
            onOpenMenu={() => setView("paused")}
            onOpenModal={(m) => setActiveModal(m)}
          />

          <main style={{ padding: spacing.lg }}>
            {view === "lobby" && (
              <ArcadeLobby
                tournaments={getAllTournaments()}
                activeTournamentId={tournament.tournamentId}
                entered={tournament.entered}
                isConnected={isConnected}
                loading={isLoadingTournament}
                onSelectTournament={(id) => setTournament((prev) => ({ ...prev, tournamentId: id }))}
                onEnterTournament={(_id: number) => {
                  doEnterTournament()
                    .then(() => toast.addToast("Entered tournament!", "success"))
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

            {view === "paused" && (
              <PauseMenu
                score={lastScore}
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
                    tournamentId={tournament.tournamentId}
                    worldId={mode === "practice" ? selectedWorldId : tournament.worldId}
                    playerAddress={address ?? null}
                    walletPort={walletPort}
                    playerName={playerName}
                    tableIndex={tableIndex}
                    paused={pausedEffective}
                    onActiveChange={setGameActive}
                    onRunEnd={handleRunEnd}
                    onSubmissionStep={(step, err) => { setSubmissionStep(step); setSubmissionError(err ?? ""); }}
                    onSubmissionAvailable={setSubmission}
                    onSubmitted={() => refreshTournament()}
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
            <LeaderboardModal onClose={() => setActiveModal(null)} rows={tournament.leaderboard} playerAddress={address} loading={isLoadingTournament} />
          )}

          {showTutorial && <TutorialOverlay onClose={() => { markTutorialSeen(); setShowTutorial(false); }} />}

          {submissionStep && (
            <ScoreSubmissionOverlay
              score={submission?.score ?? lastScore}
              step={submissionStep}
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
              worldId={mode === "practice" ? selectedWorldId : tournament.worldId || undefined}
              tournamentName={tournamentName || undefined}
              onDismiss={() => setShowCelebration(false)}
              onPlayAgain={() => { setShowCelebration(false); if (mode === "practice") startPractice(); else startTournament(); }}
              onPlayTournament={() => { setShowCelebration(false); startTournament(); }}
              onViewLeaderboard={() => { setShowCelebration(false); setActiveModal("leaderboard"); }}
              onBackToLobby={() => { setShowCelebration(false); setView("lobby"); }}
            />
          )}

          <CelebrationParticles active={showCelebration} />

          {showOnboarding && (
            <OnboardingIntro
              onComplete={() => { try { localStorage.setItem("pinball_onboarding_seen", "true"); } catch {} setShowOnboarding(false); }}
              onSkip={() => { try { localStorage.setItem("pinball_onboarding_seen", "true"); } catch {} setShowOnboarding(false); }}
            />
          )}
        </div>
      </ScorePopupProvider>
    </ScreenFxProvider>
  );
}
