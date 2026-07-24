"use client";

/**
 * NimiqGameShell — wraps the game for the Nimiq Pay Mini App environment.
 * Active when NEXT_PUBLIC_WALLET_ADAPTER=nimiq (Nimiq profile).
 *
 * Nimiq Pay injects window.ethereum (EIP-1193) into the WebView. No
 * Wagmi/RainbowKit providers are needed — the NimiqWalletPort adapter
 * talks to the injected provider directly. RainbowKit's ConnectButton
 * is replaced by a Nimiq-native connect flow.
 */
import React from "react";
import GameScreen from "./GameScreen";

export function NimiqGameShell() {
  return <GameScreen />;
}
