import { ethers } from 'ethers';
import { getContractsConfig } from '../../config/contracts';
import { web3Service } from '../web3-service';

// Minimal ABI for the functions we use; replace with full ABI from deployed contract
export const TOURNAMENT_MANAGER_ABI = [
  "function entryFeeWei() view returns (uint256)",
  "function scoreSigner() view returns (address)",
  "function tournaments(uint256) view returns (tuple(uint256,uint64,uint64,uint16,bool,uint256) t)",
  "function lastTournamentId() view returns (uint256)",
  "function getPrizeBps(uint256 id) view returns (uint16[])",
  "function enterTournament(uint256 id) payable",
  "function submitScoreWithSignature(uint256 id, uint256 score, string name, string metadata, bytes signature)",
  "function viewLeaderboard(uint256 id, uint256 offset, uint256 limit) view returns (address[] addrs, uint256[] scores)",
  "function finalize(uint256 id)",
  "function getWinners(uint256 id) view returns (address[])",
  "function claimReward(uint256 id)",
];

function getContract(): ethers.Contract {
  const signer = web3Service.getSigner();
  const provider = web3Service.getProvider();
  if (!provider) throw new Error('Wallet not connected');
  const { chainId, tournamentManager } = getContractsConfig();
  // optional: validate chainId matches current provider network
  // we can't await here; rely on UI to enforce switchChain before actions
  const runner = signer ?? provider;
  return new ethers.Contract(tournamentManager.address, TOURNAMENT_MANAGER_ABI, runner);
}

// Public read-only contract that doesn't require wallet connection
function getPublicContract(): ethers.Contract {
  const { chainId, tournamentManager } = getContractsConfig();
  // Use public RPC provider for read-only operations
  let rpcUrl: string;
  if (chainId === 42161) { // Arbitrum One
    rpcUrl = 'https://arb1.arbitrum.io/rpc';
  } else if (chainId === 421614) { // Arbitrum Sepolia
    rpcUrl = 'https://sepolia-rollup.arbitrum.io/rpc';
  } else {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Contract(tournamentManager.address, TOURNAMENT_MANAGER_ABI, provider);
}

export async function getActiveTournamentId(): Promise<number> {
  try {
    const c = getContract();
    return await _getActiveTournamentId(c);
  } catch (error: any) {
    if (error.message === 'Wallet not connected') {
      const c = getPublicContract();
      return await _getActiveTournamentId(c);
    }
    throw error;
  }
}

async function _getActiveTournamentId(contract: ethers.Contract): Promise<number> {
  // naive assumption: active tournament is lastTournamentId and within time window
  const lastId: bigint = await contract.lastTournamentId();
  if (lastId === 0n) throw new Error('No tournaments created');
  const t = await contract.tournaments(lastId);
  const nowSec = Math.floor(Date.now() / 1000);
  const isActive = Number(t[1]) <= nowSec && nowSec <= Number(t[2]) && !Boolean(t[4]);
  if (!isActive) throw new Error('No active tournament currently');
  return Number(lastId);
}

export async function enterTournament(tournamentId: number): Promise<string> {
  const c = getContract();
  const fee: bigint = await c.entryFeeWei();
  const tx = await c.enterTournament(tournamentId, { value: fee });
  const receipt = await tx.wait();
  return receipt?.hash as string;
}

export async function submitScoreWithSignature(
  tournamentId: number,
  score: number,
  name: string,
  metadata: string,
  signature: string
): Promise<string> {
  const c = getContract();
  const tx = await c.submitScoreWithSignature(tournamentId, score, name, metadata, signature);
  const receipt = await tx.wait();
  return receipt?.hash as string;
}

export async function fetchLeaderboard(
  tournamentId: number,
  offset = 0,
  limit = 100
): Promise<{ address: string; score: number }[]> {
  try {
    const c = getContract();
    return await _fetchLeaderboard(c, tournamentId, offset, limit);
  } catch (error: any) {
    if (error.message === 'Wallet not connected') {
      const c = getPublicContract();
      return await _fetchLeaderboard(c, tournamentId, offset, limit);
    }
    throw error;
  }
}

// Enhanced version with retry logic for better reliability after score submission
export async function fetchLeaderboardWithRetry(
  tournamentId: number,
  offset = 0,
  limit = 100,
  maxRetries = 3,
  delayMs = 2000
): Promise<{ address: string; score: number }[]> {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchLeaderboard(tournamentId, offset, limit);
      // If successful, return the result
      return result;
    } catch (error) {
      lastError = error;
      console.log(`Leaderboard fetch attempt ${attempt + 1} failed:`, error);
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        break;
      }
      
      // Wait before retrying (exponential backoff could be implemented here)
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // If all retries failed, throw the last error
  throw lastError;
}

