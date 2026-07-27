import { useState, useCallback, useEffect } from "react";
import { getFromStorage, setInStorage } from "@/utils/local-storage";

type RunRecord = {
  score: number;
  mode: "practice" | "tournament";
  gameMode?: "classic" | "kamikaze";
  worldId: string;
  timestamp: number;
  tournamentId?: number;
};

type PlayerStats = {
  gamesPlayed: number;
  totalScore: number;
  /** best classic score (higher = better) */
  bestScore: number;
  /** best kamikaze drain time in ms (lower = better; 0 = none yet) */
  bestDrainMs: number;
  bestWorld: string;
  tournamentsEntered: number;
  runs: RunRecord[];
};

const STORAGE_KEY = "pinball_player_stats";

function loadStats(): PlayerStats {
  try {
    const raw = getFromStorage(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { bestDrainMs: 0, ...parsed };
    }
  } catch {}

  return {
    gamesPlayed: 0,
    totalScore: 0,
    bestScore: 0,
    bestDrainMs: 0,
    bestWorld: "",
    tournamentsEntered: 0,
    runs: [],
  };
}

function saveStats(stats: PlayerStats) {
  try {
    setInStorage(STORAGE_KEY, JSON.stringify(stats));
  } catch {}
}

export function usePlayerStats() {
  const [stats, setStats] = useState<PlayerStats>(loadStats);

  useEffect(() => {
    saveStats(stats);
  }, [stats]);

  const recordRun = useCallback((run: Omit<RunRecord, "timestamp">) => {
    setStats((prev) => {
      const record: RunRecord = { ...run, timestamp: Date.now() };
      const runs = [record, ...prev.runs].slice(0, 50);

      const isKamikaze = run.gameMode === "kamikaze";
      let bestScore = prev.bestScore;
      let bestDrainMs = prev.bestDrainMs;
      let bestWorld = prev.bestWorld;

      if (isKamikaze) {
        if (run.score > 0 && (bestDrainMs === 0 || run.score < bestDrainMs)) {
          bestDrainMs = run.score;
          bestWorld = run.worldId;
        }
      } else if (run.score > prev.bestScore) {
        bestScore = run.score;
        bestWorld = run.worldId;
      }

      return {
        gamesPlayed: prev.gamesPlayed + 1,
        totalScore: prev.totalScore + (isKamikaze ? 0 : run.score),
        bestScore,
        bestDrainMs,
        bestWorld,
        tournamentsEntered: prev.tournamentsEntered + (run.mode === "tournament" ? 1 : 0),
        runs,
      };
    });
  }, []);

  const resetStats = useCallback(() => {
    setStats({
      gamesPlayed: 0,
      totalScore: 0,
      bestScore: 0,
      bestDrainMs: 0,
      bestWorld: "",
      tournamentsEntered: 0,
      runs: [],
    });
  }, []);

  return { stats, recordRun, resetStats };
}
