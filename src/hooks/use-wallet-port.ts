import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { getAppConfig } from "@/config/app-config";
import type { WalletPort } from "@/domains/wallet/wallet-port";
import { Eip1193WalletPort } from "@/domains/wallet/eip1193-wallet-port";
import { NimiqWalletPort } from "@/domains/wallet/nimiq-wallet-port";

/**
 * Bridges the active wallet connector to a WalletPort instance.
 * Selects the adapter based on the ecosystem profile:
 * - wagmi: uses Wagmi connector (RainbowKit)
 * - nimiq: uses Nimiq Pay injected provider
 *
 * Re-derives the port whenever the wallet connection changes.
 *
 * Note: useAccount() is always called (React hooks rules) but its return
 * value is only used when the wagmi adapter is active. When the nimiq adapter
 * is active, GameScreen is rendered without a WagmiProvider, so useAccount
 * returns a disconnected state (wagmi handles missing provider gracefully).
 */
export function useWalletPort(): WalletPort | null {
  const cfg = getAppConfig();
  const isWagmi = cfg.walletAdapter === "wagmi";
  const wagmiAccount = useAccount();
  const [walletPort, setWalletPort] = useState<WalletPort | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      if (isWagmi) {
        const { isConnected, connector, address } = wagmiAccount;
        if (!isConnected || !connector || !address) {
          setWalletPort(null);
          return;
        }

        try {
          const provider = (await connector.getProvider()) as any;
          if (!provider || typeof provider.request !== "function") return;

          const port = new Eip1193WalletPort(provider);
          await port.getAddress();
          if (!cancelled) setWalletPort(port);
        } catch (e) {
          console.error("Failed to initialize wallet port:", e);
          if (!cancelled) setWalletPort(null);
        }
      } else {
        // Nimiq adapter: uses window.ethereum injected by Nimiq Pay
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

          const port = new NimiqWalletPort(provider);
          await port.getAddress();
          if (!cancelled) setWalletPort(port);
        } catch (e) {
          console.error("Failed to initialize Nimiq wallet port:", e);
          if (!cancelled) setWalletPort(null);
        }
      }
    }

    sync();
    return () => { cancelled = true; };
  }, [isWagmi, wagmiAccount.isConnected, wagmiAccount.connector, wagmiAccount.address]);

  return walletPort;
}
