<template>
  <section class="celebration" @click="onDismiss">
    <div class="celebration__wrapper">
      <h3 class="celebration__title">{{ isPracticeMode ? 'Great Practice Run!' : 'Well played!' }}</h3>
      <div class="celebration__score">Score: {{ score }}</div>
      
      <!-- Practice Mode Information -->
      <div v-if="isPracticeMode" class="celebration__practice-info">
        <div class="celebration__practice-title">🎯 Tournament Preview</div>
        <div class="celebration__practice-text">Your score would rank {{ practiceRank }} on the leaderboard!</div>
        <div class="celebration__pot" v-if="displayPot">Current Pot: {{ displayPot }}</div>
        <div class="celebration__potential-earnings" v-if="potentialEarnings">
          You could have earned: {{ potentialEarnings }}
        </div>
        <div class="celebration__cta">
          <strong>🚀 Ready to compete for real prizes?</strong>
        </div>
      </div>
      
      <!-- Tournament Mode Information -->
      <template v-else>
        <div class="celebration__tournament-info">
          <div class="celebration__pot" v-if="displayPot">
            <div class="celebration__pot-label">Prize Pool</div>
            <div class="celebration__pot-value">{{ displayPot }}</div>
          </div>
          <div class="celebration__time" v-if="timeLabel">⏰ Ends in {{ timeLabel }}</div>
          <div v-if="prizeSplits.length > 0" class="celebration__prize-splits">
            <div class="celebration__prize-title">Prize Distribution</div>
            <div class="celebration__prize-grid">
              <div 
                v-for="(split, index) in prizeSplits" 
                :key="index" 
                class="celebration__prize-split"
              >
                <div class="celebration__prize-rank">{{ split.rank }}</div>
                <div class="celebration__prize-amount">{{ split.amount }}</div>
                <div class="celebration__prize-percentage">{{ split.percentage }}%</div>
              </div>
            </div>
          </div>
        </div>
      </template>
      <div class="celebration__leaderboard" v-if="entries.length">
        <div class="celebration__leaderboard-title">Leaderboard</div>
        <div class="celebration__leaderboard-rows">
          <div
            v-for="(row, idx) in entries"
            :key="row.address + idx"
            class="celebration__row"
            :class="{ 'celebration__row--me': row.address.toLowerCase() === me.toLowerCase() }"
          >
            <span class="celebration__rank">{{ idx + 1 }}</span>
            <span class="celebration__addr">{{ short(row.address) }}</span>
            <span class="celebration__row-score">{{ row.score }}</span>
          </div>
        </div>
      </div>
      <div class="celebration__actions">
        <button 
          type="button" 
          class="celebration__btn celebration__btn--primary" 
          @click.stop="onPlayAgain"
        >
          {{ isPracticeMode ? 'Practice Again' : 'Play Again' }}
        </button>
        <button 
          v-if="isPracticeMode" 
          type="button" 
          class="celebration__btn celebration__btn--tournament" 
          @click.stop="onPlayTournament"
        >
          🏆 Play Tournament
        </button>
        <button type="button" class="celebration__btn" @click.stop="onViewLeaderboard">View Full Leaderboard</button>
        <button type="button" class="celebration__btn" @click.stop="onShare">Share on Farcaster</button>
      </div>
    </div>
    <div class="celebration__confetti"></div>
  </section>
</template>

<script lang="ts">
import { defineAsyncComponent } from 'vue';
import { ethers } from 'ethers';
import { useTournamentState } from '@/model/tournament-state';
import { web3Service } from '@/services/web3-service';

