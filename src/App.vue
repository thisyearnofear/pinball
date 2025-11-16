/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2024 - https://www.igorski.nl
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
        <header-menu
            :collapsable="game.active"
            :show-connect-button="game.active"
            :game-active="game.active"
            :is-farcaster="isFarcaster"
            @open="activeScreen = $event"
            @wallet-connected="onWalletConnected"
            @wallet-disconnected="onWalletDisconnected"
            @return-to-menu="returnToMenu"
        />
        <PinballTable
            v-model="game"
            :game-active="game.active"
            :use-vhs="config.useVHS"
            :is-farcaster="isFarcaster"
            :touchscreen="hasTouchScreen"
        />
        <GameCompleteCelebration
            v-if="showCelebration"
            :score="game.score || 0"
            :is-practice-mode="isPracticeMode"
            :last-submitted-scores="lastSubmittedScores"
            @dismiss="showCelebration = false"
            @play-again="initGame()"
            @play-tournament="startTournamentMode()"
            @view-leaderboard="activeScreen = 'highScores'"
        />
        <Tutorial
            v-if="showTutorial"
            :touchscreen="hasTouchScreen"
            @completed="onTutorialCompleted()"
        />
        <modal
            v-if="hasScreen"
            :title="$t(`menu.${activeScreen}`)"
            @close="activeScreen = null"
        >
            <component :is="modalComponent" />
        </modal>
        <modal
            v-else-if="!game.active && startPending === false && !showCelebration"
            :dismissible="false"
        >
            <new-game-window
                v-model="newGameProps"
                @start="initGame()"
                @request-wallet-connect="connectWallet()"
            />
        </modal>
        <Toast />
    </template>
</template>

<script lang="ts">
import { defineAsyncComponent } from "vue";
import type { Component } from "vue";
import { ethers } from 'ethers';
import HeaderMenu from "./components/header-menu/header-menu.vue";
import Loader from "@/components/loader/loader.vue";
import Modal from "@/components/modal/modal.vue";
import NewGameWindow from "@/components/new-game-window/new-game-window.vue";
import type { NewGameProps } from "@/components/new-game-window/new-game-window.vue";
import type { GameDef } from "@/definitions/game";
import { BALLS_PER_GAME } from "@/definitions/game";
import { START_TABLE_INDEX } from "@/definitions/tables";
import { STORED_FULLSCREEN, STORED_HAS_VIEWED_TUTORIAL, STORED_DISABLE_VHS_EFFECT } from "@/definitions/settings";
import { preloadAssets } from "@/services/asset-preloader";
import { init } from "@/services/audio-service";
import { isSupported, startGame, stopGame } from "@/services/high-scores-service";
import { web3Service } from "@/services/web3-service";
import { getContractsConfig } from "@/config/contracts";
import { getFromStorage, setInStorage } from "@/utils/local-storage";
import { isFullscreen, toggleFullscreen } from "@/utils/fullscreen-util";

interface ComponentData {
    loading: boolean;
    activeScreen: string;
    hasPlayed: boolean;
    startPending: boolean;
    hasTouchScreen: boolean;
    showTutorial: boolean;
    isFarcaster: boolean;
    config: {
        useVHS: boolean;
    };
    newGameProps: NewGameProps;
    game: Partial<GameDef>;
};

