import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAppConfig } from "@/config/app-config";
import type { WalletPort } from "@/domains/wallet/wallet-port";
import { friendlyChainError } from "@/services/contracts/contract-utils";
import { stopGame, setSubmissionStateCallback, type SubmissionStep as LegacySubmissionStep } from "@/services/high-scores-service";
import { getTournamentMeta, getAllTournaments, type GameMode } from "@/config/tournaments";
import { getFromStorage } from "@/utils/local-storage";
import { getDailyChallenge, recordDailyRun } from "@/config/daily-challenge";
import { getProgress, recordRunProgress, grantEarlyWin, XP_FIRST_ACTION, type PlayerProgress, type ProgressUpdate } from "@/config/progression";
import { loadMemory, recordRunResult, saveMemory } from "@/utils/machine-memory";
import { getRunHabits } from "@/model/game";
import { parseChallengeUrl, didBeatChallenge, type ChallengeInvite } from "@/utils/challenge-link";
import { STORED_WORLD_ID } from "@/definitions/settings";
import { START_TABLE_INDEX } from "@/definitions/tables";
import type { AIDifficulty } from "@/model/kamikaze";

import { colors, spacing } from "@/theme/tokens";
import { useWorldTheme, getWorldAccent } from "@/hooks/use-world-theme";
import { usePlayerStats } from "@/hooks/use-player-stats";
import { useWalletPort } from "@/hooks/use-wallet-port";
import { useWalletState } from "@/hooks/use-wallet-state";
import { useTournament } from "@/hooks/use-tournament";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  useToast, ErrorBoundary,
  ScorePopupProvider, ScreenFxProvider,
  CelebrationParticles,
  OnboardingIntro,
  CRTOverlay, ArcadeLobby, AppHeader,
  AmbientBackground, ActivityFeedProvider, useActivityFeed,
  SakuraPetals, KanjiWatermark,
} from "@/game/ui";
import { burstAt } from "@/utils/burst-fx";
import { playFurinChime } from "@/services/audio-service";
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
import { KamiTrialModal } from "./ui/KamiTrialModal";
import { ControlsPanel } from "./ui/ControlsPanel";
import { PaymentMethodSelector, type PaymentMethod } from "./ui/PaymentMethodSelector";
import { enterTournamentWithNim, isNimPaymentAvailable } from "@/services/nimiq/nimiq-payment";
import { isInsideNimiqPay } from "@/services/nimiq/nimiq-provider";
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

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return "rival";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
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
  const { tournament, setTournament, isLoading: isLoadingTournament, loadError, refresh: refreshTournament, enterTournament: doEnterTournament } = useTournament(address, walletPort);
  const isDesktop = useMediaQuery("(min-width: 980px)");

  const [mode, setMode] = useState<"practice" | "tournament">("practice");
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    try { return (localStorage.getItem("pinball_game_mode") as GameMode) || "kamikaze"; } catch { return "kamikaze"; }
  });
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(() => {
    try { return (localStorage.getItem("pinball_kamikaze_difficulty") as AIDifficulty) || "medium"; } catch { return "medium"; }
  });
  const [controlScheme, setControlScheme] = useState<"steer" | "shotcall">(() => {
    try { return (localStorage.getItem("pinball_control_scheme") as "steer" | "shotcall") || "steer"; } catch { return "steer"; }
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
  const [showKamiTrials, setShowKamiTrials] = useState(false);
  const [showPaymentSelector, setShowPaymentSelector] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [lastScore, setLastScore] = useState<number>(0);
  const [lastReplayHash, setLastReplayHash] = useState<string | undefined>(undefined);
  const [dailyResult, setDailyResult] = useState<{ dayKey: string; mode: "classic" | "kamikaze"; best: number; isPB: boolean } | null>(null);
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
  // Meta-progression (rank / XP / streak) and friend-challenge state.
  const [progress, setProgress] = useState<PlayerProgress>(() => getProgress());
  const [progressUpdate, setProgressUpdate] = useState<ProgressUpdate | null>(null);
  const [pendingChallenge, setPendingChallenge] = useState<ChallengeInvite | null>(() => {
    if (typeof window === "undefined") return null;
    return parseChallengeUrl(window.location.search);
  });
  const [activeChallenge, setActiveChallenge] = useState<ChallengeInvite | null>(null);
  const [challengeOutcome, setChallengeOutcome] = useState<{ invite: ChallengeInvite; beat: boolean } | null>(null);

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

  function selectControlScheme(next: "steer" | "shotcall") {
    setControlScheme(next);
    try { localStorage.setItem("pinball_control_scheme", next); } catch {}
  }

  function startPractice() {
    setMode("practice");
    setShowCelebration(false);
    if (!hasSeenTutorial()) setShowTutorial(true);
    setRunKey((k) => k + 1);
    setView("game");
  }
  function startDailyChallenge(challenge: { worldId: string; mode: GameMode; aiDifficulty: AIDifficulty }) {
    setSelectedWorldId(challenge.worldId);
    setGameMode(challenge.mode);
    setAiDifficulty(challenge.aiDifficulty);
    setMode("practice");
    setShowCelebration(false);
    markTutorialSeen();
    setRunKey((k) => k + 1);
    setView("game");
    activityFeed.log("entry", `Daily challenge started · ${challenge.worldId} · ${challenge.mode}`);
  }

  // Friend challenge accepted from a deep link: same world, mode and machine
  // difficulty as the challenger's run, then compare scores at run end.
  function acceptChallenge(invite: ChallengeInvite) {
    setSelectedWorldId(invite.worldId);
    setGameMode(invite.mode);
    setAiDifficulty(invite.aiDifficulty);
    setMode("practice");
    setShowCelebration(false);
    setChallengeOutcome(null);
    markTutorialSeen();
    setActiveChallenge(invite);
    setPendingChallenge(null);
    setRunKey((k) => k + 1);
    setView("game");
    activityFeed.log("entry", `Accepted ${invite.name ?? "a friend"}'s challenge · ${invite.worldId} · ${invite.mode}`);
  }

  // Challenge a rival from the persistent community feed. The rival's mode +
  // score become the target; we reuse the player's current world + difficulty
  // (the feed doesn't carry those), keeping the duel fair and instant.
  function challengeCommunityRun(run: { address: string; name: string; score: number; mode: GameMode }) {
    const invite: ChallengeInvite = {
      mode: run.mode,
      worldId: selectedWorldId,
      aiDifficulty,
      score: run.score,
      name: run.name || shortAddr(run.address),
    };
    setSelectedWorldId(invite.worldId);
    setGameMode(invite.mode);
    setMode("practice");
    setShowCelebration(false);
    setChallengeOutcome(null);
    markTutorialSeen();
    setActiveChallenge(invite);
    setPendingChallenge(null);
    setRunKey((k) => k + 1);
    setView("game");
    toast.addToast(`挑戦 · Challenging ${invite.name}!`, "info");
    activityFeed.log("entry", `Challenged ${invite.name} · ${invite.mode} · beat ${run.mode === "kamikaze" ? `${(run.score / 1000).toFixed(1)}s` : run.score.toLocaleString()}`);
  }

  function proceedAfterEntry() {
    setMode("tournament");
    setShowCelebration(false);
    if (!hasSeenTutorial()) setShowTutorial(true);
    setRunKey((k) => k + 1);
    setView("game");
  }

  function enterWithMethod(method: PaymentMethod) {
    setPaymentBusy(true);
    const tid = tournament.tournamentId;
    if (!tid) { setPaymentBusy(false); return; }

    if (method === "nim" && address) {
      enterTournamentWithNim(tid, address)
        .then(() => {
          toast.addToast("Entered tournament with NIM! ありがとうございます", "success");
          activityFeed.log("entry", `Entered tournament #${tid} with NIM`);
          setShowPaymentSelector(false);
          refreshTournament();
          proceedAfterEntry();
        })
        .catch((e: any) => toast.addToast(e?.message ?? "NIM payment failed.", "error"))
        .finally(() => setPaymentBusy(false));
    } else {
      doEnterTournament()
        .then(() => {
          toast.addToast("Entered tournament! Starting your run...", "success");
          setShowPaymentSelector(false);
          proceedAfterEntry();
        })
        .catch((e: any) => toast.addToast(friendlyChainError(e, "Failed to enter tournament."), "error"))
        .finally(() => setPaymentBusy(false));
    }
  }

  function startTournament() {
    setMode("tournament");
    if (!canStartTournamentRun) {
      if (!isConnected) {
        toast.addToast("Connect your wallet using the button in the header, then try again.", "warning");
      } else if (isInsideNimiqPay() && isNimPaymentAvailable()) {
        setShowPaymentSelector(true);
      } else {
        setPaymentBusy(true);
        doEnterTournament()
          .then(() => {
            toast.addToast("Entered tournament! Starting your run...", "success");
            proceedAfterEntry();
          })
          .catch((e: any) => toast.addToast(friendlyChainError(e, "Failed to enter tournament. Check your balance."), "error"))
          .finally(() => setPaymentBusy(false));
      }
      return;
    }
    proceedAfterEntry();
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

  const pausedEffective = view === "paused" || activeModal !== null || showTutorial || showCelebration || showReplay || submissionStep !== null || showKamiTrials;

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

  const handleFirstAction = useCallback(() => {
    // Early win: reward the player's very first deliberate action so the
    // first dopamine hit lands before the first run ends (pacing hook).
    const result = grantEarlyWin();
    if (!result.granted) return;
    setProgress(result.progress);
    playFurinChime();
    burstAt(window.innerWidth / 2, window.innerHeight / 2, { count: 14, colors: ["#d4a017", "#e34234", "#fbbf24"] });
    toast.addToast(`風が吹いた · First touch! +${XP_FIRST_ACTION} XP`, "success");
    activityFeed.log("powerup", `The wind answers your first touch (+${XP_FIRST_ACTION} XP)`);
  }, [toast, activityFeed]);

  const handleRunEnd = useCallback((score: number, replayHash?: string) => {
    setLastScore(score);
    setLastReplayHash(replayHash);
    recordRun({ score, mode, gameMode: effectiveGameMode, worldId: activeWorldId, tournamentId: tournament.tournamentId ?? undefined });
    // Daily Challenge retention: only runs matching today's mode count toward
    // the day's PB, so classic scores never pollute a kamikaze drain-time PB.
    const challenge = getDailyChallenge();
    let isDailyPB = false;
    if (challenge.mode === effectiveGameMode) {
      const res = recordDailyRun(challenge, score);
      isDailyPB = res.isPB;
      setDailyResult({ dayKey: challenge.dayKey, mode: challenge.mode, best: res.best, isPB: res.isPB });
    } else {
      setDailyResult(null);
    }
    // Friend challenge verdict (one-shot: cleared after the run it applied to).
    const wonChallenge = activeChallenge ? didBeatChallenge(activeChallenge, score) : false;
    setChallengeOutcome(activeChallenge ? { invite: activeChallenge, beat: wonChallenge } : null);
    if (activeChallenge) setActiveChallenge(null);
    // Meta-progression: XP, rank-ups and streaks.
    const update = recordRunProgress({
      gameMode: effectiveGameMode,
      isDailyPB,
      wonChallenge,
      dayKey: challenge.dayKey,
    });
    setProgress(update.progress);
    setProgressUpdate(update);
    // B1: persist machine memory so MAMORU remembers this run (kamikaze only —
    // the adversary relationship lives there). drainMs = score for kamikaze.
    if (effectiveGameMode === "kamikaze") {
      saveMemory(recordRunResult(loadMemory(), score, getRunHabits()));
    }
    setShowCelebration(true);
    activityFeed.log(
      effectiveGameMode === "kamikaze" ? "drain" : "score",
      effectiveGameMode === "kamikaze"
        ? `Ball drained in ${(score / 1000).toFixed(1)}s`
        : `Score submitted: ${score.toLocaleString()} pts`,
    );
  }, [mode, effectiveGameMode, activeWorldId, tournament.tournamentId, activeChallenge, recordRun, activityFeed]);

  return (
    <ScreenFxProvider>
      <ScorePopupProvider>
        <div style={{ minHeight: "100vh", background: colors.background.primary, position: "relative" }}>
          <AmbientBackground />
          {view === "lobby" && effectiveGameMode === "kamikaze" && <SakuraPetals />}
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
            {view === "lobby" && loadError && (
              <div style={{
                maxWidth: 900, margin: "0 auto 14px", padding: "10px 16px",
                borderRadius: 10, border: "1px solid rgba(239, 68, 68, 0.45)",
                background: "rgba(239, 68, 68, 0.1)", fontSize: 13, color: "#fca5a5",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <span style={{ flex: 1 }}>⚠ {loadError}</span>
                <button
                  onClick={() => refreshTournament()}
                  style={{
                    padding: "5px 14px", borderRadius: 8, border: "none",
                    background: "rgba(239, 68, 68, 0.3)", color: "#fff",
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {view === "lobby" && (
              <ArcadeLobby
                tournaments={getAllTournaments()}
                activeTournamentId={tournament.tournamentId}
                entered={tournament.entered}
                isConnected={isConnected}
                loading={isLoadingTournament}
                gameMode={gameMode}
                aiDifficulty={aiDifficulty}
                controlScheme={controlScheme}
                onSelectControlScheme={selectControlScheme}
                playerAddress={address ?? null}
                playerStats={stats}
                onSelectGameMode={selectGameMode}
                onSelectDifficulty={selectDifficulty}
                onSelectTournament={(id) => setTournament((prev) => ({ ...prev, tournamentId: id }))}
                onEnterTournament={(_id: number) => {
                  if (isInsideNimiqPay() && isNimPaymentAvailable()) {
                    setShowPaymentSelector(true);
                  } else {
                    setPaymentBusy(true);
                    doEnterTournament()
                      .then(() => {
                        toast.addToast("Entered tournament!", "success");
                        activityFeed.log("entry", `Player entered tournament #${_id}`);
                      })
                      .catch((e: any) => toast.addToast(friendlyChainError(e, "Failed to enter tournament."), "error"))
                      .finally(() => setPaymentBusy(false));
                  }
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
                onPlayDaily={startDailyChallenge}
                progress={progress}
                pendingChallenge={pendingChallenge}
                onAcceptChallenge={acceptChallenge}
                onDismissChallenge={() => setPendingChallenge(null)}
                onChallengeCommunityRun={challengeCommunityRun}
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
                onKamiTrials={() => setShowKamiTrials(true)}
              />
            )}
            {showKamiTrials && (
              <KamiTrialModal
                onClose={() => setShowKamiTrials(false)}
                onResult={(boon, _accuracy) => {
                  setShowKamiTrials(false);
                  if (boon) {
                    toast.addToast(`神のご加護 · Boon granted: ${boon}!`, "success");
                    activityFeed.log("powerup", `Consulted the Kami and earned ${boon}`);
                  } else {
                    toast.addToast("The kami remain silent. No boon this time.", "info");
                  }
                  setView("game");
                }}
              />
            )}
            {showPaymentSelector && (
              <PaymentMethodSelector
                entryFeeLabel={tournament.entryFeeWei ? `${Number(tournament.entryFeeWei) / 1e6} USDT` : "Free"}
                busy={paymentBusy}
                onSelect={enterWithMethod}
                onCancel={() => setShowPaymentSelector(false)}
              />
            )}

            {view === "game" && (
              <div style={{ display: "flex", gap: spacing.xl, alignItems: "flex-start", justifyContent: "center" }}>
                <ErrorBoundary>
                  <CRTOverlay intensity={0.25}>
                    <GameMount
                      runKey={runKey}
                      mode={mode}
                      gameMode={effectiveGameMode}
                      aiDifficulty={aiDifficulty}
                      controlScheme={effectiveGameMode === "kamikaze" ? controlScheme : "steer"}
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
                      onFirstAction={handleFirstAction}
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
                {isDesktop && (
                  <ControlsPanel
                    touchscreen={false}
                    onConsultKami={() => { setView("paused"); setShowKamiTrials(true); }}
                  />
                )}
              </div>
            )}
          </main>

          {activeModal === "settings" && <SettingsModal onClose={() => setActiveModal(null)} />}
          {activeModal === "how" && <HowToPlayModal onClose={() => setActiveModal(null)} />}
          {activeModal === "about" && <AboutModal onClose={() => setActiveModal(null)} />}
          {activeModal === "leaderboard" && (
            <LeaderboardModal onClose={() => setActiveModal(null)} rows={tournament.leaderboard} playerAddress={address} loading={isLoadingTournament} loadError={Boolean(loadError)} onRetry={refreshTournament} inverted={tournament.invertedWinCondition} />
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
                  setSubmissionError(friendlyChainError(e, "Retry failed."));
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
              isNewBest={Boolean(dailyResult?.isPB)}
              progress={progressUpdate}
              challengeOutcome={challengeOutcome}
              playerName={playerName || undefined}
              replayHash={lastReplayHash}
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
              onComplete={() => { markOnboardingSeen(); setShowOnboarding(false); startPractice(); }}
              onSkip={() => { markOnboardingSeen(); setShowOnboarding(false); }}
            />
          )}
          </div>
        </div>
      </ScorePopupProvider>
    </ScreenFxProvider>
  );
}
