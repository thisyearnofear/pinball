import { ethers } from "ethers";
import { getContractsConfig } from "../../config/contracts";
import type { WalletPort } from "@/domains/wallet/wallet-port";

/**
 * Shared contract utilities.
 *
 * Core Principles:
 * - DRY: one public provider + contract factory.
 * - CLEAN: explicit separation of read (public RPC) vs write (wallet runner).
 */

export function getPublicProvider(): ethers.JsonRpcProvider {
  const { rpcUrlPublic } = getContractsConfig();
  return new ethers.JsonRpcProvider(rpcUrlPublic);
}

export function getPublicContract(address: string, abi: readonly string[]): ethers.Contract {
  return new ethers.Contract(address, abi, getPublicProvider());
}

export async function getWriteContract(address: string, abi: readonly string[], wallet: WalletPort): Promise<ethers.Contract> {
  const signer = await wallet.getSigner();
  return new ethers.Contract(address, abi, signer);
}

export async function waitForTxPublic(txHash: string): Promise<ethers.TransactionReceipt | null> {
  const provider = getPublicProvider();
  // waitForTransaction exists on JsonRpcProvider (ethers v6)
  // @ts-ignore
  return (await provider.waitForTransaction(txHash)) ?? null;
}

export async function estimateGasWithBuffer(
  estimate: () => Promise<bigint>,
  opts?: { fallback?: bigint; bufferBps?: bigint }
): Promise<bigint> {
  const fallback = opts?.fallback ?? 500000n;
  const bufferBps = opts?.bufferBps ?? 2000n; // +20%

  try {
    const gas = await estimate();
    // apply buffer: gas * (10000 + bufferBps) / 10000
    return (gas * (10000n + bufferBps)) / 10000n;
  } catch {
    return fallback;
  }
}
