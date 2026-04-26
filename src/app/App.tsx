import "@rainbow-me/rainbowkit/styles.css";

import React from "react";
import { RainbowKitProvider, ConnectButton } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { getConfig, mezoTestnet } from "@mezo-org/passport";

import GameScreen from "./GameScreen";

const queryClient = new QueryClient();

export default function App() {
  // @ts-expect-error Vite provides import.meta.env
  const env = import.meta.env as Record<string, unknown>;
  const walletConnectProjectId =
    (typeof env.VITE_WALLETCONNECT_PROJECT_ID === "string" && env.VITE_WALLETCONNECT_PROJECT_ID.trim()) ||
    // Public demo project id used by RainbowKit docs; fine for early dev.
    "21fef48091f12692cad574a6f7753643";

  return (
    <WagmiProvider config={getConfig({ appName: "Mezo Pinball Arcade", walletConnectProjectId })}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={mezoTestnet}>
          <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
            <h1 style={{ margin: "0 0 12px 0" }}>Mezo Pinball Arcade</h1>
            <ConnectButton label="Connect with Mezo Passport" />
            <GameScreen />
          </div>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
