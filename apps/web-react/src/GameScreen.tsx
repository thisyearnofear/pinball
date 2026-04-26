import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

import GameMount from "./GameMount";

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
import { StartMenu } from "./ui/StartMenu";
import { SettingsModal } from "./ui/SettingsModal";
import { HowToPlayModal } from "./ui/HowToPlayModal";
import { AboutModal } from "./ui/AboutModal";
import { LeaderboardModal } from "./ui/LeaderboardModal";
import { TutorialOverlay, hasSeenTutorial } from "./ui/TutorialOverlay";
import { ScoreSubmissionOverlay, type SubmissionStep } from "./ui/ScoreSubmissionOverlay";
import { CelebrationOverlay } from "./ui/CelebrationOverlay";
import Tables, { START_TABLE_INDEX } from "@/definitions/tables";

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
};

export default function GameScreen() {
  const { address, isConnected, connector } = useAccount();

  const [mode, setMode] = useState<"practice" | "tournament">("practice");
  const [runKey, setRunKey] = useState(0);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [walletPort, setWalletPort] = useState<WalletPort | null>(null);
  const [activeModal, setActiveModal] = useState<null | "settings" | "how" | "about" | "leaderboard">(null);
  const [showMenu, setShowMenu] = useState(true);
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
  });

  // WalletPort creation: keep wallet integration behind a clean boundary.
  useEffect(() => {
    let cancelled = false;

    async function syncWalletPort() {
      setError("");
      if (!isConnected || !connector || !address) return;

      const provider = (await connector.getProvider()) as any;
      if (!provider || typeof provider.request !== "function") return;

      const port = new Eip1193WalletPort(provider);
      // Validate early for better UX.
      await port.getAddress();
      if (cancelled) return;
      setWalletPort(port);
    }

    syncWalletPort().catch((e) => {
      console.error("Failed to initialize wallet port:", e);
      setWalletPort(null);
      setError("Wallet init failed.");
    });

    return () => {
      cancelled = true;
    };
  }, [isConnected, connector, address]);

  const refreshTournament = useCallback(async () => {
    setError("");
    setStatus("Loading tournament…");

    try {
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
          // ignore and fall back to leaderboard heuristic
          const addr = address.toLowerCase();
          entered =
            leaderboard.some((r) => r.address.toLowerCase() === addr) ||
            winners.map((w) => w.toLowerCase()).includes(addr);
        }
      }

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
      });
      setStatus("Tournament loaded.");
    } catch (e: any) {
      console.error(e);
      setStatus("");
      setError(e?.message ?? "Failed to load tournament.");
    }
  }, [address]);

  useEffect(() => {
    // Auto-load tournament info once connected (or on page load; it will error if config missing).
    refreshTournament().catch(() => {});
  }, [refreshTournament]);

  const canStartTournamentRun = useMemo(() => {
    if (!isConnected) return false;
    if (!tournament.tournamentId) return false;
    return tournament.entered;
  }, [isConnected, tournament.tournamentId, tournament.entered]);

  async function onEnterTournament() {
    if (!tournament.tournamentId) return;
    if (!walletPort) return;
    setError("");
    setStatus("Entering tournament…");
    try {
      await enterTournament(tournament.tournamentId, walletPort);
      setStatus("Entered tournament.");
      await refreshTournament();
    } catch (e: any) {
      console.error(e);
      setStatus("");
      setError(e?.message ?? "Failed to enter tournament.");
    }
  }

  function startPractice() {
    setMode("practice");
    setStatus("Starting practice run…");
    setShowMenu(false);
    setSubmissionStep(null);
    setSubmissionError("");
    setShowCelebration(false);
    if (!hasSeenTutorial()) setShowTutorial(true);
    setRunKey((k) => k + 1);
  }

  function startTournament() {
    setMode("tournament");
    if (!canStartTournamentRun) {
      setError(isConnected ? "Enter the active tournament first." : "Connect your wallet first.");
      return;
    }
    setStatus("Starting tournament run…");
    setShowMenu(false);
    setSubmissionStep(null);
    setSubmissionError("");
    setShowCelebration(false);
    if (!hasSeenTutorial()) setShowTutorial(true);
    setRunKey((k) => k + 1);
  }

  const tableName = useMemo(() => {
    const table = Tables[tableIndex];
    return table?.name ?? "Unknown";
  }, [tableIndex]);

  // When game becomes active, close menus and ensure unpaused.
  useEffect(() => {
    if (gameActive) {
      setShowMenu(false);
    }
  }, [gameActive]);

  const paused = showMenu || activeModal !== null;
  const pausedEffective = paused || showTutorial || showCelebration || submissionStep !== null;

  // Wire global submission step callback → React overlay
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

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => {
            setShowMenu(true);
          }}
        >
          Menu
        </button>
        <button onClick={() => setActiveModal("leaderboard")}>Leaderboard</button>
        <button onClick={() => setActiveModal("settings")}>Settings</button>
        <button onClick={() => setActiveModal("how")}>How to play</button>
        <button onClick={() => setActiveModal("about")}>About</button>
        <button onClick={refreshTournament}>Refresh tournament</button>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Table: {tableName}
          {gameActive ? " • in game" : ""}
          {paused ? " • paused" : ""}
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
        {status ? <div>{status}</div> : null}
        {error ? <div style={{ color: "crimson" }}>{error}</div> : null}
      </div>

      {showMenu ? (
        <StartMenu
          isConnected={isConnected}
          playerName={playerName}
          onPlayerNameChange={(v) => {
            setPlayerName(v);
            try {
              localStorage.setItem("pinball_player_name", v);
            } catch {
              // ignore
            }
          }}
          tableIndex={tableIndex}
          onTableIndexChange={setTableIndex}
          tournamentId={tournament.tournamentId}
          entryFeeWei={tournament.entryFeeWei}
          totalPotWei={tournament.totalPotWei}
          endTime={tournament.endTime}
          entered={tournament.entered}
          onStartPractice={startPractice}
          onEnterTournament={onEnterTournament}
          onStartTournament={startTournament}
        />
      ) : null}

      {activeModal === "settings" ? <SettingsModal onClose={() => setActiveModal(null)} /> : null}
      {activeModal === "how" ? <HowToPlayModal onClose={() => setActiveModal(null)} /> : null}
      {activeModal === "about" ? <AboutModal onClose={() => setActiveModal(null)} /> : null}
      {activeModal === "leaderboard" ? (
        <LeaderboardModal onClose={() => setActiveModal(null)} rows={tournament.leaderboard} />
      ) : null}
      {showTutorial ? (
        <TutorialOverlay
          onClose={() => {
            setShowTutorial(false);
          }}
        />
      ) : null}
      {submissionStep ? (
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
                    setStatus("Retrying score submission…");
                    await stopGame(
                      String(submission.tournamentId),
                      submission.score,
                      submission.playerName,
                      submission.metaData,
                      submission.walletPort
                    );
                    setSubmissionStep(null);
                    setSubmissionError("");
                    setStatus("Score submitted.");
                    refreshTournament();
                  } catch (e: any) {
                    setSubmissionError(String(e?.message ?? "Retry failed."));
                    setSubmissionStep("error");
                  }
                }
              : undefined
          }
        />
      ) : null}
      {showCelebration ? (
        <CelebrationOverlay
          score={lastScore}
          isPractice={mode === "practice"}
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
        />
      ) : null}

      <GameMount
        runKey={runKey}
        mode={mode}
        tournamentId={tournament.tournamentId}
        playerAddress={address ?? null}
        walletPort={walletPort}
        playerName={playerName}
        tableIndex={tableIndex}
        paused={pausedEffective}
        onActiveChange={(active) => {
          setGameActive(active);
          if (!active && !showMenu) {
            // After a run ends, pause and show menu again.
            setShowMenu(true);
          }
        }}
        onRunEnd={(score) => {
          setLastScore(score);
          setShowCelebration(true);
        }}
        onSubmissionStep={(step, err) => {
          setSubmissionStep(step);
          setSubmissionError(err ?? "");
        }}
        onSubmissionAvailable={setSubmission}
        onSubmitted={() => refreshTournament()}
        onStatus={(s) => setStatus(s)}
        onError={(e) => setError(e)}
      />
    </div>
  );
}
