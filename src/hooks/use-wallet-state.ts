"use client";

/**
 * useWalletState — unified wallet connection state across ecosystems.
 *
 * Wagmi profile: delegates to wagmi's useAccount() (loaded dynamically).
 * Nimiq profile: tracks connection state from the NimiqWalletPort lifecycle.
 *
 * Wagmi is loaded via dynamic import to avoid SSR bundling of RainbowKit
 * dependencies (@coinbase/cdp-sdk, @x402, etc.).
 */
import { useEffect, useState } from "react";
import { getAppConfig } from "@/config/app-config";

export type WalletState = {
  address: string | undefined;
  isConnected: boolean;
};

// Type-only import — erased at build time, no runtime dependency
type UseAccountType = typeof import("wagmi")["useAccount"];

export function useWalletState(): WalletState {
  const cfg = getAppConfig();
  const isWagmi = cfg.walletAdapter === "wagmi";

  // wagmi path (lazy)
  const [wagmiState, setWagmiState] = useState<WalletState>({
    address: undefined,
    isConnected: false,
  });

  // nimiq path
  const [nimiqState, setNimiqState] = useState<WalletState>({
    address: undefined,
    isConnected: false,
  });

  useEffect(() => {
    if (!isWagmi) return;

    let cancelled = false;
    (async () => {
      try {
        const { useAccount } = await import("wagmi");
        // We can't call useAccount here (hooks rules), so we poll
        const checkAccount = async () => {
          try {
            const provider = typeof window !== "undefined" ? (window as any).ethereum : undefined;
            if (!provider?.request) return;
            const accounts: string[] = await provider.request({ method: "eth_accounts" }).catch(() => []);
            if (!cancelled) {
              if (accounts && accounts.length > 0) {
                setWagmiState({ address: accounts[0], isConnected: true });
              } else {
                setWagmiState({ address: undefined, isConnected: false });
              }
            }
          } catch {}
        };
        checkAccount();
        const provider = typeof window !== "undefined" ? (window as any).ethereum : undefined;
        if (provider?.on) {
          provider.on("accountsChanged", checkAccount);
          return () => { provider.removeListener("accountsChanged", checkAccount); };
        }
      } catch {}
    })();
  }, [isWagmi]);

  useEffect(() => {
    if (isWagmi) return;

    // Nimiq: poll window.ethereum for accounts
    const checkAccounts = async () => {
      try {
        const provider = typeof window !== "undefined" ? (window as any).ethereum : undefined;
        if (!provider || typeof provider.request !== "function") return;

        const accounts: string[] = await provider.request({ method: "eth_accounts" }).catch(() => []);
        if (accounts && accounts.length > 0) {
          setNimiqState({ address: accounts[0], isConnected: true });
        } else {
          setNimiqState({ address: undefined, isConnected: false });
        }
      } catch {
        // provider not ready yet
      }
    };

    checkAccounts();

    // Listen for account changes
    const provider = typeof window !== "undefined" ? (window as any).ethereum : undefined;
    if (provider?.on) {
      provider.on("accountsChanged", checkAccounts);
      return () => { provider.removeListener("accountsChanged", checkAccounts); };
    }
  }, [isWagmi]);

  if (isWagmi) return wagmiState;
  return nimiqState;
}
