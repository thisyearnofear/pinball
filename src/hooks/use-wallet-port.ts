import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import type { WalletPort } from "@/domains/wallet/wallet-port";
import { Eip1193WalletPort } from "@/domains/wallet/eip1193-wallet-port";

/**
 * Bridges Wagmi connector to a WalletPort instance.
 * Re-derives the port whenever the wallet connection changes.
 */
export function useWalletPort(): WalletPort | null {
  const { isConnected, connector, address } = useAccount();
  const [walletPort, setWalletPort] = useState<WalletPort | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
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
    }

    sync();
    return () => { cancelled = true; };
  }, [isConnected, connector, address]);

  return walletPort;
}
