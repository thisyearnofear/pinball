import "@rainbow-me/rainbowkit/styles.css";

import React, { useEffect } from "react";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config, mezoTestnet } from "@/config/wagmi-config";

import { injectGlobalStyles } from "@/theme";
import { ToastProvider } from "@/game/ui";
import GameScreen from "./GameScreen";

const queryClient = new QueryClient();

export default function App() {
  useEffect(() => {
    injectGlobalStyles();
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={mezoTestnet}>
          <ToastProvider>
            <GameScreen />
          </ToastProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
