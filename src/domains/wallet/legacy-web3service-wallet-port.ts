import { ethers } from "ethers";
import { web3Service } from "@/services/web3-service";
import type { WalletPort } from "./wallet-port";

/**
 * Temporary adapter around the existing singleton web3Service.
 * This isolates legacy usage to a single boundary and lets domains depend on WalletPort.
 */
export class LegacyWeb3ServiceWalletPort implements WalletPort {
  async getProvider(): Promise<ethers.BrowserProvider> {
    const provider = web3Service.getProvider();
    if (!provider) throw new Error("Wallet not connected");
    return provider;
  }

  async getSigner(): Promise<ethers.Signer> {
    const signer = web3Service.getSigner();
    if (signer) return signer;
    const provider = await this.getProvider();
    return provider.getSigner();
  }

  async getAddress(): Promise<string> {
    const addr = web3Service.getAddress();
    if (addr) return addr;
    const signer = await this.getSigner();
    return signer.getAddress();
  }

  async switchChain(chainId: number): Promise<void> {
    await web3Service.switchChain(chainId);
  }
}

export function getLegacyWalletPort(): WalletPort {
  return new LegacyWeb3ServiceWalletPort();
}

