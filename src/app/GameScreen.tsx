import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

import type { WalletPort } from "@/domains/wallet/wallet-port";
import { Eip1193WalletPort } from "@/domains/wallet/eip1193-wallet-port";
import { stopGame, setSubmissionStateCallback, type SubmissionStep as LegacySubmissionStep } from "@/services/high-scores-service";
import {
  enterTournament,
  fetchLeaderboard,
  getActiveTournamentId,
  getEntryFee,
  getPlayerInfo,
  getTournamentInfo,
  getWinners,
} from "@/services/contracts/tournament-client";
import { getTournamentMeta, getAllTournaments } from "@/config/tournaments";
import { getFromStorage } from "@/utils/local-storage";
import { STORED_WORLD_ID } from "@/definitions/settings";
import Tables, { START_TABLE_INDEX } from "@/definitions/tables";

import { colors, spacing, typography, radius } from "@/theme/tokens";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useIsSmallScreen } from "@/hooks/use-media-query";
import { useWorldTheme, getWorldAccent } from "@/hooks/use-world-theme";
import { usePlayerStats } from "@/hooks/use-player-stats";
import {
  Button, Modal, useToast, ErrorBoundary,
  ScorePopupProvider, ScreenFxProvider,
  CelebrationParticles, PlayerCard,
  OnboardingIntro, ActivityTicker,
  CRTOverlay, ArcadeLobby, PinballHUD,
} from "@/app/ui";
import GameMount from "./GameMount";
import { SettingsModal } from "./ui/SettingsModal";
import { HowToPlayModal } from "./ui/HowToPlayModal";
import { AboutModal } from "./ui/AboutModal";
import { LeaderboardModal } from "./ui/LeaderboardModal";
import { TutorialOverlay, hasSeenTutorial, markTutorialSeen } from "./ui/TutorialOverlay";
import { ScoreSubmissionOverlay, type SubmissionStep } from "./ui/ScoreSubmissionOverlay";
import { CelebrationOverlay } from "./ui/CelebrationOverlay";
import { PauseMenu } from "./ui/PauseMenu";

type View = 'lobby' | 'game' | 'paused';
type ActiveModal = 'settings' | 'how' | 'about' | 'leaderboard' | null;

type TournamentState = {
  tournamentId: number | null;
  entryFeeWei: bigint;
  totalPotWei: bigint;
  startTime: number | null;
  endTime: number | null;
  topN: number | null;
  finalized: boolean;
  winners: string[];
  entered: boolean;
  leaderboard: { address: string; score: number }[];
  worldId: string | null;
};

