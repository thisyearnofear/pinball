import { Contract, JsonRpcProvider } from 'ethers';
import { env } from './env.js';
import { nonceTracker } from './nonce-tracker.js';

/**
 * Server-side nonce derivation.
 *
 * The contract enforces strictly sequential nonces (playerNonces[id][player] + 1),
 * so the source of truth is the chain. We read playerNonces when a TournamentManager
 * address is configured and take the max of (chain + 1, local tracker) — the local
 * tracker covers signatures we issued that haven't landed on-chain yet.
 */

const TM_ABI = ['function playerNonces(uint256, address) view returns (uint256)'];

let provider: JsonRpcProvider | null = null;
function getProvider(): JsonRpcProvider {
  if (!provider) provider = new JsonRpcProvider(env.MEZO_RPC_URL);
  return provider;
}

export async function deriveNextNonce(tournamentId: number, playerAddress: string): Promise<bigint> {
  const localNext = await nonceTracker.getNextNonce(tournamentId, playerAddress);

  if (!env.TOURNAMENT_MANAGER_ADDRESS) return localNext;

  try {
    const tm = new Contract(env.TOURNAMENT_MANAGER_ADDRESS, TM_ABI, getProvider());
    const onChain: bigint = await tm.playerNonces(tournamentId, playerAddress);
    const chainNext = onChain + 1n;
    return chainNext > localNext ? chainNext : localNext;
  } catch {
    // RPC hiccup: fall back to the local tracker rather than failing the request
    return localNext;
  }
}
