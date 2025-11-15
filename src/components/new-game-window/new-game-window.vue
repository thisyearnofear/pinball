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
    <fieldset
        class="ps-fieldset"
        @keydown.enter="handlePrimaryAction()"
        @keyup.left="previousTable()"
        @keyup.right="nextTable()"
    >
        <div class="title">
            <div class="title__wrapper">
                <img src="@@/sprites/title_upper.png" class="title__upper" />
                <img src="@@/sprites/title_lower.png" class="title__lower" />
            </div>
        </div>

        <!-- Wallet Connection Section (Primary for tournaments) -->
        <div v-if="!isWalletConnected" class="wallet-section">
            <div class="wallet-prompt">
                <h3>{{ $t('ui.connectWallet') }}</h3>
                <p>{{ $t('ui.walletExplanation') }}</p>
                <div class="wallet-buttons">
                    <button
                        class="wallet-button wallet-button--primary"
                        :disabled="connecting"
                        @click="$emit('request-wallet-connect')"
                    >
                        {{ connecting ? $t('ui.connecting') : $t('ui.connectForTournament') }}
                    </button>
                </div>
            </div>
            <div class="quick-play-separator">
                <span>{{ $t('ui.or') }}</span>
            </div>
            <div class="quick-play-section">
                <p class="quick-play-note">{{ $t('ui.practiceNote') }}</p>
            </div>
        </div>

        <!-- Connected State -->
        <div v-else class="wallet-connected">
            <div class="wallet-status">
                <span class="wallet-label">{{ $t('ui.connected') }}:</span>
                <span class="wallet-address">{{ shortAddress }}</span>
            </div>
        </div>

        <!-- Table Selection (Always visible) -->
        <div
            v-if="canSelectTable"
            class="ps-input-wrapper"
        >
            <label
                v-t="'ui.table'"
                class="ps-input-wrapper__label"
            ></label>
            <div class="ps-input-wrapper__nav">
                <button
                    type="button"
                    :title="$t('ui.selectPrevious')"
                    class="ps-input-wrapper__nav-button"
                    @click="previousTable()"
                >{{ "<" }}</button>
                <span class="ps-input-wrapper__nav-item">{{ internalValue.tableName }}</span>
                <button
                    type="button"
                    :title="$t('ui.selectNext')"
                    class="ps-input-wrapper__nav-button"
                    @click="nextTable()"
                >{{ ">" }}</button>
            </div>
        </div>

        <!-- Action Button -->
        <div class="ps-button-wrapper">
            <button
                type="button"
                class="ps-button-wrapper__button ps-button-wrapper__button--primary"
                :disabled="!canPlay"
                @click="handlePrimaryAction()"
            >
                {{ primaryButtonText }}
            </button>
            <button
                v-if="!isWalletConnected"
                v-t="'ui.playAnonymous'"
                type="button"
                class="ps-button-wrapper__button ps-button-wrapper__button--secondary"
                @click="startGame()"
            ></button>
        </div>
    </fieldset>
</template>

<script lang="ts">
import { PropType } from "vue";
import Tables from "@/definitions/tables";
import { web3Service } from "@/services/web3-service";
import { useTournamentState } from "@/model/tournament-state";

export type NewGameProps = {
    playerName: string;
    table: number;
    tableName: string;
};

export default {
    props: {
        modelValue: {
            type: Object as PropType<NewGameProps>,
            required: true,
        },
    },
    data() {
        return {
            connecting: false,
        };
    },
    computed: {
        internalValue: {
            get(): NewGameProps {
                return this.modelValue;
            },
            set( value: NewGameProps ): void {
                this.$emit( "update:modelValue", value );
            }
        },
        isWalletConnected(): boolean {
            return web3Service.isConnected();
        },
        shortAddress(): string {
            const address = web3Service.getAddress();
            if (!address) return '';
            return `${address.slice(0, 6)}...${address.slice(-4)}`;
        },
        canSelectTable(): boolean {
            return Tables.length > 1;
        },
        canPlay(): boolean {
            return true; // Always can play (either connected for tournaments or anonymous)
        },
        primaryButtonText(): string {
            if (!this.isWalletConnected) {
                return this.$t('ui.connectForTournament');
            }
            return this.$t('ui.enterTournament');
        },
    },
    watch: {
        "internalValue.table": {
            immediate: true,
            handler( value: number ): void {
                this.internalValue.tableName = Tables[ value ].name;
            },
        },
        isWalletConnected: {
            immediate: true,
            handler(connected: boolean): void {
                if (connected) {
                    // Use wallet address as player name
                    const address = web3Service.getAddress();
                    this.internalValue.playerName = address || 'Connected Player';
                }
            },
        },
    },
    mounted(): void {
        // Set up player name based on wallet connection
        if (this.isWalletConnected) {
            const address = web3Service.getAddress();
            this.internalValue.playerName = address || 'Connected Player';
        } else {
            this.internalValue.playerName = 'Anonymous Player';
        }
    },
    methods: {
        handlePrimaryAction(): void {
            if (!this.isWalletConnected) {
                // Request wallet connection from parent
                this.$emit('request-wallet-connect');
            } else {
                this.startGame();
            }
        },
        startGame(): void {
            this.$emit( "start" );
        },
        previousTable(): void {
            let previous = this.internalValue.table - 1;
            if ( previous < 0 ) {
                previous = Tables.length - 1;
            }
            this.internalValue.table = previous;
        },
        nextTable(): void {
            let next = this.internalValue.table + 1;
            if ( next > Tables.length - 1 ) {
                next = 0;
            }
            this.internalValue.table = next;
        },
    },
};
</script>


