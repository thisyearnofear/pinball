/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2023 - https://www.igorski.nl
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
<template>
    <loader v-if="loading" />
    <template v-else>
        <!-- Tournament Status and Actions (only show for connected users) -->
        <div v-if="isWalletConnected">
            <TournamentStatus />
            <TournamentActions />
        </div>
        
        <!-- Tournament Info (compact) -->
        <div v-if="tournamentInfo" class="tournament-info">
            <div class="prize-pool">
                <div class="prize-amount">{{ displayPot }}</div>
                <div class="prize-meta">
                    <span>{{ displayEntryFee }} entry</span>
                    <span v-if="timeLabel">{{ timeLabel }} left</span>
                </div>
            </div>
        </div>
        
        <!-- Connect Wallet CTA (compact) -->
        <button v-if="!isWalletConnected" @click="connectWallet" class="connect-cta">
            Connect Wallet to Compete
        </button>

        <!-- Leaderboard (always visible for social proof) -->
        <div class="leaderboard-section">
            <h3 class="leaderboard-title">
                {{ isWalletConnected ? 'Tournament Leaderboard' : 'Current Leaders' }}
            </h3>
            <div v-if="formattedScores.length === 0" class="empty-leaderboard">
                <div class="empty-message">
                    <p>🏆 <strong>No scores yet - Be the first!</strong></p>
                    <p v-if="tournamentInfo">Prize pool of <strong>{{ displayPot }}</strong> waiting for winners!</p>
                    <a href="#" @click.prevent="onRefresh" class="refresh-link">Refresh Leaderboard</a>
                </div>
            </div>
            <div v-else>
                <div
                    v-for="( entry, index ) in formattedScores"
                    :key="`c_${index}`"
                    class="highscores-entry"
                    :class="{ 'highscores-entry--highlight': entry.isCurrentUser }"
                >
                    <span class="highscores-entry__rank">#{{ index + 1 }}</span>
                    <span class="highscores-entry__name">{{ entry.name }}</span>
                    <span class="highscores-entry__score">
                        <span
                            v-for="( number, idx ) in entry.score"
                            :key="`s_${idx}`"
                            :class="`highscores-entry__score-number-${number}`"
                        >
                            {{ number }}
                        </span>
                    </span>
                </div>
            </div>
        </div>
    </template>
</template>

<script lang="ts">
import Loader from "@/components/loader/loader.vue";
import TournamentStatus from "@/components/high-scores/TournamentStatus.vue";
import TournamentActions from "@/components/high-scores/TournamentActions.vue";
import type { HighScoreDef } from "@/services/high-scores-service";
import { getHighScores } from "@/services/high-scores-service";
import { web3Service } from "@/services/web3-service";
import { useTournamentState } from "@/model/tournament-state";
import { getActiveTournamentId, fetchLeaderboard, getTournamentInfo, getEntryFeeWei, getPrizeBps } from "@/services/contracts/tournament-client";
import { ethers } from "ethers";

// our fancy font has some challenges for our presentation purposes
// for one, it does not support diacritics, fallback to the unaccented character
// for the other, the number "1" is not equally spaced, split the characters so
// we can space them individually (at the expensive of DOM pollution, but meh...)

const replaceDiacritics = ( def: HighScoreDef ): HighScoreDef => ({
    score: def.score.toString().split( "" ),
    name: def.name.normalize( "NFKD" ).replace( /[^\w\s.-_\/]/g, "" ),
});

interface ComponentData {
    loading: boolean;
    scores: HighScoreDef[];
    tournamentInfo: {
        totalPot: bigint;
        entryFee: bigint;
        timeRemaining: number | null;
        participantCount: number;
        prizeBps: number[];
    } | null;
};

