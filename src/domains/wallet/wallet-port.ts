import type { ethers } from "ethers";

/**
 * WalletPort is the boundary between the app and any wallet implementation.
 *
 * Core Principles:
 * - CLEAN: explicit dependency boundary (domains depend on WalletPort, not UI/frameworks).
 * - MODULAR: swappable implementations (Passport/wagmi, legacy web3Service, etc.).
 */
export interface WalletPort {
  /** Ethers BrowserProvider backed by an EIP-1193 provider. */
  getProvider(): Promise<ethers.BrowserProvider>;
  /** Signer for tx signing/sending. */
  getSigner(): Promise<ethers.Signer>;
  /** Checksummed address for the current signer. */
  getAddress(): Promise<string>;
  /** Switch chain if supported by the wallet. */
  switchChain?(chainId: number): Promise<void>;
}

