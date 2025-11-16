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
    <div class="tournament-summary">
      <div class="summary-item">
        <div class="summary-label">Entry Fee</div>
        <div class="summary-value">{{ formattedFee }}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Total Pot</div>
        <div class="summary-value">{{ formattedPot }}</div>
      </div>
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
    <div v-if="prizeSplits.length > 0" class="prize-splits">
      <div class="prize-splits__title">Prize Distribution:</div>
      <div class="prize-splits__grid">
        <div 
          v-for="(split, index) in prizeSplits" 
          :key="index" 
          class="prize-split"
        >
          <div class="prize-split__rank">{{ split.rank }}</div>
          <div class="prize-split__amount">{{ split.amount }}</div>
          <div class="prize-split__percentage">{{ split.percentage }}%</div>
        </div>
      </div>
    </div>
    <div v-else class="note">
      Payouts are distributed to the top {{ topN || '-' }} winner(s) based on the tournament's configured split.
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { getContractsConfig } from '@/config/contracts';
import { useTournamentState } from '@/model/tournament-state';
import { web3Service } from '@/services/web3-service';

const { tournamentId, entryFeeWei, finalized, totalPotWei, endTime, topN, timeRemainingSec, prizeBps, load } = useTournamentState();
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
  // Show more decimals for small amounts
  if (v < 0.01) {
    return `${v.toFixed(6)} ETH`;
  } else if (v < 1) {
    return `${v.toFixed(4)} ETH`;
  } else {
    return `${v.toFixed(3)} ETH`;
  }
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

const prizeSplits = computed(() => {
  if (!prizeBps.value?.length || !totalPotWei.value) return [];
  
  return prizeBps.value.map((bps, index) => {
    const percentage = (bps / 100).toFixed(1);
    const wei = (totalPotWei.value * BigInt(bps)) / 10000n;
    const amount = toEth(wei);
    const rank = index === 0 ? '1st' : index === 1 ? '2nd' : index === 2 ? '3rd' : `${index + 1}th`;
    
    return {
      rank,
      amount,
      percentage
    };
  });
});

async function refresh(){
  await load();
  try {
    const net = await web3Service.getProvider()?.getNetwork();
    providerChainId.value = net ? Number(net.chainId) : null;
  } catch {}
}

async function switchChain(){
  try {
    await web3Service.switchChain(chainId.value);
    
    // Wait for network to stabilize and retry check with backoff
    let retries = 0;
    const maxRetries = 5;
    
    while (retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 800 + (retries * 400)));
      await refresh();
      
      if (!wrongChain.value) {
        console.log('Successfully switched to Arbitrum One!');
        break;
      }
      
      retries++;
    }
    
    if (wrongChain.value) {
      throw new Error('Network switch verification failed after multiple attempts');
    }
  } catch (error: any) {
    console.error('Failed to switch chain:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to switch network. ';
    
    if (error.code === 4001) {
      errorMessage += 'You rejected the network switch request.';
    } else if (error.code === 4902) {
      errorMessage += 'Arbitrum One needs to be added to your wallet first.';
    } else if (error.message?.includes('User rejected')) {
      errorMessage += 'You rejected the network switch request.';
    } else {
      errorMessage += 'Please try switching manually in your wallet.';
    }
    
    console.warn(errorMessage);
  }
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

.tournament-summary {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin: 12px 0;
  padding: 8px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 6px;
}

.summary-item {
  text-align: center;
  flex: 1;
}

.summary-label {
  font-size: 11px;
  color: #999;
  margin-bottom: 4px;
}

.summary-value {
  font-weight: bold;
  color: #FFF;
  font-size: 13px;
  font-family: monospace;
}

.prize-splits {
  margin-top: 12px;
  padding: 10px;
  background: rgba(255, 215, 0, 0.08);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 6px;
}

.prize-splits__title {
  font-weight: bold;
  color: #FFD700;
  margin-bottom: 8px;
  font-size: 13px;
}

.prize-splits__grid {
  display: flex;
  gap: 6px;
  justify-content: center;
  max-width: 280px;
  margin: 0 auto;
}

.prize-split {
  flex: 1;
  min-width: 60px;
  text-align: center;
  padding: 8px 4px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 4px;
}

.prize-split__rank {
  font-weight: bold;
  color: #FFD700;
  font-size: 11px;
  margin-bottom: 2px;
}

.prize-split__amount {
  font-size: 10px;
  color: #FFF;
  font-family: monospace;
  margin-bottom: 2px;
}

.prize-split__percentage {
  font-size: 9px;
  color: #999;
}
</style>
