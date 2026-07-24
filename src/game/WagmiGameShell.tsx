"use client";

/**
 * WagmiGameShell — wraps the game with Wagmi + RainbowKit providers.
 * Active when NEXT_PUBLIC_WALLET_ADAPTER=wagmi (Mezo profile, generic EVM).
 */
import "@rainbow-me/rainbowkit/styles.css";
import React from "react";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { config } from "@/config/wagmi-config";
import GameScreen from "./GameScreen";

export function WagmiGameShell() {
  return (
    <WagmiProvider config={config}>
      <RainbowKitProvider>
        <GameScreen />
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
