import { ref, computed } from 'vue';
import { web3Service } from '@/services/web3-service';
import { getActiveTournamentId, getEntryFeeWei, getTournamentInfo, getWinners, enterTournament, claimReward } from '@/services/contracts/tournament-client';
import { getHighScores } from '@/services/high-scores-service';

const tournamentId = ref<number | null>(null);
const entryFeeWei = ref<bigint>(0n);
const finalized = ref<boolean>(false);
const winners = ref<string[]>([]);
const address = ref<string | null>(null);
const scores = ref<{ name: string; score: number; duration: number }[]>([]);
const entered = ref<boolean>(false);
const totalPotWei = ref<bigint>(0n);
const startTime = ref<number | null>(null);
const endTime = ref<number | null>(null);
const topN = ref<number>(0);

export function useTournamentState() {
  async function load() {
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
    scores.value = await getHighScores();
    // Lightweight 'entered' inference: if address appears in leaderboard or winners
    if (address.value) {
      entered.value = scores.value.some(s => (s as any).address?.toLowerCase?.() === address.value!.toLowerCase())
        || winners.value.map(a => a.toLowerCase()).includes(address.value.toLowerCase());
    } else {
      entered.value = false;
    }
  }

  async function refreshLeaderboard() {
    scores.value = await getHighScores();
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
    scores,
    entered,
    totalPotWei,
    startTime,
    endTime,
    topN,
    timeRemainingSec,
    isWinner,
    load,
    enter,
    claim,
    refreshLeaderboard,
  };
}