async function _fetchLeaderboard(
  contract: ethers.Contract,
  tournamentId: number,
  offset = 0,
  limit = 100
): Promise<{ address: string; score: number }[]> {
  const [addrs, scores]: [string[], bigint[]] = await contract.viewLeaderboard(tournamentId, offset, limit);
  const rows = addrs.map((a, i) => ({ address: a, score: Number(scores[i] || 0n) }));
  // client-side sort desc to avoid on-chain sort costs
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

export async function getEntryFeeWei(): Promise<bigint> {
  try {
    const c = getContract();
    return await c.entryFeeWei();
  } catch (error: any) {
    if (error.message === 'Wallet not connected') {
      const c = getPublicContract();
      return await c.entryFeeWei();
    }
    throw error;
  }
}

export async function getTournamentInfo(tournamentId: number, retries = 3): Promise<{ startTime: number; endTime: number; topN: number; finalized: boolean; totalPot: bigint; }>{
  try {
    const c = getContract();
    return await _getTournamentInfo(c, tournamentId, retries);
  } catch (error: any) {
    if (error.message === 'Wallet not connected') {
      const c = getPublicContract();
      return await _getTournamentInfo(c, tournamentId, retries);
    }
    throw error;
  }
}

async function _getTournamentInfo(contract: ethers.Contract, tournamentId: number, retries = 3): Promise<{ startTime: number; endTime: number; topN: number; finalized: boolean; totalPot: bigint; }>{
  let lastError: any;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Result is a tuple, access as t
      const t = await contract.tournaments(tournamentId);
      
      return {
        startTime: Number(t[1]),
        endTime: Number(t[2]),
        topN: Number(t[3]),
        finalized: Boolean(t[4]),
        totalPot: BigInt(t[5]),
      };
    } catch (error: any) {
      lastError = error;
      
      // Only retry on BAD_DATA errors (decoding issues), not other errors
      if (error.code !== 'BAD_DATA' || attempt === retries - 1) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff: 200ms, 400ms, etc.)
      await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  
  throw lastError;
}

export async function getWinners(tournamentId: number): Promise<string[]> {
  try {
    const c = getContract();
    const w: string[] = await c.getWinners(tournamentId);
    return w;
  } catch (error: any) {
    if (error.message === 'Wallet not connected') {
      const c = getPublicContract();
      const w: string[] = await c.getWinners(tournamentId);
      return w;
    }
    throw error;
  }
}

export async function getPrizeBps(tournamentId: number): Promise<number[]> {
  try {
    const c = getContract();
    const arr: bigint[] = await c.getPrizeBps(tournamentId);
    return arr.map(n => Number(n));
  } catch (error: any) {
    if (error.message === 'Wallet not connected') {
      try {
        const c = getPublicContract();
        const arr: bigint[] = await c.getPrizeBps(tournamentId);
        return arr.map(n => Number(n));
      } catch (publicError: any) {
        // Fallback so UI can function even if not deployed yet
        throw publicError;
      }
    }
    // Fallback so UI can function even if not deployed yet
    throw error;
  }
}

export async function claimReward(tournamentId: number): Promise<string> {
  const c = getContract();
  const tx = await c.claimReward(tournamentId);
  const receipt = await tx.wait();
  return receipt?.hash as string;
}
