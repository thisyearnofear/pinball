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

// Backup public RPCs, keyed by chain ID. Ordered by reliability within each
// chain: drpc.org is consistently up; publicnode endpoints are kept only as a
// last resort (they have been observed dropping connections intermittently,
// which ethers misreads as a contract revert). The env-configured primary is
// tried first so operators can point at their own node.
const FALLBACK_RPCS: Record<number, string[]> = {
  // Polygon mainnet (chain 137)
  137: [
    "https://polygon.drpc.org",
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon.llamarpc.com",
  ],
  // Polygon Amoy testnet (chain 80002)
  80002: [
    "https://polygon-amoy.drpc.org",
    "https://polygon-amoy.publicnode.com",
    "https://polygon-amoy-bor-rpc.publicnode.com",
  ],
};

/**
 * Is this error a transient transport failure rather than a genuine contract
 * revert? When an RPC node drops the connection mid-call, ethers surfaces a
 * CALL_EXCEPTION with data=null and no reason (there is no revert payload
 * because the socket closed). We treat that — plus network/server/timeout
 * codes — as retryable so the next endpoint gets a chance.
 */
function isTransientChainError(e: unknown): boolean {
  const err = e as { code?: string; data?: unknown; reason?: string | null } | null;
  if (!err) return false;
  if (err.code === "NETWORK_ERROR" || err.code === "SERVER_ERROR" || err.code === "TIMEOUT") {
    return true;
  }
  if (err.code === "CALL_EXCEPTION") {
    const hasData = err.data !== null && err.data !== undefined && err.data !== "0x";
    const hasReason = typeof err.reason === "string" && err.reason.length > 0;
    return !hasData && !hasReason;
  }
  return false;
}

/**
 * A read-only provider that fails over across several RPC endpoints. Each call
 * is tried against the endpoints in order; a transient failure (dropped
 * connection) advances to the next endpoint, while a genuine revert is thrown
 * immediately. This keeps reads working even when some endpoints are down, and
 * never misreports a dropped connection as a contract revert to the UI.
 */
class ResilientPublicProvider extends ethers.JsonRpcProvider {
  readonly #urls: string[];
  readonly #chainId: number;
  readonly #net: ethers.Network;
  #pool: Map<string, ethers.JsonRpcProvider> = new Map();
  constructor(urls: string[], chainId: number) {
    const net = ethers.Network.from(chainId);
    super(urls[0], chainId, { staticNetwork: net });
    this.#urls = urls;
    this.#chainId = chainId;
    this.#net = net;
  }

  #endpoint(url: string): ethers.JsonRpcProvider {
    let p = this.#pool.get(url);
    if (!p) {
      p = new ethers.JsonRpcProvider(url, this.#chainId, { staticNetwork: this.#net });
      this.#pool.set(url, p);
    }
    return p;
  }

  override async send(method: string, params: Array<any> | Record<string, any>): Promise<any> {
    let lastErr: unknown = null;
    for (const url of this.#urls) {
      try {
        return await this.#endpoint(url).send(method, params);
      } catch (e) {
        lastErr = e;
        if (!isTransientChainError(e)) throw e; // genuine revert / real failure
      }
    }
    throw lastErr;
  }
}

let cachedProvider: ResilientPublicProvider | null = null;

export function getPublicProvider(): ethers.JsonRpcProvider {
  if (cachedProvider) return cachedProvider;

  const { rpcUrlPublic, chainId } = getContractsConfig();

  const chainFallbacks = FALLBACK_RPCS[chainId] ?? [];
  const urls = [rpcUrlPublic, ...chainFallbacks].filter(
    (u, i, a) => Boolean(u) && a.indexOf(u) === i
  );

  cachedProvider = new ResilientPublicProvider(urls, chainId);
  return cachedProvider;
}

/**
 * Classify a thrown ethers error into a short, user-safe message.
 *
 * A dropped RPC connection surfaces to ethers as a CALL_EXCEPTION with
 * data=null / reason=null (there is no revert payload because the socket
 * closed). That is a transient network problem, not a real contract revert,
 * so we never show the raw ethers blob to the user. Genuine reverts that
 * carry a reason are surfaced with that reason.
 */
export function friendlyChainError(e: unknown, fallback = "Something went wrong talking to the network. Please try again."): string {
  const err = e as { code?: string; reason?: string | null; message?: string } | null;
  if (!err) return fallback;
  if (err.code === "CALL_EXCEPTION") {
    const reason = typeof err.reason === "string" && err.reason.trim() ? err.reason.trim() : null;
    if (reason) return `The contract rejected this action: ${reason}`;
    // No revert data → almost always a dropped/blocked RPC connection.
    return "Network hiccup reaching the blockchain. Please try again in a moment.";
  }
  if (err.code === "NETWORK_ERROR" || err.code === "SERVER_ERROR" || err.code === "TIMEOUT") {
    return "Couldn't reach the blockchain right now. Please try again.";
  }
  const msg = typeof err.message === "string" ? err.message : "";
  // Never leak the raw ethers blob; only pass through short, clean messages.
  if (msg && msg.length <= 120 && !msg.includes("{")) return msg;
  return fallback;
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
