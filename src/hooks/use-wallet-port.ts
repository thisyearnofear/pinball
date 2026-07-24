import { useEffect, useState } from "react";

import { getAppConfig } from "@/config/app-config";
import type { WalletPort } from "@/domains/wallet/wallet-port";
import { Eip1193WalletPort } from "@/domains/wallet/eip1193-wallet-port";
import { NimiqWalletPort } from "@/domains/wallet/nimiq-wallet-port";

/**
 * Bridges the active wallet connector to a WalletPort instance.
 * Selects the adapter based on the ecosystem profile:
 * - wagmi: uses Wagmi connector (RainbowKit) — loaded dynamically to avoid SSR bundling
 * - nimiq: uses Nimiq Pay injected provider
 *
 * Note: wagmi's useAccount() is not used here to avoid static imports.
 * Instead we poll window.ethereum directly for both adapters.
 */
export function useWalletPort(): WalletPort | null {
  const cfg = getAppConfig();
  const isWagmi = cfg.walletAdapter === "wagmi";
  const [walletPort, setWalletPort] = useState<WalletPort | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      try {
        const provider = (typeof window !== "undefined" ? (window as any).ethereum : undefined);
        if (!provider || typeof provider.request !== "function") {
          if (!cancelled) setWalletPort(null);
          return;
        }

        // Check for already-connected accounts (don't prompt)
        const accounts: string[] = await provider.request({ method: "eth_accounts" }).catch(() => []);
        if (!accounts || accounts.length === 0) {
          if (!cancelled) setWalletPort(null);
          return;
        }

        const port = isWagmi
          ? new Eip1193WalletPort(provider)
          : new NimiqWalletPort(provider);
        await port.getAddress();
        if (!cancelled) setWalletPort(port);
      } catch (e) {
        console.error("Failed to initialize wallet port:", e);
        if (!cancelled) setWalletPort(null);
      }
    }

    sync();

    // Listen for account changes
    const provider = typeof window !== "undefined" ? (window as any).ethereum : undefined;
    if (provider?.on) {
      const handler = () => sync();
      provider.on("accountsChanged", handler);
      return () => { provider.removeListener("accountsChanged", handler); };
    }
  }, [isWagmi]);

  return walletPort;
}
