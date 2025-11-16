import { ref, computed } from 'vue';
import { web3Service } from '@/services/web3-service';
import { getActiveTournamentId, getEntryFeeWei, getTournamentInfo, getWinners, getPrizeBps, enterTournament, claimReward, fetchLeaderboard } from '@/services/contracts/tournament-client';
import { estimatedPrizeBps } from '@/services/prize';

const tournamentId = ref<number | null>(null);
const entryFeeWei = ref<bigint>(0n);
const finalized = ref<boolean>(false);
const winners = ref<string[]>([]);
const address = ref<string | null>(null);
const leaderboard = ref<{ address: string; score: number }[]>([]);
const entered = ref<boolean>(false);
const totalPotWei = ref<bigint>(0n);
const startTime = ref<number | null>(null);
const endTime = ref<number | null>(null);
const topN = ref<number>(0);
const prizeBps = ref<number[]>([]);

export function useTournamentState() {
  async function load() {
    try {
      address.value = web3Service.getAddress();
      const id = await getActiveTournamentId();
      tournamentId.value = id;
      entryFeeWei.value = await getEntryFeeWei();
      const info = await getTournamentInfo(id);
      finalized.value = info.finalized;
      totalPotWei.value = info.totalPot;
      startTime.value = info.startTime;
      endTime.value = info.endTime;
      topN.value = info.topN;
      winners.value = await getWinners(id);
      try {
        prizeBps.value = await getPrizeBps(id);
      } catch {
        prizeBps.value = estimatedPrizeBps(topN.value);
      }
      leaderboard.value = id != null ? await fetchLeaderboard(id, 0, 100) : [];
      if (address.value) {
        const addr = address.value.toLowerCase();
        entered.value = leaderboard.value.some(r => r.address.toLowerCase() === addr)
          || winners.value.map(a => a.toLowerCase()).includes(addr);
      } else {
        entered.value = false;
      }
    } catch (error: any) {
      console.log('Failed to load tournament state:', error.message);
      // Set default values so the UI can still render
      tournamentId.value = null;
      entryFeeWei.value = 0n;
      finalized.value = false;
      totalPotWei.value = 0n;
      startTime.value = null;
      endTime.value = null;
      topN.value = 0;
      winners.value = [];
      prizeBps.value = [];
      leaderboard.value = [];
      entered.value = false;
      address.value = null;
      throw error; // Re-throw so caller can handle appropriately
    }
  }

  async function refreshLeaderboard() {
    const id = tournamentId.value;
    leaderboard.value = id != null ? await fetchLeaderboard(id, 0, 100) : [];
  }

  const isWinner = computed(() => {
    if (!address.value) return false;
    return winners.value.map(a => a.toLowerCase()).includes(address.value.toLowerCase());
  });

  async function enter() {
    if (tournamentId.value == null) throw new Error('No active tournament');
    return await enterTournament(tournamentId.value);
  }

  async function claim() {
    if (tournamentId.value == null) throw new Error('No active tournament');
    return await claimReward(tournamentId.value);
  }

  const timeRemainingSec = computed(() => {
    if (!endTime.value) return null;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, endTime.value - now);
  });

  return {
    tournamentId,
    entryFeeWei,
    finalized,
    winners,
    address,
    leaderboard,
    entered,
    totalPotWei,
    startTime,
    endTime,
    topN,
    prizeBps,
    timeRemainingSec,
    isWinner,
    load,
    enter,
    claim,
    refreshLeaderboard,
  };
}
