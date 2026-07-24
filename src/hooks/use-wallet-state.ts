"use client";

/**
 * useWalletState — unified wallet connection state across ecosystems.
 *
 * Wagmi profile: delegates to wagmi's useAccount().
 * Nimiq profile: tracks connection state from the NimiqWalletPort lifecycle.
 *
 * This lets GameScreen and AppHeader work without knowing which adapter is active.
 */
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { getAppConfig } from "@/config/app-config";

export type WalletState = {
  address: string | undefined;
  isConnected: boolean;
};

export function useWalletState(): WalletState {
  const cfg = getAppConfig();
  const isWagmi = cfg.walletAdapter === "wagmi";

  // wagmi path
  const wagmiAccount = useAccount();

  // nimiq path
  const [nimiqState, setNimiqState] = useState<WalletState>({
    address: undefined,
    isConnected: false,
  });

  useEffect(() => {
    if (isWagmi) return; // wagmi handles it

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

  if (isWagmi) {
    return {
      address: wagmiAccount.address,
      isConnected: wagmiAccount.isConnected,
    };
  }

  return nimiqState;
}
