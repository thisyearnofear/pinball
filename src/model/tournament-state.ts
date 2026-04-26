import { web3Service } from '@/services/web3-service';
import { getActiveTournamentId, getEntryFee, getTournamentInfo, getWinners, getPrizeBps, enterTournament, claimReward, fetchLeaderboard } from '@/services/contracts/tournament-client';
import { estimatedPrizeBps } from '@/services/prize';

interface TournamentState {
  tournamentId: number | null;
  entryFeeWei: bigint;
  finalized: boolean;
  winners: string[];
  address: string | null;
  leaderboard: { address: string; score: number }[];
  entered: boolean;
  totalPotWei: bigint;
  startTime: number | null;
  endTime: number | null;
  topN: number;
  prizeBps: number[];
}

const state: TournamentState = {
  tournamentId: null,
  entryFeeWei: 0n,
  finalized: false,
  winners: [],
  address: null,
  leaderboard: [],
  entered: false,
  totalPotWei: 0n,
  startTime: null,
  endTime: null,
  topN: 0,
  prizeBps: [],
};

export function useTournamentState() {
  async function load() {
    try {
      state.address = web3Service.getAddress();
      const id = await getActiveTournamentId();
      state.tournamentId = id;
      state.entryFeeWei = await getEntryFee();
      const info = await getTournamentInfo(id);
      state.finalized = info.finalized;
      state.totalPotWei = info.totalPot;
      state.startTime = info.startTime;
      state.endTime = info.endTime;
      state.topN = info.topN;
      state.winners = await getWinners(id);
      try {
        state.prizeBps = await getPrizeBps(id);
      } catch {
        state.prizeBps = estimatedPrizeBps(state.topN);
      }
      state.leaderboard = id != null ? await fetchLeaderboard(id, 0, 100) : [];
      if (state.address) {
        const addr = state.address.toLowerCase();
        state.entered = state.leaderboard.some(r => r.address.toLowerCase() === addr)
          || state.winners.map(a => a.toLowerCase()).includes(addr);
      } else {
        state.entered = false;
      }
    } catch (error: any) {
      console.log('Failed to load tournament state:', error.message);
      // Set default values so the UI can still render
      state.tournamentId = null;
      state.entryFeeWei = 0n;
      state.finalized = false;
      state.totalPotWei = 0n;
      state.startTime = null;
      state.endTime = null;
      state.topN = 0;
      state.winners = [];
      state.prizeBps = [];
      state.leaderboard = [];
      state.entered = false;
      state.address = null;
      throw error; // Re-throw so caller can handle appropriately
    }
  }

  async function refreshLeaderboard() {
    const id = state.tournamentId;
    state.leaderboard = id != null ? await fetchLeaderboard(id, 0, 100) : [];
  }

  function getIsWinner() {
    if (!state.address) return false;
    return state.winners.map(a => a.toLowerCase()).includes(state.address.toLowerCase());
  }

  async function enter() {
    if (state.tournamentId == null) throw new Error('No active tournament');
    return await enterTournament(state.tournamentId);
  }

  async function claim() {
    if (state.tournamentId == null) throw new Error('No active tournament');
    return await claimReward(state.tournamentId);
  }

  function getTimeRemainingSec() {
    if (!state.endTime) return null;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, state.endTime - now);
  }

  return {
    tournamentId: state,
    entryFeeWei: state,
    finalized: state,
    winners: state,
    address: state,
    leaderboard: state,
    entered: state,
    totalPotWei: state,
    startTime: state,
    endTime: state,
    topN: state,
    prizeBps: state,
    timeRemainingSec: getTimeRemainingSec(),
    isWinner: getIsWinner(),
    load,
    enter,
    claim,
    refreshLeaderboard,
  };
}
