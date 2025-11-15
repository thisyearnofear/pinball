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
        <div v-if="!isWalletConnected" class="wallet-prompt">
            <p>{{ $t('ui.connectWalletForScores') }}</p>
            <button @click="connectWallet" class="connect-btn">
                {{ $t('ui.connectForTournament') }}
            </button>
        </div>
        <div v-else>
            <TournamentStatus />
            <TournamentActions />
            <div v-if="formattedScores.length === 0" class="empty">No scores yet. <a href="#" @click.prevent="onRefresh">Refresh Leaderboard</a></div>
            <div v-else>
                <div
                    v-for="( entry, index ) in formattedScores"
                    :key="`c_${index}`"
                    class="highscores-entry"
                >
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
    }),
    computed: {
        isWalletConnected(): boolean {
            return web3Service.isConnected();
        },
        formattedScores(): HighScoreDef[] {
            const filteredScores = this.scores.filter(({ score }) => score > 0 );
            return filteredScores.map( replaceDiacritics );
        },
    },
    methods: {
        async onRefresh() {
            this.scores = await getHighScores();
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
        if (this.isWalletConnected) {
            this.scores = await getHighScores();
        }
        this.loading = false;
    },
};
</script>

<style lang="scss" scoped>
@import "@/styles/_variables";
@import "@/styles/_mixins";
@import "@/styles/_typography";

.highscores-entry {
    display: flex;
    justify-content: space-between;

    &__name {
        @include titleFont();
        color: $color-titles;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
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
        &__name,
        &__score {
            font-size: 24px;
        }
    }
}
.empty{ margin: 8px 0; opacity: 0.7; }
.empty a{ color: #66f; text-decoration: underline; cursor: pointer; }

.wallet-prompt {
    text-align: center;
    padding: $spacing-large;
    
    p {
        color: #ccc;
        margin-bottom: $spacing-medium;
        font-size: 14px;
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
</style>