export default {
    components: {
        HeaderMenu,
        Loader,
        Modal,
        NewGameWindow,
        Toast: defineAsyncComponent(() => {
            return import( "./components/toast/toast.vue" );
        }),
        PinballTable: defineAsyncComponent(() => {
            return import( "./components/pinball-table/pinball-table.vue" );
        }),
        Tutorial: defineAsyncComponent(() => {
            return import( "./components/tutorial/tutorial.vue" );
        }),
        GameCompleteCelebration: defineAsyncComponent(() => {
            return import( "./components/celebration/game-complete-celebration.vue" );
        }),
    },
    data: () => ({
        loading: true,
        activeScreen: "",
        hasPlayed: false,
        startPending: false,
        hasTouchScreen: false,
        showTutorial: false,
        showCelebration: false,
        isFarcaster: false,
        config: {
            useVHS: getFromStorage( STORED_DISABLE_VHS_EFFECT ) !== "true"
        },
        newGameProps: {
            playerName: "",
            table: START_TABLE_INDEX,
            tableName: "",
        },
        game: {
            active: false,
        },
        lastSubmittedScores: null,
    }),
    computed: {
        hasScreen(): boolean {
            return !!this.activeScreen;
        },
        modalComponent(): Component | null {
            switch ( this.activeScreen ) {
                default:
                    return null;
                case "highScores":
                    return defineAsyncComponent({
                        loader: () => import( "./components/high-scores/high-scores.vue" )
                    });
                case "settings":
                    return defineAsyncComponent({
                        loader: () => import( "./components/settings/settings.vue" )
                    });
                case "howToPlay":
                    return defineAsyncComponent({
                        loader: () => import( "./components/how-to-play/how-to-play.vue" )
                    });
                case "about":
                    return defineAsyncComponent({
                        loader: () => import( "./components/about/about.vue" )
                    });
            }
        },
        canUseHighScores(): boolean {
            return isSupported() && this.newGameProps.playerName.length > 0;
        },
        isPracticeMode(): boolean {
            return !this.canUseHighScores;
        },
    },
    watch: {
        "game.active"( value: boolean, prevValue: boolean ): void {
            if ( value ) {
                this.startPending = false;
                if ( !this.hasPlayed ) {
                    this.hasPlayed = true;
                }
            }
            if ( !value && prevValue && this.game.score > 0 ) {
                if ( this.canUseHighScores && !this.isPracticeMode ) {
                    // Tournament mode - submit score and show celebration
                    stopGame( this.game.id, this.game.score, this.newGameProps.playerName, this.newGameProps.tableName ).then((scores) => {
                        // Store the updated scores to pass to celebration component
                        this.lastSubmittedScores = scores;
                        this.showCelebration = true;
                    }).catch((error) => {
                        console.error('Score submission failed:', error);
                        this.showToast(`Score submission failed: ${error.message || 'Unknown error'}`, 'error');
                        this.showCelebration = true;
                    });
                } else {
                    // Practice mode - just show celebration
                    this.showCelebration = true;
                }
            }
        },
        activeScreen( value: string | null, lastValue?: string | null  ): void {
            this.game.paused = !!value;
            if ( !value && lastValue === "settings" ) {
                this.config.useVHS = getFromStorage( STORED_DISABLE_VHS_EFFECT ) !== "true";
            }
        },
    },
    async mounted(): Promise<void> {
        await preloadAssets();
        
        // Initialize Farcaster SDK and attempt auto-connect
        await this.initializeFarcaster();
        
        this.loading = false;

        // unlock the AudioContext as soon as we receive a user interaction event
        const handler = ( e: Event ): void => {
            if ( e.type === "keydown" && ( e as KeyboardEvent ).keyCode === 27 ) {
                return; // hitting escape will not actually unlock the AudioContext
            }
            document.removeEventListener( "click",   handler, false );
            document.removeEventListener( "keydown", handler, false );

            init();
        };

        const touchHandler = ( e: Event ): void => {
            this.hasTouchScreen = true;
            document.removeEventListener( "touchstart", touchHandler, false );
        };
        document.addEventListener( "click", handler );
        document.addEventListener( "keydown", handler );
        document.addEventListener( "touchstart", touchHandler );
    },
    methods: {
        async initGame(): Promise<void> {
            if ( this.startPending ) {
                return;
            }
            if ( getFromStorage( STORED_FULLSCREEN ) === "true" && !isFullscreen() ) {
                toggleFullscreen();
            }
            this.startPending = true;
            
            // Check if wallet is connected and on correct chain before tournament mode
            if (this.canUseHighScores && !this.isPracticeMode) {
                try {
                    // Verify wallet is connected
                    if (!web3Service.isConnected()) {
                        throw new Error('Wallet not connected for tournament play');
                    }
                    
                    // Verify correct chain
                    const config = getContractsConfig();
                    const currentNetwork = await web3Service.getProvider().getNetwork();
                    const currentChainId = Number(currentNetwork.chainId);
                    const requiredChainId = config.chainId;
                    
                    if (currentChainId !== requiredChainId) {
                        await web3Service.switchChain(requiredChainId);
                    }
                } catch (error) {
                    console.error('Tournament setup failed:', error);
                    // Show user-friendly error and fallback to practice mode
                    this.showToast('Please connect to the correct network (Arbitrum One) for tournament mode', 'error');
                    this.newGameProps.playerName = 'Anonymous Player';
                    // Continue with practice mode
                }
            }
            
            try {
                const id = this.canUseHighScores ? await startGame() : null;
                this.showTutorial = getFromStorage( STORED_HAS_VIEWED_TUTORIAL ) !== "true";
                this.game = {
                    id: id ?? Math.random().toString(),
                    active: false,
                    paused: this.showTutorial,
                    table: this.newGameProps.table,
                    score: 0,
                    balls: BALLS_PER_GAME,
                    multiplier: 1,
                    underworld: false,
                };
            } catch (error) {
                console.error('Game initialization failed:', error);
                this.showToast('Failed to initialize game. Please try again.', 'error');
                this.startPending = false;
            }
        },
        onTutorialCompleted(): void {
            this.showTutorial = false;
            this.game.paused  = false;

            setInStorage( STORED_HAS_VIEWED_TUTORIAL, "true" );
        },
        async initializeFarcaster(): Promise<void> {
             // Skip Farcaster initialization if MetaMask is already available
             if (window.ethereum && typeof window.ethereum.request === 'function') {
                 console.log('MetaMask detected, skipping Farcaster provider setup');
                 return;
             }
             
             // Farcaster SDK (guarded dynamic import to support varying SDK exports)
             try {
                 const mod: any = await import("@farcaster/miniapp-sdk");
                 const fc = mod?.default ?? mod;
                 
                 // Validate SDK was loaded
                 if (!fc) {
                     throw new Error('Farcaster SDK module not found');
                 }
                 
                 // Initialize the SDK if init function exists
                 if (typeof fc?.init === "function") {
                     await fc.init();
                 }
                 
                 // Mark that we're in Farcaster context
                 this.isFarcaster = true;
                 
                 // Notify Farcaster Mini App that the app is ready to render (hide splash)
                 if (typeof fc?.actions?.ready === "function") {
                     await fc.actions.ready();
                 }
                  
                  // In Farcaster context, try auto-connecting wallet
                  if (typeof fc?.wallet?.getEthereumProvider === "function") {
                      try {
                          // Get the Ethereum provider from Farcaster SDK
                          const provider = fc.wallet.getEthereumProvider();
                          
                          // Validate that provider has the necessary methods (EIP-1193)
                          if (provider && typeof provider.request === "function" && Object.keys(provider).length > 0) {
                              // Create ethers provider from the Farcaster provider
                              const ethersProvider = new ethers.BrowserProvider(provider);
                              const signer = await ethersProvider.getSigner();
                              const address = await signer.getAddress();
                              
                              if (address) {
                                      this.newGameProps.playerName = address;
                                      // Use the web3Service's method to set provider and notify UI
                                      web3Service.setProvider(ethersProvider, signer, address);
                                      console.log('Farcaster wallet auto-connected:', address);
                                  }
                          } else {
                              console.log('Farcaster provider is not available or invalid');
                          }
                      } catch (error) {
                          console.log('Auto-connect not available or failed:', error);
                          // This is expected in many cases, not an error
                      }
                  }
              } catch (error) {
                  console.log('Farcaster SDK not available:', error);
                  // Expected when not in Farcaster context
                  
                  // Still call ready to hide splash screen in case SDK loaded partially
                  try {
                      const mod: any = await import("@farcaster/miniapp-sdk");
                      const fc = mod?.default ?? mod;
                      if (typeof fc?.actions?.ready === "function") {
                          await fc.actions.ready();
                      }
                  } catch (e) {
                      // Ignore if still can't load
                  }
              }
          },
        onWalletConnected(): void {
            // Refresh the new game props when wallet is connected
            const address = web3Service.getAddress();
            if (address) {
                this.newGameProps.playerName = address;
            }
        },
        onWalletDisconnected(): void {
            // Reset to anonymous when wallet is disconnected
            this.newGameProps.playerName = 'Anonymous Player';
            // End current game if active and return to initial screen
            if (this.game.active) {
                this.game.active = false;
                this.game.paused = false;
            }
            // Close any open screens
            this.activeScreen = null;
            this.showCelebration = false;
        },
        async connectWallet(): Promise<void> {
            try {
                const result = await web3Service.autoConnect();
                if (result) {
                    this.newGameProps.playerName = result.address;
                }
            } catch (error) {
                console.error('Wallet connection failed:', error);
            }
        },
        returnToMenu(): void {
            // End current game and return to menu
            this.game.active = false;
            this.game.paused = false;
            // Close any open screens
            this.activeScreen = null;
            this.showCelebration = false;
        },
        startTournamentMode(): void {
            // Switch from practice mode to tournament mode
            this.showCelebration = false;
            const address = web3Service.getAddress();
            if (address) {
                // Restore wallet address for tournament play
                this.newGameProps.playerName = address;
            }
            // The new game window will now show tournament mode
        },
        
        showToast(message: string, type: 'info' | 'error' | 'success' = 'info'): void {
            // Dispatch a custom event that can be handled by the toast component
            this.$nextTick(() => {
                const event = new CustomEvent('toast', { 
                    detail: { message, type }
                });
                document.dispatchEvent(event);
            });
        },
    },
};
</script>

<style lang="scss">
@import "@/styles/_variables";
@import "@/styles/_typography";

html, body {
    overscroll-behavior-x: none; /* disable navigation back/forward swipe on Chrome */
}

body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background-color: $color-bg;
}
</style>
import GameCompleteCelebration from "@/components/celebration/game-complete-celebration.vue";
