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
    <div>
        <!-- Wallet Selector Modal -->
        <div v-if="showWalletSelector" class="wallet-selector-overlay">
            <div class="wallet-selector">
                <div class="wallet-selector__header">
                    <h3 v-t="'ui.selectWallet'"></h3>
                    <button
                        type="button"
                        class="wallet-selector__close"
                        @click="showWalletSelector = false"
                    >&times;</button>
                </div>
                <div class="wallet-selector__options">
                    <button
                        v-for="wallet in availableWallets"
                        :key="wallet"
                        type="button"
                        class="wallet-option"
                        :class="`wallet-option--${wallet}`"
                        :disabled="connectingWallet === wallet"
                        @click="selectWallet(wallet)"
                    >
                        <span class="wallet-option__icon">{{ walletIcon(wallet) }}</span>
                        <span class="wallet-option__name">{{ walletName(wallet) }}</span>
                        <span v-if="connectingWallet === wallet" class="wallet-option__spinner">⟳</span>
                    </button>
                </div>
            </div>
        </div>

        <fieldset
            v-if="!showWalletSelector"
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

        <!-- Status Section -->
        <div class="status-section">
            <div v-if="isWalletConnected" class="status-badge status-badge--connected">
                <span class="status-badge__indicator"></span>
                <span class="status-badge__text">{{ shortAddress }}</span>
            </div>
            <div v-else class="status-badge status-badge--disconnected">
                <span class="status-badge__icon">⚠</span>
                <span class="status-badge__text">{{ $t('ui.walletNotConnected') }}</span>
            </div>
        </div>

        <!-- Game Options Section -->
        <div class="game-options">
            <!-- Table Selection (Always visible) -->
            <div v-if="canSelectTable" class="table-selector">
                <label class="table-selector__label" v-t="'ui.table'"></label>
                <div class="table-selector__controls">
                    <button
                        type="button"
                        :title="$t('ui.selectPrevious')"
                        class="table-selector__btn"
                        @click="previousTable()"
                    >&lt;</button>
                    <span class="table-selector__name">{{ internalValue.tableName }}</span>
                    <button
                        type="button"
                        :title="$t('ui.selectNext')"
                        class="table-selector__btn"
                        @click="nextTable()"
                    >&gt;</button>
                </div>
            </div>

            <!-- Game Mode Buttons -->
            <div class="game-mode-buttons">
                <button
                    type="button"
                    class="game-mode-btn game-mode-btn--primary"
                    :disabled="!canPlay"
                    @click="handlePrimaryAction()"
                    :title="isWalletConnected ? $t('ui.enterTournament') : $t('ui.connectForTournament')"
                >
                    <span class="game-mode-btn__icon">{{ isWalletConnected ? '🏆' : '🔐' }}</span>
                    <span class="game-mode-btn__label">{{ primaryButtonText }}</span>
                </button>
                <button
                    v-if="!isWalletConnected"
                    type="button"
                    class="game-mode-btn game-mode-btn--secondary"
                    @click="startGame()"
                    :title="$t('ui.playAnonymous')"
                >
                    <span class="game-mode-btn__icon">🎮</span>
                    <span class="game-mode-btn__label">{{ $t('ui.playAnonymous') }}</span>
                </button>
            </div>

            <!-- Info Text -->
            <div class="mode-info">
                <p v-if="isWalletConnected" class="mode-info__text">
                    {{ $t('ui.competingForPrizes') }}
                </p>
                <p v-else class="mode-info__text">
                    {{ $t('ui.practiceOrCompete') }}
                </p>
            </div>
        </div>
        </fieldset>
    </div>
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
            showWalletSelector: false,
            connectingWallet: null as 'metamask' | 'walletconnect' | null,
        };
    },
    computed: {
        internalValue: {
            get(): NewGameProps {
                return this.modelValue;
            },
            set(value: NewGameProps): void {
                this.$emit("update:modelValue", value);
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
            return true;
        },
        primaryButtonText(): string {
            if (!this.isWalletConnected) {
                return this.$t('ui.connectForTournament');
            }
            return this.$t('ui.enterTournament');
        },
        availableWallets(): Array<'metamask' | 'walletconnect'> {
            return web3Service.getAvailableWallets();
        },
    },
    watch: {
        "internalValue.table": {
            immediate: true,
            handler(value: number): void {
                this.internalValue.tableName = Tables[value].name;
            },
        },
        isWalletConnected: {
            immediate: true,
            handler(connected: boolean): void {
                if (connected) {
                    const address = web3Service.getAddress();
                    this.internalValue.playerName = address || 'Connected Player';
                } else {
                    this.internalValue.playerName = 'Anonymous Player';
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

        // Listen for wallet connection changes
        web3Service.on('connected', this.onWalletConnected);
        web3Service.on('disconnected', this.onWalletDisconnected);
    },
    beforeUnmount(): void {
        // Clean up event listeners
        web3Service.off('connected', this.onWalletConnected);
        web3Service.off('disconnected', this.onWalletDisconnected);
    },
    methods: {
         onWalletConnected(): void {
             const address = web3Service.getAddress();
             if (address) {
                 this.internalValue.playerName = address;
             }
         },
         onWalletDisconnected(): void {
             this.internalValue.playerName = 'Anonymous Player';
         },
         handlePrimaryAction(): void {
             if (!this.isWalletConnected) {
                 this.showWalletSelector = true;
             } else {
                 this.startGame();
             }
         },
         startGame(): void {
             this.$emit("start");
         },
         async selectWallet(walletType: 'metamask' | 'walletconnect'): Promise<void> {
             this.connectingWallet = walletType;
             try {
                 const result = await web3Service.connect(walletType);
                 if (result) {
                     this.showWalletSelector = false;
                     this.$emit('wallet-connected');
                 }
             } catch (error) {
                 console.error('Wallet connection failed:', error);
             } finally {
                 this.connectingWallet = null;
             }
         },
         walletIcon(wallet: 'metamask' | 'walletconnect'): string {
             return wallet === 'metamask' ? '🦊' : '📱';
         },
         walletName(wallet: 'metamask' | 'walletconnect'): string {
             return wallet === 'metamask' ? 'MetaMask' : 'WalletConnect';
         },
         previousTable(): void {
             let previous = this.internalValue.table - 1;
             if (previous < 0) {
                 previous = Tables.length - 1;
             }
             this.internalValue.table = previous;
         },
         nextTable(): void {
             let next = this.internalValue.table + 1;
             if (next > Tables.length - 1) {
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
@import "@/styles/_mixins";

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

.status-section {
    margin: $spacing-large auto $spacing-medium;
    display: flex;
    justify-content: center;
}

.status-badge {
    display: flex;
    align-items: center;
    gap: $spacing-small;
    padding: $spacing-small $spacing-medium;
    border-radius: 8px;
    font-size: 14px;
    font-family: monospace;
    font-weight: 500;
    max-width: 300px;

    &--connected {
        background: rgba(0, 255, 136, 0.15);
        border: 1px solid rgba(0, 255, 136, 0.4);
        color: #00ff88;

        .status-badge__indicator {
            width: 8px;
            height: 8px;
            background: #00ff88;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
    }

    &--disconnected {
        background: rgba(255, 100, 100, 0.1);
        border: 1px solid rgba(255, 100, 100, 0.3);
        color: #ffaaaa;

        .status-badge__icon {
            font-size: 16px;
        }
    }

    &__text {
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
}

.game-options {
    display: flex;
    flex-direction: column;
    gap: $spacing-large;
    margin-top: $spacing-large;
}

.table-selector {
    display: flex;
    flex-direction: column;
    gap: $spacing-small;

    &__label {
        @include titleFont(14px);
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #ccc;
        text-align: center;
    }

    &__controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: $spacing-medium;
    }

    &__btn {
        @include titleFont(18px);
        background: none;
        border: none;
        color: #fff;
        cursor: pointer;
        padding: $spacing-small;
        transition: all 0.2s ease;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;

        &:hover {
            color: $color-anchors;
            background: rgba(0, 255, 136, 0.1);
        }

        &:active {
            transform: scale(0.95);
        }
    }

    &__name {
        @include titleFont(20px);
        color: $color-anchors;
        min-width: 150px;
        text-align: center;
    }
}

.game-mode-buttons {
    display: flex;
    flex-direction: column;
    gap: $spacing-medium;
}

.game-mode-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-small;
    padding: $spacing-medium;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
    text-transform: uppercase;
    letter-spacing: 1px;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &:not(:disabled) {
        &:hover {
            transform: translateY(-2px);
        }

        &:active {
            transform: translateY(0);
        }
    }

    &--primary {
        background: linear-gradient(135deg, $color-anchors, #00cc88);
        color: #000;
        box-shadow: 0 4px 15px rgba(0, 255, 136, 0.2);

        &:not(:disabled):hover {
            box-shadow: 0 6px 20px rgba(0, 255, 136, 0.4);
        }
    }

    &--secondary {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;

        &:not(:disabled):hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.4);
        }
    }

    &__icon {
        font-size: 18px;
    }

    &__label {
        display: inline;
    }
}

.mode-info {
    text-align: center;
    margin-top: $spacing-medium;

    &__text {
        @include titleFont(12px);
        color: #999;
        margin: 0;
        line-height: 1.4;
        letter-spacing: 0.5px;
    }
}

.wallet-selector-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1001;
}

.wallet-selector {
    background: $color-modal-bg;
    border: 3px solid $color-outlines;
    border-radius: $spacing-large;
    padding: $spacing-large;
    max-width: 400px;
    width: 90vw;
    box-shadow: 0 0 20px rgba(0, 255, 136, 0.3);

    &__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: $spacing-large;
        position: relative;

        h3 {
            @include titleFontGradient();
            margin: 0;
            font-size: 24px;
        }
    }

    &__close {
        @include button();
        background: transparent;
        border: 2px solid $color-titles;
        color: $color-titles;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
            border-color: $color-anchors;
            color: $color-anchors;
        }
    }

    &__options {
        display: flex;
        flex-direction: column;
        gap: $spacing-medium;
    }
}

.wallet-option {
    @include button();
    display: flex;
    align-items: center;
    gap: $spacing-medium;
    padding: $spacing-medium;
    background: rgba(0, 255, 136, 0.05);
    border: 2px solid rgba(0, 255, 136, 0.3);
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    font-family: inherit;

    &:hover:not(:disabled) {
        background: rgba(0, 255, 136, 0.15);
        border-color: rgba(0, 255, 136, 0.6);
        transform: translateX(4px);
    }

    &:active:not(:disabled) {
        transform: translateX(2px);
    }

    &:disabled {
        opacity: 0.7;
        cursor: wait;
    }

    &__icon {
        font-size: 28px;
        min-width: 32px;
        text-align: center;
    }

    &__name {
        flex: 1;
        text-align: left;
        @include titleFont(16px);
        font-weight: bold;
    }

    &__spinner {
        font-size: 18px;
        animation: spin 1s linear infinite;
    }

    @include mobile() {
        padding: $spacing-large;
        font-size: 16px;

        &__icon {
            font-size: 32px;
        }
    }
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
</style>