<style lang="scss" scoped>
@import "@/styles/_variables";
@import "@/styles/_forms";
@import "@/styles/_typography";

.title {
    text-align: center;
    padding-top: $spacing-medium;

    &__wrapper {
        width: 75%;
        max-width: 400px;
        margin: $spacing-medium auto 0;
    }

    img {
        width: inherit;
    }

    &__lower {
        transform: scale(0.77);
        margin: -23px 0 0 -8px;
    }
}

.wallet-section {
    margin: $spacing-large 0;
    text-align: center;

    .wallet-prompt {
        h3 {
            @include titleFont(20px);
            color: $color-anchors;
            margin: 0 0 $spacing-small;
        }

        p {
            color: #ccc;
            margin: 0 0 $spacing-medium;
            font-size: 14px;
            line-height: 1.4;
        }
    }

    .wallet-buttons {
        margin: $spacing-medium 0;
    }

    .wallet-button {
        @include titleFont(16px);
        padding: 12px 24px;
        background: linear-gradient(135deg, $color-anchors, #00cc88);
        border: none;
        border-radius: 6px;
        color: #000;
        cursor: pointer;
        transition: all 0.3s ease;
        width: 100%;
        max-width: 280px;

        &:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
    }
}

.quick-play-separator {
    margin: $spacing-large 0;
    position: relative;
    text-align: center;

    &::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        height: 1px;
        background: #444;
    }

    span {
        background: $color-bg;
        padding: 0 $spacing-medium;
        color: #888;
        font-size: 12px;
        text-transform: uppercase;
    }
}

.quick-play-section {
    .quick-play-note {
        color: #888;
        font-size: 12px;
        margin: 0;
        font-style: italic;
    }
}

.wallet-connected {
    margin: $spacing-medium 0;
    text-align: center;

    .wallet-status {
        padding: $spacing-small $spacing-medium;
        background: rgba(0, 255, 136, 0.1);
        border: 1px solid rgba(0, 255, 136, 0.3);
        border-radius: 6px;
        font-size: 14px;

        .wallet-label {
            color: $color-anchors;
            margin-right: $spacing-small;
        }

        .wallet-address {
            color: #fff;
            font-family: monospace;
            font-weight: bold;
        }
    }
}

.ps-input-wrapper {
    &__nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;

        &-button {
            @include titleFont();
            cursor: pointer;
            background: none;
            border: none;
            color: #FFF;

            &:hover {
                color: $color-anchors;
            }
        }

        &-item {
            @include titleFont( 24px );
            color: $color-anchors;
        }
    }

    @include large() {
        &__label {
            width: 170px;
        }

        &__nav {
            width: calc(100% - 170px);
        }
    }
}

.ps-button-wrapper {
    display: flex;
    flex-direction: column;
    gap: $spacing-small;
    margin-top: $spacing-large;

    &__button {
        &--primary {
            background: linear-gradient(135deg, $color-anchors, #00cc88);
            color: #000;
            font-weight: bold;

            &:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
            }
        }

        &--secondary {
            background: transparent;
            border: 1px solid #666;
            color: #ccc;
            font-size: 14px;

            &:hover:not(:disabled) {
                border-color: #999;
                color: #fff;
            }
        }
    }

    @include mobile() {
        &__button {
            &--secondary {
                order: 1; // Show secondary button first on mobile
            }
            
            &--primary {
                order: 2;
            }
        }
    }
}
</style>
