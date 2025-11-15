/**
 * Tournament Join Confirmation Modal
 * Shows tournament details and confirms entry before contract interaction
 */
<template>
    <div class="tournament-join-modal">
        <!-- Wrong Network Banner -->
        <div v-if="wrongChain" class="network-banner">
            <div class="banner-content">
                <span>You're on the wrong network. Please switch to Arbitrum One.</span>
                <button class="banner-button" @click="handleSwitchChain">Switch Network</button>
            </div>
        </div>

        <!-- Loading State -->
        <div v-if="state === 'loading'" class="modal-content modal-content--loading">
            <div class="loading-spinner">⟳</div>
            <h3 v-t="'ui.joiningTournament'"></h3>
            <p v-t="'ui.confirmInWallet'"></p>
        </div>

        <!-- Success State -->
        <div v-else-if="state === 'success'" class="modal-content modal-content--success">
            <div class="success-icon">✓</div>
            <h3 v-t="'ui.tournamentJoined'"></h3>
            <p>{{ $t('ui.readyToCompete') }}</p>
            <button
                type="button"
                class="modal-button modal-button--primary"
                @click="handleConfirm"
            >
                {{ $t('ui.playNow') }}
            </button>
        </div>

        <!-- Error State -->
        <div v-else-if="state === 'error'" class="modal-content modal-content--error">
            <div class="error-icon">⚠</div>
            <h3 v-t="'ui.entryFailed'"></h3>
            <p class="error-message">{{ errorMessage }}</p>
            <div class="error-actions">
                <button
                    type="button"
                    class="modal-button modal-button--secondary"
                    @click="handleRetry"
                >
                    {{ $t('ui.retry') }}
                </button>
                <button
                    type="button"
                    class="modal-button modal-button--tertiary"
                    @click="handlePlayAnonymous"
                >
                    {{ $t('ui.playAnonymous') }}
                </button>
            </div>
        </div>

        <!-- Loading Tournament Details -->
        <div v-if="state === 'loading-details'" class="modal-content modal-content--loading">
            <div class="loading-spinner">⟳</div>
            <h3 v-t="'ui.loadingTournament'"></h3>
            <p v-t="'ui.fetchingDetails'"></p>
        </div>

        <!-- Confirmation State (initial) -->
        <div v-else-if="state === 'confirm'" class="modal-content modal-content--confirm">
            <h3 v-t="'ui.joinTournament'"></h3>
            
            <div class="tournament-info">
                <div class="info-row">
                    <span class="info-label" v-t="'ui.tournament'"></span>
                    <span class="info-value">{{ tournamentId }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label" v-t="'ui.player'"></span>
                    <span class="info-value">{{ shortAddress }}</span>
                </div>
                <div class="info-row info-row--highlight">
                    <span class="info-label" v-t="'ui.entryFee'"></span>
                    <span class="info-value info-value--fee">{{ displayEntryFee }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Ends In</span>
                    <span class="info-value">{{ timeRemainingLabel }}</span>
                </div>
            </div>

            <p v-t="'ui.tournamentDisclaimer'" class="disclaimer"></p>

            <div class="confirm-actions">
                <button
                    type="button"
                    class="modal-button modal-button--primary"
                    @click="handleJoin"
                    :disabled="isLoading || wrongChain"
                >
                    <span v-if="!isLoading">{{ $t('ui.confirmEntry') }}</span>
                    <span v-else>{{ $t('ui.processing') }}</span>
                </button>
                <button
                    type="button"
                    class="modal-button modal-button--secondary"
                    @click="handleCancel"
                    :disabled="isLoading"
                >
                    {{ $t('ui.cancel') }}
                </button>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { web3Service } from '@/services/web3-service';
import { joinTournament, getTournamentDetails } from '@/services/contracts/tournament-entry';
import { getEntryFeeWei, getTournamentInfo } from '@/services/contracts/tournament-client';
import { getContractsConfig } from '@/config/contracts';
import { ethers } from 'ethers';

type ModalState = 'loading-details' | 'confirm' | 'loading' | 'success' | 'error';

export default {
    props: {
        tournamentId: {
            type: Number,
            required: true,
        },
    },
    data() {
        return {
            state: 'loading-details' as ModalState,
            errorMessage: '',
            isLoading: false,
            entryFeeWei: 0n,
            endTime: null as number | null,
            currentTime: Math.floor(Date.now() / 1000),
            timerInterval: null as ReturnType<typeof setInterval> | null,
            providerChainId: null as number | null,
        };
    },
    computed: {
        shortAddress(): string {
            const address = web3Service.getAddress();
            if (!address) return '';
            return `${address.slice(0, 6)}...${address.slice(-4)}`;
        },
        displayEntryFee(): string {
            try {
                const eth = ethers.formatEther(this.entryFeeWei);
                return `${eth} ETH`;
            } catch {
                return 'Loading...';
            }
        },
        timeRemainingSec(): number {
            if (!this.endTime) return 0;
            return Math.max(0, this.endTime - this.currentTime);
        },
        timeRemainingLabel(): string {
            const s = this.timeRemainingSec;
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            const parts = [] as string[];
            if (h) parts.push(`${h}h`);
            if (m) parts.push(`${m}m`);
            if (!h && !m) parts.push(`${sec}s`);
            return parts.length > 0 ? parts.join(' ') : '0s';
        },
        wrongChain(): boolean {
            const config = getContractsConfig();
            return this.providerChainId !== null && this.providerChainId !== config.chainId;
        },
    },
    async mounted(): Promise<void> {
        // Check current network
        await this.checkNetwork();
        // Load tournament entry fee when modal opens
        await this.loadTournamentDetails();
        // Start timer to update countdown every second
        this.timerInterval = setInterval(() => {
            this.currentTime = Math.floor(Date.now() / 1000);
        }, 1000);
    },
    beforeUnmount(): void {
        // Clean up timer when modal closes
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    },
    methods: {
        async checkNetwork(): Promise<void> {
            try {
                const net = await web3Service.getProvider()?.getNetwork();
                this.providerChainId = net ? Number(net.chainId) : null;
            } catch (error: any) {
                // NETWORK_ERROR is expected during chain switches; suppress it
                if (error.code === 'NETWORK_ERROR' && error.event === 'changed') {
                    console.debug('Network is changing, retrying...');
                    // Retry after a short delay
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return this.checkNetwork();
                }
                console.warn('Failed to check network:', error);
            }
        },
        async handleSwitchChain(): Promise<void> {
            try {
                const config = getContractsConfig();
                await web3Service.switchChain(config.chainId);
                // Wait for network to stabilize before checking
                await new Promise(resolve => setTimeout(resolve, 800));
                await this.checkNetwork();
            } catch (error) {
                console.error('Failed to switch chain:', error);
                this.errorMessage = 'Failed to switch network. Please try again.';
                this.state = 'error';
            }
        },
        async loadTournamentDetails(): Promise<void> {
            // Don't load if on the wrong chain
            if (this.wrongChain) {
                this.state = 'confirm'; // Show UI but with banner
                return;
            }
            try {
                const fee = await getEntryFeeWei();
                this.entryFeeWei = fee;
                const info = await getTournamentInfo(this.tournamentId);
                this.endTime = info.endTime;
                this.state = 'confirm';
            } catch (error) {
                console.error('Failed to load tournament details:', error);
                this.state = 'error';
                this.errorMessage = this.formatErrorMessage(error);
            }
        },
        async handleJoin(): Promise<void> {
            this.isLoading = true;
            this.state = 'loading';

            try {
                await joinTournament(this.tournamentId);
                this.state = 'success';
            } catch (error) {
                console.error('Tournament join error:', error);
                this.state = 'error';
                this.errorMessage = this.formatErrorMessage(error);
            } finally {
                this.isLoading = false;
            }
        },
        handleConfirm(): void {
            this.$emit('joined');
        },
        handleCancel(): void {
            this.$emit('cancelled');
        },
        handleRetry(): void {
            this.state = 'confirm';
            this.errorMessage = '';
        },
        handlePlayAnonymous(): void {
            this.$emit('play-anonymous');
        },
        formatErrorMessage(error: any): string {
            if (error.reason) {
                return error.reason;
            }
            if (error.message) {
                // Clean up contract error messages
                const msg = error.message;
                if (msg.includes('insufficient funds')) {
                    return this.$t('ui.insufficientFunds');
                }
                if (msg.includes('already entered')) {
                    return this.$t('ui.alreadyEntered');
                }
                return msg;
            }
            return this.$t('ui.unknownError');
        },
    },
};
</script>

<style lang="scss" scoped>
@import "@/styles/_variables";
@import "@/styles/_typography";

.tournament-join-modal {
    width: 100%;
}

.network-banner {
    background: rgba(255, 107, 107, 0.15);
    border: 1px solid rgba(255, 107, 107, 0.3);
    border-radius: 8px;
    padding: $spacing-medium;
    margin-bottom: $spacing-large;

    .banner-content {
        display: flex;
        align-items: center;
        gap: $spacing-medium;
        justify-content: space-between;

        span {
            color: #ffaaaa;
            font-size: 14px;
        }
    }

    .banner-button {
        @include titleFont(12px);
        padding: $spacing-small $spacing-medium;
        background: #ff6b6b;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
        transition: all 0.3s ease;

        &:hover {
            background: #ff5252;
            box-shadow: 0 4px 12px rgba(255, 107, 107, 0.3);
        }

        &:active {
            transform: translateY(1px);
        }
    }
}

.modal-content {
    text-align: center;
    padding: $spacing-large 0;
}

.modal-content--confirm {
    .tournament-info {
        background: rgba(0, 255, 136, 0.05);
        border: 1px solid rgba(0, 255, 136, 0.2);
        border-radius: 8px;
        padding: $spacing-large;
        margin: $spacing-large 0;
        text-align: left;
    }

    .info-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: $spacing-small 0;

        &:not(:last-child) {
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: $spacing-small;
        }

        &--highlight {
            background: rgba(255, 152, 0, 0.1);
            border: 1px solid rgba(255, 152, 0, 0.3);
            border-radius: 4px;
            padding: $spacing-small $spacing-medium;
            margin-top: $spacing-small;
            border-bottom: none;

            .info-label {
                color: #ff9500;
            }

            .info-value {
                color: #ffb84d;
            }
        }
    }

    .info-label {
        @include titleFont(12px);
        color: #999;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .info-value {
        font-family: monospace;
        color: #00ff88;
        font-weight: bold;

        &--fee {
            font-size: 16px;
            letter-spacing: 1px;
        }
    }

    .disclaimer {
        @include titleFont(11px);
        color: #ccc;
        margin: $spacing-large 0;
        line-height: 1.5;
    }
}

.modal-content--loading {
    .loading-spinner {
        font-size: 48px;
        animation: spin 2s linear infinite;
        margin-bottom: $spacing-large;
    }

    h3 {
        color: #00ff88;
        margin-bottom: $spacing-small;
    }

    p {
        color: #ccc;
        font-size: 14px;
    }
}

.modal-content--success {
    .success-icon {
        font-size: 64px;
        color: #00ff88;
        margin-bottom: $spacing-large;
        animation: slideDown 0.5s ease-out;
    }

    h3 {
        color: #00ff88;
        margin-bottom: $spacing-small;
    }

    p {
        color: #ccc;
        margin-bottom: $spacing-large;
    }
}

.modal-content--error {
    .error-icon {
        font-size: 48px;
        color: #ff6b6b;
        margin-bottom: $spacing-large;
    }

    h3 {
        color: #ff6b6b;
        margin-bottom: $spacing-small;
    }

    .error-message {
        background: rgba(255, 107, 107, 0.1);
        border: 1px solid rgba(255, 107, 107, 0.3);
        border-radius: 4px;
        padding: $spacing-medium;
        color: #ffaaaa;
        margin: $spacing-large 0;
        font-size: 13px;
        font-family: monospace;
    }

    .error-actions {
        display: flex;
        gap: $spacing-medium;
        justify-content: center;
    }
}

.confirm-actions,
.error-actions {
    display: flex;
    gap: $spacing-medium;
    justify-content: center;
    margin-top: $spacing-large;

    @media (max-width: 600px) {
        flex-direction: column;
    }
}

.modal-button {
    @include titleFont(14px);
    padding: $spacing-medium $spacing-large;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: all 0.3s ease;
    min-width: 140px;

    &:disabled {
        opacity: 0.6;
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

    &--tertiary {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: #fff;

        &:not(:disabled):hover {
            border-color: rgba(255, 255, 255, 0.6);
            background: rgba(255, 255, 255, 0.05);
        }
    }
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

@keyframes slideDown {
    from {
        opacity: 0;
        transform: translateY(-20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
