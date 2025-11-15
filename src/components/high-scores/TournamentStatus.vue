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
    <div class="row">
      <span>Total Pot:</span>
      <strong>{{ formattedPot }}</strong>
    </div>
    <div class="row" v-if="!finalized">
      <span>Ends:</span>
      <strong>{{ endLabel }}</strong>
      <span v-if="timeRemainingLabel">(in {{ timeRemainingLabel }})</span>
    </div>
    <div class="row" v-if="finalized">
      <span>Status:</span>
      <strong>Finalized</strong>
    </div>
    <div class="note">
      Payouts are distributed to the top {{ topN || '-' }} winner(s) based on the tournament's configured split.
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { getContractsConfig } from '@/config/contracts';
import { useTournamentState } from '@/model/tournament-state';
import { web3Service } from '@/services/web3-service';

const { tournamentId, entryFeeWei, finalized, totalPotWei, endTime, topN, timeRemainingSec, load } = useTournamentState();
const providerChainId = ref<number | null>(null);

const chainId = computed(() => getContractsConfig().chainId);
const contractAddress = computed(() => getContractsConfig().tournamentManager.address);
const shortAddress = computed(() => {
  const a = web3Service.getAddress();
  if (!a) return '-';
  return `${a.substring(0,6)}...${a.substring(a.length-4)}`;
});
const toEth = (wei?: bigint | null) => {
  if (!wei) return '0 ETH';
  const v = Number(wei) / 1e18;
  return `${v} ETH`;
};
const formattedFee = computed(() => toEth(entryFeeWei.value));
const formattedPot = computed(() => toEth(totalPotWei.value));
const endLabel = computed(() => {
  if (!endTime.value) return '-';
  const d = new Date(endTime.value * 1000);
  return d.toLocaleString();
});
const timeRemainingLabel = computed(() => {
  if (timeRemainingSec.value == null) return '';
  const s = timeRemainingSec.value;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [] as string[];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!h && !m) parts.push(`${sec}s`);
  return parts.join(' ');
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
.note{ margin-top:6px; opacity:0.8; font-size:12px; }
</style>
