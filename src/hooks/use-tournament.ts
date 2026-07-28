import { useCallback, useEffect, useState } from "react";

import type { WalletPort } from "@/domains/wallet/wallet-port";
import {
  enterTournament,
  fetchLeaderboard,
  getActiveTournamentId,
  getEntryFee,
  getPlayerInfo,
  getTournamentInfo,
  getWinners,
} from "@/services/contracts/tournament-client";
import { getTournamentMeta } from "@/config/tournaments";

export type TournamentState = {
  tournamentId: number | null;
  entryFeeWei: bigint;
  totalPotWei: bigint;
  startTime: number | null;
  endTime: number | null;
  topN: number | null;
  finalized: boolean;
  invertedWinCondition: boolean;
  winners: string[];
  entered: boolean;
  leaderboard: { address: string; score: number }[];
  worldId: string | null;
};

const INITIAL_STATE: TournamentState = {
  tournamentId: null,
  entryFeeWei: 0n,
  totalPotWei: 0n,
  startTime: null,
  endTime: null,
  topN: null,
  finalized: false,
  invertedWinCondition: false,
  winners: [],
  entered: false,
  leaderboard: [],
  worldId: null,
};

export function useTournament(address: string | undefined, walletPort: WalletPort | null) {
  const [tournament, setTournament] = useState<TournamentState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const tournamentId = await getActiveTournamentId();
      const [fee, info, winners] = await Promise.all([
        getEntryFee(),
        getTournamentInfo(tournamentId),
        getWinners(tournamentId),
      ]);

      const leaderboard = await fetchLeaderboard(tournamentId, 0, 50, info.invertedWinCondition);

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
        invertedWinCondition: info.invertedWinCondition,
        winners,
        entered,
        leaderboard,
        worldId: meta?.worldId ?? null,
      });
    } catch (e: any) {
      console.error(e);
      setLoadError(e?.message ?? 'Failed to load tournament data. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const doEnterTournament = useCallback(async (): Promise<void> => {
    if (!tournament.tournamentId || !walletPort) return;
    await enterTournament(tournament.tournamentId, walletPort);
    await refresh();
  }, [tournament.tournamentId, walletPort, refresh]);

  return {
    tournament,
    setTournament,
    isLoading,
    loadError,
    refresh,
    enterTournament: doEnterTournament,
  };
}
