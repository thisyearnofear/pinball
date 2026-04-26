import { ethers } from "ethers";
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
    // EIP-1193 chain switch request (works for most wallets if enabled).
    const hex = "0x" + chainId.toString(16);
    await this.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  }
}

