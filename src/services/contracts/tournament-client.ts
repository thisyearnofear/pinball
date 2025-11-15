import { ethers } from 'ethers';
import { getContractsConfig } from '../../config/contracts';
import { web3Service } from '../web3-service';

// Minimal ABI for the functions we use; replace with full ABI from deployed contract
export const TOURNAMENT_MANAGER_ABI = [
  "function entryFeeWei() view returns (uint256)",
  "function scoreSigner() view returns (address)",
  "function tournaments(uint256) view returns (uint256 id, uint64 startTime, uint64 endTime, uint16 topN, bool finalized, uint16[] prizeBps, uint256 totalPot)",
  "function lastTournamentId() view returns (uint256)",
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

export async function getActiveTournamentId(): Promise<number> {
  const c = getContract();
  // naive assumption: active tournament is lastTournamentId and within time window
  const lastId: bigint = await c.lastTournamentId();
  if (lastId === 0n) throw new Error('No tournaments created');
  const t = await c.tournaments(lastId);
  const nowSec = Math.floor(Date.now() / 1000);
  const isActive = Number(t.startTime) <= nowSec && nowSec <= Number(t.endTime) && !t.finalized;
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
  const c = getContract();
  const [addrs, scores]: [string[], bigint[]] = await c.viewLeaderboard(tournamentId, offset, limit);
  const rows = addrs.map((a, i) => ({ address: a, score: Number(scores[i] || 0n) }));
  // client-side sort desc to avoid on-chain sort costs
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

export async function getEntryFeeWei(): Promise<bigint> {
  const c = getContract();
  return await c.entryFeeWei();
}

export async function getTournamentInfo(tournamentId: number): Promise<{ startTime: number; endTime: number; topN: number; finalized: boolean; totalPot: bigint; }>{
  const c = getContract();
  const t = await c.tournaments(tournamentId);
  return {
    startTime: Number(t.startTime),
    endTime: Number(t.endTime),
    topN: Number(t.topN),
    finalized: Boolean(t.finalized),
    totalPot: BigInt(t.totalPot),
  };
}

export async function getWinners(tournamentId: number): Promise<string[]> {
  const c = getContract();
  const w: string[] = await c.getWinners(tournamentId);
  return w;
}

export async function claimReward(tournamentId: number): Promise<string> {
  const c = getContract();
  const tx = await c.claimReward(tournamentId);
  const receipt = await tx.wait();
  return receipt?.hash as string;
}
