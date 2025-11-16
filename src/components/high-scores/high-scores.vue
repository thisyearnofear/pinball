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
        
        <!-- Connect Wallet Prompt (only for non-connected users) -->
        <div v-if="!isWalletConnected" class="wallet-prompt">
            <p>🏆 Join the tournament to compete for real prizes!</p>
            <button @click="connectWallet" class="connect-btn">
                {{ $t('ui.connectForTournament') }}
            </button>
        </div>

        <!-- Tournament Prize Information -->
        <div v-if="tournamentInfo" class="tournament-info">
            <div class="prize-pool">
                <h3>💰 Current Prize Pool</h3>
                <div class="prize-amount">{{ displayPot }}</div>
                <div class="prize-details">
                    <span>Entry Fee: {{ displayEntryFee }}</span>
                    <span v-if="timeLabel">⏰ {{ timeLabel }} remaining</span>
                </div>
                
                <!-- Prize Splits for anonymous users -->
                <div v-if="prizeSplits.length > 0" class="prize-splits-anon">
                    <div class="prize-splits-anon__title">Prize Distribution</div>
                    <div class="prize-splits-anon__grid">
                        <div 
                            v-for="(split, index) in prizeSplits" 
                            :key="index" 
                            class="prize-split-anon"
                        >
                            <div class="prize-split-anon__rank">{{ split.rank }}</div>
                            <div class="prize-split-anon__amount">{{ split.amount }}</div>
                            <div class="prize-split-anon__percentage">{{ split.percentage }}%</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

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

        <!-- Call to Action for anonymous users -->
        <div v-if="!isWalletConnected && formattedScores.length > 0" class="cta-section">
            <p>🎯 Think you can beat these scores?</p>
            <button @click="connectWallet" class="cta-btn">
                Join Tournament & Compete for Prizes
            </button>
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
    }),
    computed: {
        isWalletConnected(): boolean {
            return web3Service.isConnected();
        },
        formattedScores(): HighScoreDef[] {
            const filteredScores = this.scores.filter(({ score }) => score > 0 );
            return filteredScores.map( replaceDiacritics );
        },
        displayPot(): string {
            if (!this.tournamentInfo) return '';
            const v = Number(ethers.formatEther(this.tournamentInfo.totalPot));
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
        },
        displayEntryFee(): string {
            if (!this.tournamentInfo) return '';
            const v = Number(ethers.formatEther(this.tournamentInfo.entryFee));
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
    methods: {
        async onRefresh() {
            try {
                await this.loadTournamentInfo();
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
            await this.loadTournamentInfo();
            
            // Then try to load scores for social proof
            this.scores = await getHighScores();
        } catch (error) {
            console.log('Could not load tournament data:', error);
            // If tournament data fails, we can still show the component
            this.scores = [];
        }
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
    margin-bottom: $spacing-large;
}

.prize-pool {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.1));
    border: 1px solid rgba(255, 215, 0, 0.3);
    border-radius: 12px;
    padding: $spacing-large;
    text-align: center;
    
    h3 {
        @include titleFont();
        color: #FFD700;
        margin-bottom: $spacing-medium;
        font-size: 18px;
    }
    
    .prize-amount {
        @include titleFont();
        color: #FFF;
        font-size: 32px;
        font-weight: bold;
        margin-bottom: $spacing-small;
        text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
    }
    
    .prize-details {
        display: flex;
        justify-content: space-around;
        flex-wrap: wrap;
        gap: $spacing-small;
        color: #FFD700;
        font-size: 14px;
        
        span {
            background: rgba(0, 0, 0, 0.3);
            padding: 4px 12px;
            border-radius: 20px;
            border: 1px solid rgba(255, 215, 0, 0.2);
        }
    }
    
    @include mobile() {
        .prize-amount {
            font-size: 24px;
        }
        
        .prize-details {
            flex-direction: column;
            align-items: center;
        }
    }
}

.prize-splits-anon {
    margin-top: $spacing-medium;
    padding-top: $spacing-medium;
    border-top: 1px solid rgba(255, 215, 0, 0.2);
}

.prize-splits-anon__title {
    font-weight: bold;
    color: #FFD700;
    margin-bottom: 12px;
    font-size: 14px;
}

.prize-splits-anon__grid {
    display: flex;
    gap: 8px;
    justify-content: center;
    max-width: 300px;
    margin: 0 auto;
}

.prize-split-anon {
    flex: 1;
    text-align: center;
    padding: 10px 6px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 215, 0, 0.3);
    border-radius: 6px;
}

.prize-split-anon__rank {
    font-weight: bold;
    color: #FFD700;
    font-size: 12px;
    margin-bottom: 4px;
}

.prize-split-anon__amount {
    font-size: 11px;
    color: #FFF;
    font-family: monospace;
    margin-bottom: 2px;
    line-height: 1.2;
}

.prize-split-anon__percentage {
    font-size: 10px;
    color: #999;
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
        color: #666;
        min-width: 40px;
        margin-right: $spacing-small;
        font-size: 14px;
    }

    &__name {
        @include titleFont();
        color: $color-titles;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        flex: 1;
    }

    &__score {
        @include titleFont();
        max-width: 200px;
        text-align: right;
        color: magenta;

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

.wallet-prompt {
    text-align: center;
    padding: $spacing-medium;
    margin-bottom: $spacing-medium;
    background: rgba(0, 255, 136, 0.08);
    border: 1px solid rgba(0, 255, 136, 0.2);
    border-radius: 8px;
    
    p {
        color: #fff;
        margin-bottom: $spacing-medium;
        font-size: 16px;
        font-weight: bold;
    }
    
    .connect-btn {
        @include titleFont(16px);
        padding: 12px 24px;
        background: linear-gradient(135deg, $color-anchors, #00cc88);
        border: none;
        border-radius: 6px;
        color: #000;
        cursor: pointer;
        transition: all 0.3s ease;
        
        &:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
        }
    }
}

.cta-section {
    text-align: center;
    padding: $spacing-large;
    background: rgba(255, 215, 0, 0.08);
    border: 1px solid rgba(255, 215, 0, 0.3);
    border-radius: 8px;
    margin-top: $spacing-medium;
    
    p {
        color: #FFD700;
        margin-bottom: $spacing-medium;
        font-size: 16px;
        font-weight: bold;
    }
    
    .cta-btn {
        @include titleFont(16px);
        padding: 14px 28px;
        background: linear-gradient(135deg, #FFD700, #FFA500);
        border: none;
        border-radius: 8px;
        color: #000;
        cursor: pointer;
        transition: all 0.3s ease;
        font-weight: bold;
        
        &:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(255, 215, 0, 0.4);
            background: linear-gradient(135deg, #FFF700, #FFB500);
        }
    }
}
</style>
