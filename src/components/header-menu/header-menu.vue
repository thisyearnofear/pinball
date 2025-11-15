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
    <header
        class="header"
        :class="{
            'header--expanded': menuOpened,
            'header--collapsable': collapsable
        }"
    >
        <nav class="menu">
            <div class="menu__toggle"
                 @click="toggleMenu"
             >
                <span>&#9776;</span>
            </div>
            
            <!-- Unified Wallet Interface -->
            <div v-if="isWalletConnected" class="menu__wallet" ref="walletMenu">
                <div class="menu__wallet-status" @click="toggleWalletMenu">
                    <span class="menu__wallet-indicator" :class="{ 'menu__wallet-indicator--tournament': isTournamentActive }"></span>
                    {{ shortAddress }}
                    <span v-if="isTournamentActive" class="menu__tournament-badge">T</span>
                    <span class="menu__wallet-chevron" :class="{ 'menu__wallet-chevron--open': walletMenuOpen }">▼</span>
                </div>
                <div v-if="walletMenuOpen" class="menu__wallet-dropdown">
                    <div v-if="isTournamentActive" class="wallet-tournament-info">
                        <span class="tournament-status">{{ $t('ui.tournamentActive') }}</span>
                    </div>
                    <button @click="switchWallet" class="wallet-action">
                        {{ $t('ui.switchWallet') }}
                    </button>
                    <button @click="disconnectWallet" class="wallet-action wallet-action--danger">
                        {{ $t('ui.disconnectWallet') }}
                    </button>
                </div>
            </div>
            
            <ul class="menu__items">
                <li
                    v-for="(item, index) in menuItems"
                    :key="`menu_item_${index}`"
                >
                    <button
                        v-t="`menu.${item}`"
                        type="button"
                        :title="$t(`menu.${item}`)"
                        @click="openScreen( item )"
                    ></button>
                </li>
                
                <!-- Unified Wallet Connect Button (hidden when wallet is connected) -->
                <li v-if="!isWalletConnected" class="menu__wallet-connect">
                    <button
                        type="button"
                        :title="$t('ui.connectWallet')"
                        @click="connectWallet"
                    >
                        {{ $t('ui.connectWallet') }}
                    </button>
                </li>
            </ul>
        </nav>
    </header>
</template>

<script lang="ts">
import { MENU_ITEMS } from "@/definitions/menu";
import { web3Service } from "@/services/web3-service";
import { useTournamentState } from "@/model/tournament-state";

export default {
    props: {
        collapsable: {
            type: Boolean,
            default: false
        }
    },
    data() {
        return {
            menuOpened: false,
            walletMenuOpen: false,
            tournamentState: null as any,
        };
    },
    computed: {
        menuItems(): string[] {
            return MENU_ITEMS;
        },
        isWalletConnected(): boolean {
            return web3Service.isConnected();
        },
        shortAddress(): string {
            const address = web3Service.getAddress();
            if (!address) return '';
            return `${address.slice(0, 6)}...${address.slice(-4)}`;
        },
        isTournamentActive(): boolean {
            return this.tournamentState && 
                   this.tournamentState.tournamentId.value !== null && 
                   !this.tournamentState.finalized.value;
        },
    },
    methods: {
        toggleMenu(): void {
            this.menuOpened = !this.menuOpened;
        },
        openScreen( target: string ): void {
            this.$emit( "open", target );
            this.menuOpened = false;
        },
        async connectWallet(): Promise<void> {
            try {
                await web3Service.connect('metamask');
                this.menuOpened = false;
                // Emit event to parent to potentially refresh state
                this.$emit('wallet-connected');
            } catch (error) {
                console.error('Wallet connection failed:', error);
            }
        },
        toggleWalletMenu(): void {
            this.walletMenuOpen = !this.walletMenuOpen;
        },
        async switchWallet(): Promise<void> {
            try {
                // Disconnect current wallet first
                await web3Service.disconnect();
                this.walletMenuOpen = false;
                // Attempt new connection
                await web3Service.connect('metamask');
                this.$emit('wallet-connected');
            } catch (error) {
                console.error('Wallet switch failed:', error);
            }
        },
        async disconnectWallet(): Promise<void> {
            try {
                await web3Service.disconnect();
                this.walletMenuOpen = false;
                this.$emit('wallet-disconnected');
            } catch (error) {
                console.error('Wallet disconnect failed:', error);
            }
        },
        handleClickOutside(event: Event): void {
            const walletMenu = this.$refs.walletMenu as HTMLElement;
            if (walletMenu && !walletMenu.contains(event.target as Node)) {
                this.walletMenuOpen = false;
            }
        },
    },
    async mounted(): Promise<void> {
        // Initialize tournament state if wallet is connected
        if (this.isWalletConnected) {
            this.tournamentState = useTournamentState();
            try {
                await this.tournamentState.load();
            } catch (error) {
                console.log('Tournament state loading failed:', error);
            }
        }
        
        // Add click outside listener
        document.addEventListener('click', this.handleClickOutside);
    },
    beforeUnmount(): void {
        document.removeEventListener('click', this.handleClickOutside);
    },
};
</script>

<style lang="scss" scoped>
@import "@/styles/_mixins";
@import "@/styles/_typography";

