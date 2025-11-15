<template>
  <div class="tournament-actions">
    <button :disabled="!canEnter || busy" @click="onEnter">{{ entered ? 'Already Entered' : 'Enter Tournament' }}</button>
    <button :disabled="!canClaim || busy" @click="onClaim">Claim Reward</button>
    <span v-if="error" class="error">{{ error }}</span>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTournamentState } from '@/model/tournament-state';
import { getContractsConfig } from '@/config/contracts';
import { web3Service } from '@/services/web3-service';

const { tournamentId, finalized, isWinner, entered, enter, claim, refreshLeaderboard } = useTournamentState();
const busy = ref(false);
const error = ref('');

const canEnter = computed(() => !!web3Service.getAddress() && !!tournamentId.value && !finalized.value && !entered.value);
const canClaim = computed(() => !!web3Service.getAddress() && !!tournamentId.value && finalized.value && isWinner.value);

async function onEnter(){
  error.value = '';
  try{
    busy.value = true;
    await enter();
    await refreshLeaderboard();
  }catch(e:any){ error.value = e?.message || 'Enter failed'; }
  finally{ busy.value = false; }
}

async function onClaim(){
  error.value = '';
  try{
    busy.value = true;
    await claim();
    await refreshLeaderboard();
  }catch(e:any){ error.value = e?.message || 'Claim failed'; }
  finally{ busy.value = false; }
}
</script>
<style scoped>
.tournament-actions{ display:flex; gap:8px; align-items:center; margin-bottom: 12px; }
button{ padding:6px 10px; cursor:pointer; }
button:disabled{ opacity:0.6; cursor:not-allowed; }
.error{ color:#f55; margin-left: 8px; }
</style>
