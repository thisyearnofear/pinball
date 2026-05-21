import "@rainbow-me/rainbowkit/styles.css";

import React, { useEffect } from "react";
import { RainbowKitProvider, ConnectButton } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { getConfig, mezoTestnet } from "@mezo-org/passport";

import { injectGlobalStyles } from "@/theme";
import { ToastProvider } from "@/app/ui";
import GameScreen from "./GameScreen";

const queryClient = new QueryClient();

export default function App() {
  useEffect(() => {
    injectGlobalStyles();
  }, []);

  // @ts-expect-error Vite provides import.meta.env
  const env = import.meta.env as Record<string, unknown>;
  const walletConnectProjectId =
    (typeof env.VITE_WALLETCONNECT_PROJECT_ID === "string" && env.VITE_WALLETCONNECT_PROJECT_ID.trim()) ||
    "21fef48091f12692cad574a6f7753643";

  return (
    <WagmiProvider config={getConfig({ appName: "Mezo Pinball Arcade", walletConnectProjectId })}>
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
