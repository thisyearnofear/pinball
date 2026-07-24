/**
 * NimiqWalletPort — implements the WalletPort interface using the
 * Nimiq Pay Mini App SDK's injected EVM provider (window.ethereum).
 *
 * The Nimiq Pay app injects a standard EIP-1193 provider for EVM chains
 * (Polygon, Arbitrum, Base, etc.) into the WebView. This adapter wraps it
 * in the same ethers.BrowserProvider pattern as Eip1193WalletPort, so
 * contract clients are completely unaware of which ecosystem they're on.
 *
 * For NIM-native operations (non-EVM), the Mini App SDK provides a separate
 * Nimiq provider via init(). That path would require a non-ethers signer
 * and is a future extension. For now, NIM payments on Nimiq Pay use the
 * EVM provider path with USDT on Polygon, or native ETH-style value transfers.
 *
 * See: https://nimiq.dev/mini-apps/
 */
import { ethers } from "ethers";
import type { WalletPort } from "./wallet-port";

export class NimiqWalletPort implements WalletPort {
  private ethersProvider: ethers.BrowserProvider;
  private rawProvider: any;

  constructor(provider?: any) {
    // In the Nimiq Pay WebView, window.ethereum is injected.
    // Outside of Nimiq Pay (e.g. dev environment), we fall back to window.ethereum
    // if available, or throw.
    const p = provider ?? (typeof window !== "undefined" ? (window as any).ethereum : undefined);
    if (!p || typeof p.request !== "function") {
      throw new Error("NimiqWalletPort: no EIP-1193 provider available. Are you running inside Nimiq Pay?");
    }
    this.rawProvider = p;
    this.ethersProvider = new ethers.BrowserProvider(p);
  }

  async getProvider(): Promise<ethers.BrowserProvider> {
    return this.ethersProvider;
  }

  async getSigner(): Promise<ethers.Signer> {
    return this.ethersProvider.getSigner();
  }

  async getAddress(): Promise<string> {
    const signer = await this.getSigner();
    return signer.getAddress();
  }

  async switchChain(chainId: number): Promise<void> {
    const hex = "0x" + chainId.toString(16);
    await this.rawProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  }
}