export default {
  props: {
    score: { type: Number, required: true },
    isPracticeMode: { type: Boolean, default: false },
    lastSubmittedScores: { type: Array, default: null },
  },
  data: () => ({
    me: web3Service.getAddress() || '',
    entries: [] as { address: string; score: number }[],
    totalPotWei: 0n,
    prizeBps: [] as number[],
    timeRemainingSec: 0 as number | null,
  }),
  computed: {
    displayPot(): string | '' {
      try { 
        const v = Number(ethers.formatEther(this.totalPotWei));
        // Show more decimals for small amounts
        let eth;
        if (v < 0.01) {
          eth = v.toFixed(6);
        } else if (v < 1) {
          eth = v.toFixed(4);
        } else {
          eth = v.toFixed(3);
        }
        return `${eth} ETH`;
      } catch { return ''; }
    },
    timeLabel(): string {
      if (!this.timeRemainingSec && this.timeRemainingSec !== 0) return '';
      const s = Math.max(0, Number(this.timeRemainingSec));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const parts: string[] = [];
      if (h) parts.push(`${h}h`);
      if (m) parts.push(`${m}m`);
      if (!h && !m) parts.push(`${sec}s`);
      return parts.join(' ');
    },
    prizeSplitLabel(): string {
      if (!this.prizeBps || !this.prizeBps.length || !this.totalPotWei) return '';
      const parts = this.prizeBps.map((bps, idx) => {
        const wei = (this.totalPotWei * BigInt(bps)) / 10000n;
        const v = Number(ethers.formatEther(wei));
        const percentage = (bps / 100).toFixed(1);
        
        // Show more decimals for small amounts
        let eth;
        if (v < 0.01) {
          eth = v.toFixed(6);
        } else if (v < 1) {
          eth = v.toFixed(4);
        } else {
          eth = v.toFixed(3);
        }
        
        const rank = `${idx + 1}${idx === 0 ? 'st' : idx === 1 ? 'nd' : idx === 2 ? 'rd' : 'th'}`;
        return `${rank}: ${eth} ETH (${percentage}%)`;
      });
      return parts.join(' • ');
    },
    practiceRank(): string {
      if (!this.isPracticeMode || !this.entries.length) return '';
      
      // Find where this score would rank
      let rank = 1;
      for (const entry of this.entries) {
        if (this.score <= entry.score) {
          rank++;
        } else {
          break;
        }
      }
      
      const suffix = rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th';
      return `${rank}${suffix}`;
    },
    potentialEarnings(): string {
      if (!this.isPracticeMode || !this.entries.length || !this.prizeBps.length || !this.totalPotWei) return '';
      
      // Calculate what rank this score would achieve
      let rank = 1;
      for (const entry of this.entries) {
        if (this.score <= entry.score) {
          rank++;
        } else {
          break;
        }
      }
      
      // Check if this rank would win a prize
      if (rank <= this.prizeBps.length && rank > 0) {
        const bps = this.prizeBps[rank - 1];
        const wei = (this.totalPotWei * BigInt(bps)) / 10000n;
        const eth = Number(ethers.formatEther(wei)).toFixed(4);
        return `${eth} ETH`;
      }
      
      return '';
    },
    prizeSplits(): Array<{rank: string, amount: string, percentage: string}> {
      if (!this.prizeBps?.length || !this.totalPotWei) return [];
      
      return this.prizeBps.map((bps, index) => {
        const percentage = (bps / 100).toFixed(1);
        const wei = (this.totalPotWei * BigInt(bps)) / 10000n;
        const v = Number(ethers.formatEther(wei));
        
        // Show more decimals for small amounts
        let eth;
        if (v < 0.01) {
          eth = v.toFixed(6);
        } else if (v < 1) {
          eth = v.toFixed(4);
        } else {
          eth = v.toFixed(3);
        }
        
        const rank = index === 0 ? '1st' : index === 1 ? '2nd' : index === 2 ? '3rd' : `${index + 1}th`;
        
        return {
          rank,
          amount: `${eth} ETH`,
          percentage
        };
      });
    },
  },
  async mounted(): Promise<void> {
    await this.loadTournamentData();
  },
  
  async loadTournamentData(): Promise<void> {
    try {
      // Try to load tournament data using the direct client methods (like high-scores component)
      const { getActiveTournamentId, fetchLeaderboard, fetchLeaderboardWithRetry, getTournamentInfo, getPrizeBps } = await import('@/services/contracts/tournament-client');
      
      const tournamentId = await getActiveTournamentId();
      
      // For celebration after score submission, use enhanced fetch with retry logic
      // This helps with blockchain finality issues where the score might not be immediately visible
      let leaderboard;
      if (this.lastSubmittedScores) {
        // If we just submitted a score, use retry logic to wait for it to appear on chain
        leaderboard = await fetchLeaderboardWithRetry(tournamentId, 0, 100);
      } else {
        leaderboard = await fetchLeaderboard(tournamentId, 0, 100);
      }
      
      const [info, prizeBps] = await Promise.all([
        getTournamentInfo(tournamentId),
        getPrizeBps(tournamentId).catch(() => []) // Fallback to empty array if prizeBps fails
      ]);
      
      this.entries = leaderboard.slice(0, 10);
      
      this.totalPotWei = info.totalPot;
      this.prizeBps = prizeBps;
      
      const now = Math.floor(Date.now() / 1000);
      this.timeRemainingSec = info.endTime > now ? info.endTime - now : null;
      
    } catch (error) {
      console.log('Tournament data not available for celebration:', error);
      // For practice mode, we can still show the celebration even if tournament data isn't available
      this.entries = [];
      this.totalPotWei = 0n;
      this.prizeBps = [];
      this.timeRemainingSec = null;
    }
  },
  methods: {
    onPlayAgain(): void { this.$emit('play-again'); },
    onViewLeaderboard(): void { this.$emit('view-leaderboard'); },
    onDismiss(): void { this.$emit('dismiss'); },
    onPlayTournament(): void { this.$emit('play-tournament'); },
    short(addr: string): string { return `${addr.slice(0,6)}...${addr.slice(-4)}`; },
    async onShare(): Promise<void> {
      const text = `I just scored ${this.score} in ArbiPinball!`;
      try {
        const mod: any = await import('@farcaster/miniapp-sdk');
        const fc = mod?.default ?? mod;
        if (typeof fc?.actions?.openUrl === 'function') {
          const url = `https://warpcast.com/compose?text=${encodeURIComponent(text)}`;
          await fc.actions.openUrl(url);
          return;
        }
      } catch {}
      try {
        await navigator.clipboard.writeText(text);
        alert('Copied score to clipboard!');
      } catch {}
    },
  },
};
</script>

