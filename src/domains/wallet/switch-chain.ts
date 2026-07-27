import { getAppConfig } from "@/config/app-config";

/**
 * Switch an EIP-1193 provider to the given chain, adding it to the wallet
 * first (wallet_addEthereumChain) when the wallet reports 4902 (unknown chain).
 * Only the app's configured chain can be added — we have no metadata for others.
 */
export async function switchOrAddChain(provider: { request(args: { method: string; params?: unknown[] }): Promise<unknown> }, chainId: number): Promise<void> {
  const hex = "0x" + chainId.toString(16);
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  } catch (error: any) {
    const code = error?.code ?? error?.data?.originalError?.code;
    if (code !== 4902) throw error;

    const cfg = getAppConfig().chain;
    if (cfg.chainId !== chainId) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: hex,
        chainName: cfg.chainName ?? `Chain ${chainId}`,
        rpcUrls: [cfg.rpcUrlPublic],
        nativeCurrency: cfg.nativeCurrency ?? { name: "ETH", symbol: "ETH", decimals: 18 },
        ...(cfg.blockExplorerUrl ? { blockExplorerUrls: [cfg.blockExplorerUrl] } : {}),
      }],
    });
  }
}