export default {
    components: {
        Loader,
        TournamentStatus,
        TournamentActions,
    },
    data: (): ComponentData => ({
        loading: true,
        scores: [],
        tournamentInfo: null,
        walletConnected: false,
    }),
    computed: {
        isWalletConnected(): boolean {
            return this.walletConnected;
        },
        formattedScores(): HighScoreDef[] {
            const filteredScores = this.scores.filter(({ score }) => score > 0 );
            return filteredScores.map( replaceDiacritics );
        },
        displayPot(): string {
            return this.tournamentInfo ? this.formatEth(this.tournamentInfo.totalPot) : '';
        },
        displayEntryFee(): string {
            return this.tournamentInfo ? this.formatEth(this.tournamentInfo.entryFee) : '';
        },
        timeLabel(): string {
            if (!this.tournamentInfo?.timeRemaining) return '';
            const hours = Math.floor(this.tournamentInfo.timeRemaining / 3600);
            const minutes = Math.floor((this.tournamentInfo.timeRemaining % 3600) / 60);
            if (hours > 0) return `${hours}h ${minutes}m`;
            return `${minutes}m`;
        },
        prizeSplits(): Array<{rank: string, amount: string, percentage: string}> {
            if (!this.tournamentInfo?.prizeBps.length || !this.tournamentInfo.totalPot) return [];
            
            return this.tournamentInfo.prizeBps.map((bps, index) => {
                const percentage = (bps / 100).toFixed(1);
                const wei = (this.tournamentInfo!.totalPot * BigInt(bps)) / 10000n;
                const rank = ['1st', '2nd', '3rd'][index] || `${index + 1}th`;
                
                return {
                    rank,
                    amount: this.formatEth(wei),
                    percentage
                };
            });
        },
    },
    methods: {
        formatEth(wei: bigint): string {
            const v = Number(ethers.formatEther(wei));
            const decimals = v < 0.01 ? 6 : v < 1 ? 4 : 3;
            return `${v.toFixed(decimals)} ETH`;
        },
        async onRefresh() {
            try {
                await (this.$options as any).loadTournamentInfo.call(this);
                this.scores = await getHighScores();
            } catch (error) {
                console.log('Refresh failed:', error);
            }
        },
        async connectWallet() {
            try {
                await web3Service.connect('metamask');
                // Load scores after connection
                if (web3Service.isConnected()) {
                    this.walletConnected = true;
                    this.scores = await getHighScores();
                }
            } catch (error) {
                console.error('Wallet connection failed:', error);
            }
        }
    },
    async mounted(): Promise<void> {
        try {
            // Load tournament information first (works without wallet)
            await (this.$options as any).loadTournamentInfo.call(this);
            
            // Then try to load scores for social proof
            this.scores = await getHighScores();
        } catch (error) {
            console.log('Could not load tournament data:', error);
            // If tournament data fails, we can still show the component
            this.scores = [];
        }
        this.walletConnected = web3Service.isConnected();
        web3Service.on('connected', () => { this.walletConnected = true; });
        web3Service.on('disconnected', () => { this.walletConnected = false; });

        this.loading = false;
    },
    
    async loadTournamentInfo(): Promise<void> {
        try {
            const tournamentId = await getActiveTournamentId();
            const [info, entryFee, leaderboard, prizeBps] = await Promise.all([
                getTournamentInfo(tournamentId),
                getEntryFeeWei(),
                fetchLeaderboard(tournamentId, 0, 100),
                getPrizeBps(tournamentId).catch(() => []) // Fallback to empty array if fails
            ]);
            
            const now = Math.floor(Date.now() / 1000);
            const timeRemaining = info.endTime > now ? info.endTime - now : null;
            
            this.tournamentInfo = {
                totalPot: info.totalPot,
                entryFee,
                timeRemaining,
                participantCount: leaderboard.length,
                prizeBps
            };
        } catch (error) {
            console.log('Failed to load tournament info:', error);
            this.tournamentInfo = null;
        }
    },
};
</script>

<style lang="scss" scoped>
@import "@/styles/_variables";
@import "@/styles/_mixins";
@import "@/styles/_typography";

.tournament-info {
    margin-bottom: $spacing-medium;
}

.prize-pool {
    text-align: center;
    padding: $spacing-medium;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    
    .prize-amount {
        @include titleFont();
        color: #FFD700;
        font-size: 24px;
        font-weight: bold;
        margin-bottom: $spacing-xsmall;
    }
    
    .prize-meta {
        display: flex;
        justify-content: center;
        gap: $spacing-medium;
        color: $color-anchors;
        font-size: 12px;
    }
}

.leaderboard-section {
    margin-bottom: $spacing-large;
}

.leaderboard-title {
    @include titleFont();
    color: $color-titles;
    margin-bottom: $spacing-medium;
    text-align: center;
    font-size: 20px;
}

.highscores-entry {
    display: flex;
    align-items: center;
    padding: $spacing-small;
    margin-bottom: 2px;
    border-radius: 4px;
    
    &--highlight {
        background: rgba(0, 255, 136, 0.1);
        border: 1px solid rgba(0, 255, 136, 0.3);
    }

    &__rank {
        @include titleFont();
        color: $color-anchors;
        min-width: 40px;
        margin-right: $spacing-small;
        font-size: 16px;
        font-weight: bold;
    }

    &__name {
        @include titleFont();
        color: $color-text-alt;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        flex: 1;
        font-size: 16px;
    }

    &__score {
        @include titleFont();
        max-width: 200px;
        text-align: right;
        color: $color-titles;

        &-number-1 {
            margin: 0 0.1em;
        }
    }

    @include mobile() {
        &__rank {
            min-width: 30px;
            font-size: 12px;
        }
        &__name,
        &__score {
            font-size: 18px;
        }
    }
}
.empty-leaderboard {
    text-align: center;
    padding: $spacing-large;
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed rgba(255, 255, 255, 0.1);
    border-radius: 8px;
}

.empty-message {
    p {
        color: #FFF;
        margin-bottom: $spacing-small;
        
        &:first-child {
            font-size: 18px;
            margin-bottom: $spacing-medium;
        }
        
        strong {
            color: #FFD700;
        }
    }
    
    .refresh-link {
        color: $color-anchors;
        text-decoration: underline;
        cursor: pointer;
        font-size: 14px;
        
        &:hover {
            color: #00ff88;
        }
    }
}

.connect-cta {
    @include titleFont();
    width: 100%;
    padding: $spacing-medium;
    margin-bottom: $spacing-medium;
    background: $color-anchors;
    border: none;
    border-radius: 6px;
    color: #000;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s ease;
    
    &:hover {
        background: #00ff88;
        transform: translateY(-1px);
    }
}
</style>