<style lang="scss" scoped>
@import "@/styles/_mixins";
@import "@/styles/_variables";
@import "@/styles/_typography";

.celebration {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  z-index: 10;

  &__wrapper { @include center(); text-align: center; }
  &__title { @include titleFontGradient(); color: #FFF; }
  &__score { @include titleFont(24px); color: #FFF; margin-bottom: $spacing-small; }
  &__pot, &__time, &__prize { color: #CCC; margin: $spacing-small 0; }
  &__leaderboard { margin-top: $spacing-medium; }
  &__leaderboard-title { color: #FFF; margin-bottom: $spacing-small; }
  &__leaderboard-rows { max-height: 200px; overflow: auto; }
  &__row { display: flex; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.06); margin-bottom: 6px; }
  &__row--me { background: rgba(0, 255, 136, 0.15); border: 1px solid rgba(0, 255, 136, 0.4); }
  &__rank, &__addr, &__row-score { color: #FFF; font-family: monospace; }
  &__practice-info { margin-top: $spacing-medium; padding: $spacing-medium; background: rgba(0, 255, 136, 0.08); border: 1px solid rgba(0, 255, 136, 0.2); border-radius: 8px; }
  &__practice-title { color: #00ff88; font-weight: bold; margin-bottom: $spacing-small; }
  &__practice-text { color: #FFF; margin-bottom: $spacing-small; }
  &__potential-earnings { color: #00ff88; font-weight: bold; margin: $spacing-small 0; }
  &__cta { color: #FFF; margin-top: $spacing-small; font-size: 14px; }
  
  &__tournament-info { margin-top: $spacing-medium; text-align: center; }
  
  &__pot { margin-bottom: $spacing-small; }
  &__pot-label { font-size: 12px; color: #999; margin-bottom: 4px; }
  &__pot-value { font-size: 18px; font-weight: bold; color: #FFD700; }
  
  &__time { font-size: 12px; color: #ccc; margin-bottom: $spacing-medium; }
  
  &__prize-splits { margin-top: $spacing-small; }
  &__prize-title { font-size: 13px; color: #FFD700; font-weight: bold; margin-bottom: 8px; }
  
  &__prize-grid {
    display: flex;
    gap: 6px;
    justify-content: center;
    max-width: 240px;
    margin: 0 auto;
  }
  
  &__prize-split {
    flex: 1;
    text-align: center;
    padding: 8px 4px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 215, 0, 0.3);
    border-radius: 4px;
  }
  
  &__prize-rank {
    font-weight: bold;
    color: #FFD700;
    font-size: 11px;
    margin-bottom: 2px;
  }
  
  &__prize-amount {
    font-size: 9px;
    color: #FFF;
    font-family: monospace;
    margin-bottom: 2px;
  }
  
  &__prize-percentage {
    font-size: 8px;
    color: #999;
  }
  &__actions { margin-top: $spacing-medium; display: flex; gap: $spacing-small; justify-content: center; flex-wrap: wrap; }
  &__btn { padding: 10px 16px; border: 1px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.08); color: #FFF; border-radius: 6px; cursor: pointer; transition: all 0.2s ease; }
  &__btn:hover { background: rgba(255,255,255,0.15); transform: translateY(-1px); }
  &__btn--primary { background: rgba(0, 255, 136, 0.15); border-color: rgba(0, 255, 136, 0.4); }
  &__btn--tournament { background: linear-gradient(135deg, #FFD700, #FFA500); color: #000; border-color: #FFD700; font-weight: bold; }
  &__btn--tournament:hover { background: linear-gradient(135deg, #FFF700, #FFB500); }
  &__confetti { position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px); background-size: 20px 20px; animation: confetti 2s linear infinite; }
}

@keyframes confetti { 0% { background-position: 0% 0%; } 100% { background-position: 100% 100%; } }
</style>