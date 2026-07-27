import { ethers } from "ethers";
import { switchOrAddChain } from "./switch-chain";
import type { WalletPort } from "./wallet-port";

export class Eip1193WalletPort implements WalletPort {
  private ethersProvider: ethers.BrowserProvider;

  constructor(private provider: any) {
    if (!provider || typeof provider.request !== "function") {
      throw new Error("Invalid EIP-1193 provider");
    }
    this.ethersProvider = new ethers.BrowserProvider(provider);
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
    await switchOrAddChain(this.provider, chainId);
    // ethers BrowserProvider caches the detected network; recreate after a switch
    this.ethersProvider = new ethers.BrowserProvider(this.provider);
  }
}

