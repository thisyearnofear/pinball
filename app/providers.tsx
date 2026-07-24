"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/game/ui";
import { injectGlobalStyles } from "@/theme";
import { getAppConfig } from "@/config/app-config";

// Dynamically import the Wagmi shell to avoid SSR bundling of RainbowKit
// dependencies (Coinbase CDP SDK, @x402, etc.) which cause build failures
// when those optional packages aren't installed.
// When the Nimiq adapter is active, Wagmi isn't loaded at all.
const WagmiGameShell = dynamic(() => import("@/game/WagmiGameShell").then(m => ({ default: m.WagmiGameShell })), { ssr: false });

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });
}

let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [mounted, setMounted] = useState(false);
  const [isWagmi, setIsWagmi] = useState(false);

  useEffect(() => {
    injectGlobalStyles();
    try {
      setIsWagmi(getAppConfig().walletAdapter === "wagmi");
    } catch {
      setIsWagmi(true); // default to wagmi if config not ready
    }
    setMounted(true);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {isWagmi && <WagmiGameShell>{children}</WagmiGameShell>}
        {!isWagmi && (
          <div style={{ visibility: mounted ? "visible" : "hidden" }}>
            {children}
          </div>
        )}
      </ToastProvider>
    </QueryClientProvider>
  );
}
