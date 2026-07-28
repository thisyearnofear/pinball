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

// Backup public RPCs for Polygon Amoy (chain 80002). The primary comes from
// env; these are fallbacks so a single endpoint going down doesn't break reads.
const AMOY_FALLBACK_RPCS = [
  "https://polygon-amoy.drpc.org",
  "https://polygon-amoy-bor-rpc.publicnode.com",
];

let cachedProvider: ethers.FallbackProvider | null = null;

export function getPublicProvider(): ethers.FallbackProvider {
  if (cachedProvider) return cachedProvider;

  const { rpcUrlPublic, chainId } = getContractsConfig();
  // staticNetwork prevents ethers from auto-detecting the network on every
  // call (which retries infinitely when the node is down).
  const opts = { staticNetwork: ethers.Network.from(chainId) };

  const urls = [rpcUrlPublic, ...AMOY_FALLBACK_RPCS.filter((u) => u !== rpcUrlPublic)];
  const providers = urls.map((url) => new ethers.JsonRpcProvider(url, chainId, opts));

  // quorum: 1 returns as soon as any provider answers, so a downed endpoint
  // can't stall reads waiting for a second matching response.
  cachedProvider = new ethers.FallbackProvider(providers, chainId, { quorum: 1 });
  return cachedProvider;
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