export default function GameScreen() {
  const { address, isConnected, connector } = useAccount();
  const toast = useToast();
  const isSmall = useIsSmallScreen();
  const { stats, recordRun } = usePlayerStats();

  const [mode, setMode] = useState<"practice" | "tournament">("practice");
  const [runKey, setRunKey] = useState(0);
  const [selectedWorldId, setSelectedWorldId] = useState<string>(() => getFromStorage(STORED_WORLD_ID) || "hobbiton");
  const [walletPort, setWalletPort] = useState<WalletPort | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [view, setView] = useState<View>('lobby');
  const [gameActive, setGameActive] = useState(false);
  const [tableIndex, setTableIndex] = useState<number>(START_TABLE_INDEX);
  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return localStorage.getItem("pinball_player_name") ?? "";
    } catch {
      return "";
    }
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastScore, setLastScore] = useState<number>(0);
  const [submission, setSubmission] = useState<{
    tournamentId: number;
    score: number;
    playerName: string;
    metaData: string;
    walletPort: WalletPort;
  } | null>(null);
  const [submissionStep, setSubmissionStep] = useState<SubmissionStep | null>(null);
  const [submissionError, setSubmissionError] = useState<string>("");
  const [isLoadingTournament, setIsLoadingTournament] = useState(true);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return !localStorage.getItem("pinball_onboarding_seen");
    } catch {
      return true;
    }
  });

  const [tournament, setTournament] = useState<TournamentState>({
    tournamentId: null,
    entryFeeWei: 0n,
    totalPotWei: 0n,
    startTime: null,
    endTime: null,
    topN: null,
    finalized: false,
    winners: [],
    entered: false,
    leaderboard: [],
    worldId: null,
  });

  const activeWorldId = useMemo(() => {
    if (mode === "tournament" && tournament.worldId) return tournament.worldId;
    return selectedWorldId;
  }, [mode, tournament.worldId, selectedWorldId]);

  useWorldTheme(activeWorldId);
  const worldAccent = getWorldAccent(activeWorldId);

  useEffect(() => {
    let cancelled = false;

    async function syncWalletPort() {
      if (!isConnected || !connector || !address) return;

      const provider = (await connector.getProvider()) as any;
      if (!provider || typeof provider.request !== "function") return;

      const port = new Eip1193WalletPort(provider);
      await port.getAddress();
      if (cancelled) return;
      setWalletPort(port);
    }

    syncWalletPort().catch((e) => {
      console.error("Failed to initialize wallet port:", e);
      setWalletPort(null);
    });

    return () => {
      cancelled = true;
    };
  }, [isConnected, connector, address]);

  const refreshTournament = useCallback(async () => {
    try {
      setIsLoadingTournament(true);
      const tournamentId = await getActiveTournamentId();
      const [fee, info, winners] = await Promise.all([
        getEntryFee(),
        getTournamentInfo(tournamentId),
        getWinners(tournamentId),
      ]);

      const leaderboard = await fetchLeaderboard(tournamentId, 0, 50);

      let entered = false;
      if (address) {
        try {
          const p = await getPlayerInfo(tournamentId, address);
          entered = p.entered;
        } catch {
          const addr = address.toLowerCase();
          entered =
            leaderboard.some((r) => r.address.toLowerCase() === addr) ||
            winners.map((w) => w.toLowerCase()).includes(addr);
        }
      }

      const meta = tournamentId ? getTournamentMeta(tournamentId) : null;

      setTournament({
        tournamentId,
        entryFeeWei: fee,
        totalPotWei: info.totalPot,
        startTime: info.startTime,
        endTime: info.endTime,
        topN: info.topN,
        finalized: info.finalized,
        winners,
        entered,
        leaderboard,
        worldId: meta?.worldId ?? null,
      });
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsLoadingTournament(false);
    }
  }, [address]);

  useEffect(() => {
    refreshTournament().catch(() => {});
  }, [refreshTournament]);

  const canStartTournamentRun = useMemo(() => {
    if (!isConnected) return false;
    if (!tournament.tournamentId) return false;
    return tournament.entered;
  }, [isConnected, tournament.tournamentId, tournament.entered]);

  async function onEnterTournament() {
    if (!tournament.tournamentId || !walletPort) return;
    try {
      await enterTournament(tournament.tournamentId, walletPort);
      toast.addToast('Entered tournament!', 'success');
      await refreshTournament();
    } catch (e: any) {
      console.error(e);
      toast.addToast(e?.message ?? "Failed to enter tournament.", 'error');
    }
  }

  function startPractice() {
    setMode("practice");
    setShowCelebration(false);
    setShowMobileMenu(false);
    if (!hasSeenTutorial()) setShowTutorial(true);
    setRunKey((k) => k + 1);
    setView('game');
  }

  function startTournament() {
    setMode("tournament");
    if (!canStartTournamentRun) {
      toast.addToast(isConnected ? "Enter the active tournament first." : "Connect your wallet first.", 'warning');
      return;
    }
    setShowCelebration(false);
    setShowMobileMenu(false);
    if (!hasSeenTutorial()) setShowTutorial(true);
    setRunKey((k) => k + 1);
    setView('game');
  }

  function openMenu() {
    setView('paused');
  }

  function resumeGame() {
    setView('game');
  }

  function quitToLobby() {
    setView('lobby');
    setShowMobileMenu(false);
  }

  const tournamentName = useMemo(() => {
    if (mode === 'tournament' && tournament.tournamentId) {
      return getTournamentMeta(tournament.tournamentId)?.name || `Tournament #${tournament.tournamentId}`;
    }
    return null;
  }, [mode, tournament.tournamentId]);

  const pausedEffective = view === 'paused' || activeModal !== null || showTutorial || showCelebration || submissionStep !== null;

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
    recordRun({
      score,
      mode,
      worldId: activeWorldId,
      tournamentId: tournament.tournamentId ?? undefined,
    });
    setShowCelebration(true);
  }, [mode, activeWorldId, tournament.tournamentId, recordRun]);

  const mobileMenuItems = useMemo(() => [
    { label: 'Leaderboard', action: () => { setActiveModal('leaderboard'); setShowMobileMenu(false); } },
    { label: 'Settings', action: () => { setActiveModal('settings'); setShowMobileMenu(false); } },
    { label: 'How to play', action: () => { setActiveModal('how'); setShowMobileMenu(false); } },
    { label: 'About', action: () => { setActiveModal('about'); setShowMobileMenu(false); } },
  ], []);

  const headerAccentStyle: React.CSSProperties = {
    borderBottom: `1px solid ${worldAccent.glow.includes('rgba') ? worldAccent.primary.replace(')', ', 0.2)') : worldAccent.primary}`,
  };

  return (
    <ScreenFxProvider>
      <ScorePopupProvider>
        <div style={{ minHeight: '100vh', background: colors.background.primary }}>
          {/* Top Bar */}
          <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${spacing.sm}px ${isSmall ? spacing.md : spacing.lg}px`,
            ...headerAccentStyle,
            background: colors.background.surface,
            position: 'sticky',
            top: 0,
            zIndex: 50,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isSmall ? spacing.sm : spacing.lg }}>
              <span style={{
                fontSize: isSmall ? typography.size.md : typography.size.lg,
                fontWeight: typography.weight.bold,
                background: worldAccent.gradient,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: typography.fontFamilyDisplay,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}>
                Mezo Pinball
              </span>
              {!isSmall && tournamentName && (
                <span style={{
                  fontSize: typography.size.sm,
                  color: colors.text.muted,
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  background: worldAccent.muted,
                  borderRadius: radius.sm,
                }}>
                  {tournamentName}
                </span>
              )}
              {gameActive && (
                <span style={{
                  fontSize: typography.size.xs,
                  color: colors.status.success,
                  fontWeight: typography.weight.medium,
                }}>
                  ● Live
                </span>
              )}
            </div>

            {isSmall ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                {view === 'game' && (
                  <Button variant="ghost" size="sm" onClick={openMenu} style={{ minWidth: 44, minHeight: 44 }}>
                    Menu
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  aria-label="Open menu"
                  style={{ minWidth: 44, minHeight: 44, fontSize: typography.size.xl }}
                >
                  ☰
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                {view === 'game' && (
                  <Button variant="ghost" size="sm" onClick={openMenu}>
                    Menu
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setActiveModal('leaderboard')}>
                  Leaderboard
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setActiveModal('settings')}>
                  Settings
                </Button>
                <ConnectButtonWrapper />
              </div>
            )}
          </header>

          {/* Mobile Dropdown Menu */}
          {isSmall && showMobileMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: spacing.md,
              background: colors.background.elevated,
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.lg,
              padding: spacing.sm,
              minWidth: 180,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              zIndex: 60,
              animation: 'fadeIn 150ms ease',
            }}>
              {mobileMenuItems.map((item) => (
                <Button
                  key={item.label}
                  variant="ghost"
                  fullWidth
                  onClick={item.action}
                  style={{ justifyContent: 'flex-start', padding: `${spacing.sm}px ${spacing.md}px`, minHeight: 44 }}
                >
                  {item.label}
                </Button>
              ))}
              <div style={{ borderTop: `1px solid ${colors.border.subtle}`, margin: `${spacing.xs}px 0` }} />
              <div style={{ padding: `${spacing.xs}px ${spacing.md}px` }}>
                <ConnectButtonWrapper />
              </div>
            </div>
          )}

          {/* Main Content */}
          <main style={{ padding: isSmall ? spacing.md : spacing.lg }}>
            {view === 'lobby' && (
              <ArcadeLobby
                tournaments={getAllTournaments()}
                activeTournamentId={tournament.tournamentId}
                entered={tournament.entered}
                isConnected={isConnected}
                loading={isLoadingTournament}
                onSelectTournament={(id) => setTournament(prev => ({ ...prev, tournamentId: id }))}
                onEnterTournament={onEnterTournament}
                onStartTournament={(id) => {
                  setTournament(prev => ({ ...prev, tournamentId: id }));
                  setMode("tournament");
                  setShowCelebration(false);
                  if (!hasSeenTutorial()) setShowTutorial(true);
                  setRunKey((k) => k + 1);
                  setView('game');
                }}
                onPractice={startPractice}
              />
            )}

            {view === 'paused' && (
              <PauseMenu
                score={lastScore}
                onResume={resumeGame}
                onRestart={() => {
                  setRunKey((k) => k + 1);
                  setView('game');
                }}
                onSettings={() => setActiveModal('settings')}
                onQuitToLobby={quitToLobby}
              />
            )}

            {view === 'game' && (
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
                    onActiveChange={(active) => {
                      setGameActive(active);
                    }}
                    onRunEnd={handleRunEnd}
                    onSubmissionStep={(step, err) => {
                      setSubmissionStep(step);
                      setSubmissionError(err ?? "");
                    }}
                    onSubmissionAvailable={setSubmission}
                    onSubmitted={() => refreshTournament()}
                    onStatus={() => {}}
                    onError={(e) => toast.addToast(e, 'error')}
                  />
                </CRTOverlay>
              </ErrorBoundary>
            )}
          </main>

          {/* Modals */}
          {activeModal === "settings" && <SettingsModal onClose={() => setActiveModal(null)} />}
          {activeModal === "how" && <HowToPlayModal onClose={() => setActiveModal(null)} />}
          {activeModal === "about" && <AboutModal onClose={() => setActiveModal(null)} />}
          {activeModal === "leaderboard" && (
            <LeaderboardModal
              onClose={() => setActiveModal(null)}
              rows={tournament.leaderboard}
              playerAddress={address}
              loading={isLoadingTournament}
            />
          )}

          {showTutorial && <TutorialOverlay onClose={() => { markTutorialSeen(); setShowTutorial(false); }} />}

          {submissionStep && (
            <ScoreSubmissionOverlay
              score={submission?.score ?? lastScore}
              step={submissionStep}
              errorMessage={submissionError}
              onClose={() => {
                setSubmissionStep(null);
                setSubmissionError("");
              }}
              onRetry={
                submission && submissionStep === "error"
                  ? async () => {
                      try {
                        await stopGame(
                          String(submission.tournamentId),
                          submission.score,
                          submission.playerName,
                          submission.metaData,
                          submission.walletPort,
                        );
                        setSubmissionStep(null);
                        setSubmissionError("");
                        toast.addToast('Score submitted!', 'success');
                        refreshTournament();
                      } catch (e: any) {
                        setSubmissionError(String(e?.message ?? "Retry failed."));
                        setSubmissionStep("error");
                      }
                    }
                  : undefined
              }
            />
          )}

          {showCelebration && (
            <CelebrationOverlay
              score={lastScore}
              isPractice={mode === "practice"}
              worldId={mode === "practice" ? selectedWorldId : tournament.worldId || undefined}
              tournamentName={tournamentName || undefined}
              onDismiss={() => setShowCelebration(false)}
              onPlayAgain={() => {
                setShowCelebration(false);
                if (mode === "practice") startPractice();
                else startTournament();
              }}
              onPlayTournament={() => {
                setShowCelebration(false);
                startTournament();
              }}
              onViewLeaderboard={() => {
                setShowCelebration(false);
                setActiveModal("leaderboard");
              }}
              onBackToLobby={() => {
                setShowCelebration(false);
                setView('lobby');
              }}
            />
          )}

          <CelebrationParticles active={showCelebration} />

          {showOnboarding && (
            <OnboardingIntro
              onComplete={() => {
                try { localStorage.setItem("pinball_onboarding_seen", "true"); } catch {}
                setShowOnboarding(false);
              }}
              onSkip={() => {
                try { localStorage.setItem("pinball_onboarding_seen", "true"); } catch {}
                setShowOnboarding(false);
              }}
            />
          )}
        </div>
      </ScorePopupProvider>
    </ScreenFxProvider>
  );
}

function ConnectButtonWrapper() {
  return <ConnectButton />;
}
