import { useState, useCallback, useEffect } from "react";
import { getFromStorage, setInStorage } from "@/utils/local-storage";

type RunRecord = {
  score: number;
  mode: "practice" | "tournament";
  worldId: string;
  timestamp: number;
  tournamentId?: number;
};

type PlayerStats = {
  gamesPlayed: number;
  totalScore: number;
  bestScore: number;
  bestWorld: string;
  tournamentsEntered: number;
  runs: RunRecord[];
};

const STORAGE_KEY = "pinball_player_stats";

function loadStats(): PlayerStats {
  try {
    const raw = getFromStorage(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}

  return {
    gamesPlayed: 0,
    totalScore: 0,
    bestScore: 0,
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
      const bestScore = Math.max(prev.bestScore, run.score);
      const bestWorld = run.score > prev.bestScore ? run.worldId : prev.bestWorld;

      return {
        gamesPlayed: prev.gamesPlayed + 1,
        totalScore: prev.totalScore + run.score,
        bestScore,
        bestWorld,
        tournamentsEntered: prev.tournamentsEntered + (run.mode === "tournament" ? 1 : 0),
        runs,
      };
    });
  }, []);

  const resetStats = useCallback(() => {
    const empty = loadStats();
    empty.gamesPlayed = 0;
    empty.totalScore = 0;
    empty.bestScore = 0;
    empty.bestWorld = "";
    empty.tournamentsEntered = 0;
    empty.runs = [];
    setStats(empty);
  }, []);

  return { stats, recordRun, resetStats };
}
