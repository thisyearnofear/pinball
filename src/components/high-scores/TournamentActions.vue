<template>
  <div class="tournament-actions">
    <button :disabled="!canEnter || busy" @click="onEnter">{{ entered ? 'Already Entered' : 'Enter Tournament' }}</button>
    <button :disabled="!canClaim || busy" @click="onClaim">Claim Reward</button>
    <span v-if="rankLabel" class="rank">{{ rankLabel }}</span>
    <span v-if="error" class="error">{{ error }}</span>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTournamentState } from '@/model/tournament-state';
import { getContractsConfig } from '@/config/contracts';
import { web3Service } from '@/services/web3-service';
import { showToast } from '@/services/toast';
import { estimatedPrizeBps } from '@/services/prize';
import { ethers } from 'ethers';

const { tournamentId, finalized, isWinner, entered, winners, address, totalPotWei, prizeBps, enter, claim, refreshLeaderboard } = useTournamentState();
const busy = ref(false);
const error = ref('');

const canEnter = computed(() => !!web3Service.getAddress() && !!tournamentId.value && !finalized.value && !entered.value);
const canClaim = computed(() => !!web3Service.getAddress() && !!tournamentId.value && finalized.value && isWinner.value);

const rankLabel = computed(() => {
  if (!finalized.value || !isWinner.value || !address.value || !winners.value?.length) return '';
  const idx = winners.value.findIndex(a => a.toLowerCase() === address.value!.toLowerCase());
  if (idx === -1) return '';
  const rank = idx + 1;
  const bps = prizeBps.value?.length ? prizeBps.value : estimatedPrizeBps(winners.value.length);
  const wei = totalPotWei.value ?? 0n;
  const prizeWei = bps[rank - 1] ? (wei * BigInt(bps[rank - 1])) / 10000n : 0n;
  const prizeEth = Number(ethers.formatEther(prizeWei)).toFixed(4);
  return `Finalized • You placed #${rank} • Estimated prize ${prizeEth} ETH`;
});

async function onEnter(){
  error.value = '';
  try{
    busy.value = true;
    await enter();
    await refreshLeaderboard();
    showToast('Entered tournament', 'success');
  }catch(e:any){ error.value = e?.message || 'Enter failed'; }
  finally{ busy.value = false; }
}

async function onClaim(){
  error.value = '';
  try{
    busy.value = true;
    await claim();
    await refreshLeaderboard();
    showToast('Reward claimed', 'success');
  }catch(e:any){ error.value = e?.message || 'Claim failed'; }
  finally{ busy.value = false; }
}
</script>
<style scoped>
.tournament-actions{ display:flex; gap:8px; align-items:center; margin-bottom: 12px; flex-wrap: wrap; }
button{ padding:6px 10px; cursor:pointer; }
button:disabled{ opacity:0.6; cursor:not-allowed; }
.rank{ color:#0f8; font-weight:600; }
.error{ color:#f55; margin-left: 8px; }
</style>
