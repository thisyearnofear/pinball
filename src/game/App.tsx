import React, { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { injectGlobalStyles } from "@/theme";
import { getAppConfig } from "@/config/app-config";
import { ToastProvider } from "@/game/ui";
import GameScreen from "./GameScreen";
import { WagmiGameShell } from "./WagmiGameShell";
import { NimiqGameShell } from "./NimiqGameShell";
import { prefetchQuantumSeeds } from "@/services/quantum-seed";

const queryClient = new QueryClient();

export default function App() {
  useEffect(() => {
    injectGlobalStyles();
    // Warm the quantum seed buffer in the background; harmless if unavailable.
    void prefetchQuantumSeeds();
  }, []);

  const cfg = getAppConfig();
  const isWagmi = cfg.walletAdapter === "wagmi";

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {isWagmi ? <WagmiGameShell><GameScreen /></WagmiGameShell> : <NimiqGameShell />}
      </ToastProvider>
    </QueryClientProvider>
  );
}
