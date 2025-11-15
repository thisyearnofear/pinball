<template>
  <div class="tournament-status">
    <div v-if="wrongChain" class="banner">
      <span>Wrong network. Please switch to Arbitrum One ({{ chainId }}).</span>
      <button @click="switchChain">Switch Network</button>
    </div>
    <div class="row">
      <span>Wallet:</span>
      <strong>{{ shortAddress }}</strong>
      <button class="refresh" @click="refresh">Refresh</button>
    </div>
    <div class="row">
      <span>Chain:</span>
      <strong>{{ chainId }}</strong>
    </div>
    <div class="row">
      <span>Contract:</span>
      <strong class="mono">{{ contractAddress }}</strong>
    </div>
    <div class="row">
      <span>Tournament:</span>
      <strong>{{ tournamentId ?? '-' }}</strong>
    </div>
    <div class="row">
      <span>Entry Fee:</span>
      <strong>{{ formattedFee }}</strong>
    </div>
    <div class="row" v-if="finalized">
      <span>Status:</span>
      <strong>Finalized</strong>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { getContractsConfig } from '@/config/contracts';
import { useTournamentState } from '@/model/tournament-state';
import { web3Service } from '@/services/web3-service';

const { tournamentId, entryFeeWei, finalized, load } = useTournamentState();
const providerChainId = ref<number | null>(null);

const chainId = computed(() => getContractsConfig().chainId);
const contractAddress = computed(() => getContractsConfig().tournamentManager.address);
const shortAddress = computed(() => {
  const a = web3Service.getAddress();
  if (!a) return '-';
  return `${a.substring(0,6)}...${a.substring(a.length-4)}`;
});
const formattedFee = computed(() => {
  const fee = Number(entryFeeWei.value) / 1e18;
  return `${fee} ETH`;
});
const wrongChain = computed(() => providerChainId.value !== null && providerChainId.value !== chainId.value);

async function refresh(){
  await load();
  try {
    const net = await web3Service.getProvider()?.getNetwork();
    providerChainId.value = net ? Number(net.chainId) : null;
  } catch {}
}

async function switchChain(){
  await web3Service.switchChain(chainId.value);
  await refresh();
}

onMounted(async () => {
  try { await refresh(); } catch (e) { console.warn(e); }
});
</script>
<style scoped>
.tournament-status{ margin-bottom: 12px; font-size: 14px; }
.row{ display:flex; gap:8px; align-items:center; }
.mono{ font-family: monospace; }
.banner{ display:flex; gap:8px; align-items:center; background:#fdeccc; border:1px solid #f7c97c; padding:6px 8px; border-radius:6px; margin-bottom:8px; }
.refresh{ margin-left:auto; }
</style>