.header {
    position: fixed;
    left: 0;
    top: 0;
    z-index: $z-index-header;
    background-color: #000;
    width: 100%;
    height: $menu-height;
    padding: 0;

    @include mobile() {
        width: 100%;
        background-color: #000;

        &--expanded {
            height: 100%;
        }
    }

    @include large() {
        &--collapsable {
            top: -( $menu-height - $spacing-small );
            transition: top 0.35s ease-in-out;

            &:hover {
                top: 0;
            }
        }
    }
}

// menu is horizontal bar aligned to the top of the screen on resolutions above mobile width

.menu {
    @include noSelect();
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;

    &__wallet {
        margin-left: auto;
        margin-right: $spacing-medium;
        position: relative;
        
        @include mobile() {
            display: none; // Hide in mobile hamburger menu
        }

        &-status {
            display: flex;
            align-items: center;
            padding: 4px 8px;
            background: rgba(0, 255, 136, 0.1);
            border: 1px solid rgba(0, 255, 136, 0.3);
            border-radius: 4px;
            font-size: 12px;
            color: #fff;
            font-family: monospace;
            cursor: pointer;
            transition: background 0.2s ease;

            &:hover {
                background: rgba(0, 255, 136, 0.15);
            }
        }

        &-chevron {
            margin-left: 6px;
            font-size: 10px;
            transition: transform 0.2s ease;

            &--open {
                transform: rotate(180deg);
            }
        }

        &-badge {
            margin-left: 4px;
            background: #ff9500;
            color: #000;
            font-size: 8px;
            font-weight: bold;
            padding: 1px 3px;
            border-radius: 2px;
            line-height: 1;
        }

        &-dropdown {
            position: absolute;
            top: 100%;
            right: 0;
            background: #1a1a1a;
            border: 1px solid rgba(0, 255, 136, 0.3);
            border-radius: 6px;
            padding: 6px 0;
            min-width: 150px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);

            .wallet-tournament-info {
                padding: 8px 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                margin-bottom: 4px;

                .tournament-status {
                    color: #ff9500;
                    font-size: 11px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;

                    &::before {
                        content: '●';
                        margin-right: 4px;
                        color: #ff9500;
                        animation: pulse 2s infinite;
                    }
                }
            }

            .wallet-action {
                display: block;
                width: 100%;
                padding: 8px 12px;
                background: none;
                border: none;
                color: #fff;
                text-align: left;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s ease;

                &:hover {
                    background: rgba(255, 255, 255, 0.1);
                }

                &--danger {
                    color: #ff6b6b;

                    &:hover {
                        background: rgba(255, 107, 107, 0.1);
                    }
                }
            }
        }

        &-indicator {
            width: 6px;
            height: 6px;
            background: $color-anchors;
            border-radius: 50%;
            margin-right: 6px;
            animation: pulse 2s infinite;

            &--tournament {
                background: #ff9500;
                animation: tournament-pulse 1.5s infinite;
            }
        }
    }

    @keyframes tournament-pulse {
        0%, 100% { 
            opacity: 1; 
            transform: scale(1);
        }
        50% { 
            opacity: 0.7; 
            transform: scale(1.1);
        }
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }

    &__toggle {
        position: absolute;
        display: none;
        top: 0;
        left: 0;
        cursor: pointer;
        width: $menu-toggle-width;
        height: $menu-height;
        background-color: #0e1417;
        color: #FFF;
        box-sizing: border-box;
        border-bottom: 2px solid #000;

        span {
            display: block;
            font-size: 150%;
            margin: 12px;
        }
    }

    ul {
        padding: 0;
        box-sizing: border-box;
        list-style-type: none;
    }

    .menu__items {
        display: flex;
        align-items: center;
        line-height: $menu-height;
        margin: 0;
        flex: 1;

        @include large() {
            justify-content: center;
        }
    }

    li {
        display: inline;
        padding: 0;
        margin: 0 $spacing-large 0 0;

        &.menu__wallet-connect {
            margin-left: auto;
            
            @include mobile() {
                margin-left: 0;
                width: 100%;
                margin-top: $spacing-small;
            }

            button {
                background: linear-gradient(135deg, $color-anchors, #00cc88);
                color: #000;
                border-radius: 4px;
                padding: 6px 12px;
                font-size: 12px;
                font-weight: bold;

                &:hover {
                    color: #000;
                    transform: translateY(-1px);
                }

                @include mobile() {
                    width: 100%;
                    padding: 12px;
                    font-size: 14px;
                }
            }
        }

        button, a {
            @include titleFont();
            cursor: pointer;
            border: 0;
            background: none;
            color: #FFF;
            font-size: 100%;
            text-decoration: none;
            padding: 0 $spacing-small;
            transition: all 0.2s ease;

            &:hover {
                color: $color-anchors;
            }
        }
    }

    &--expanded {
        position: absolute;
    }

    @include large() {
        max-width: $app-width;
        margin: 0 auto;
    }

    // on resolution below the mobile threshold the menu is fullscreen and vertically stacked

    @include mobile() {
        position: fixed;
        overflow: hidden;
        width: 100%;
        height: inherit;
        top: 0;
        left: 0;

        .menu__items {
            margin: $menu-height auto 0;
            background-color: #000;
            max-height: calc(100vh - #{$menu-height});
            overflow: hidden;
            overflow-y: auto;

            li {
                display: block;
                font-size: 24px;
                margin: $spacing-small 0 0;
                width: 100%;
                line-height: $spacing-xlarge;
                padding: 0 $spacing-medium;
                box-sizing: border-box;
            }
        }

        &__toggle {
            display: block; // only visible in mobile view
            height: $menu-height;
        }
    }
}
</style>
