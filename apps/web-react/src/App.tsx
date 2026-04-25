import "@rainbow-me/rainbowkit/styles.css";

import { RainbowKitProvider, ConnectButton } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { WagmiProvider } from "wagmi";
import { getConfig, mezoTestnet } from "@mezo-org/passport";
import LegacyGameFrame from "./LegacyGameFrame";

const queryClient = new QueryClient();

export default function App() {
  return (
    <WagmiProvider config={getConfig({ appName: "Mezo Pinball Arcade" })}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={mezoTestnet}>
          <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
            <h1 style={{ margin: "0 0 12px 0" }}>Mezo Pinball Arcade</h1>
            <ConnectButton label="Connect with Mezo Passport" />

            <p style={{ marginTop: 16, opacity: 0.85 }}>
              This is the React + Mezo Passport shell. Next step is mounting the pinball
              game loop here and removing the legacy Vue shell once parity is reached.
            </p>

            <LegacyGameFrame />
          </div>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
