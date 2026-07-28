import { ethers } from 'ethers';
import { getContractsConfig } from '../../config/contracts';
import { getAppConfig } from '../../config/app-config';
import { approvePaymentToken, getPaymentTokenAllowance, getPaymentTokenBalance, getPaymentTokenSymbol, getPaymentTokenDecimals, isNativePaymentToken } from './payment-token-client';
import { TOURNAMENT_MANAGER_ABI, TOURNAMENT_MANAGER_NATIVE_ABI } from './abi';
import {
  estimateGasWithBuffer,
  getPublicContract as getPublicEthersContract,
  getWriteContract,
  waitForTxPublic,
} from './contract-utils';
import type { WalletPort } from '@/domains/wallet/wallet-port';

/** Select the right ABI based on whether the payment token is native or ERC-20. */
function getTournamentABI() {
  return isNativePaymentToken() ? TOURNAMENT_MANAGER_NATIVE_ABI : TOURNAMENT_MANAGER_ABI;
}

function isConfigured(): boolean {
  try {
    const { tournamentManager } = getContractsConfig();
    return tournamentManager.address.length > 0 && tournamentManager.address.startsWith('0x');
  } catch {
    return false;
  }
}

async function getContract(wallet: WalletPort): Promise<ethers.Contract> {
  const { tournamentManager } = getContractsConfig();
  return await getWriteContract(tournamentManager.address, getTournamentABI(), wallet);
}

// Public read-only contract that doesn't require wallet connection
// Always use public RPC for reads - Farcaster's provider RPC has connectivity issues
function getPublicContract(): ethers.Contract {
  const { tournamentManager } = getContractsConfig();
  return getPublicEthersContract(tournamentManager.address, getTournamentABI());
}

function expectedChainName(chainId: number): string {
  try {
    const name = getAppConfig().chain.chainName;
    if (name) return name;
  } catch { /* fall through */ }
  return `network ${chainId}`;
}

/**
 * Make sure the wallet is on the tournament chain. Tries to switch (and add)
 * the network automatically; only throws when the wallet refuses or can't.
 */
export async function ensureExpectedNetwork(wallet: WalletPort): Promise<void> {
  const { chainId: expectedChainId } = getContractsConfig();

  const readChainId = async (): Promise<number> => {
    const provider = await wallet.getProvider();
    const hex: string = await provider.send('eth_chainId', []);
    return Number(BigInt(hex));
  };

  if (await readChainId() === expectedChainId) return;

  const chainName = expectedChainName(expectedChainId);
  if (wallet.switchChain) {
    try {
      await wallet.switchChain(expectedChainId);
      if (await readChainId() === expectedChainId) return;
    } catch {
      throw new Error(`Please approve the switch to ${chainName} in your wallet, then try again.`);
    }
  }
  throw new Error(`Your wallet is connected to the wrong network. Please switch to ${chainName} and try again.`);
}

export async function getActiveTournamentId(): Promise<number> {
  if (!isConfigured()) return 0;
  try {
    const c = getPublicContract();
    return await _getActiveTournamentId(c);
  } catch (error: any) {
    console.error('Failed to get active tournament ID:', error);
    throw error;
  }
}

export async function getNextPlayerNonce(tournamentId: number, address: string): Promise<string> {
  const c = getPublicContract();
  const lastNonce: bigint = await c.playerNonces(tournamentId, address);
  return (lastNonce + 1n).toString();
}

export async function getPlayerInfo(tournamentId: number, address: string): Promise<{
  entered: boolean;
  hasScore: boolean;
  bestScore: bigint;
  rewardClaimed: boolean;
}> {
  if (!isConfigured()) return { entered: false, hasScore: false, bestScore: 0n, rewardClaimed: false };
  const c = getPublicContract();
  const p = await c.playerInfo(tournamentId, address);
  return {
    entered: Boolean(p.entered),
    hasScore: Boolean(p.hasScore),
    bestScore: BigInt(p.bestScore ?? 0),
    rewardClaimed: Boolean(p.rewardClaimed),
  };
}

async function _getActiveTournamentId(contract: ethers.Contract): Promise<number> {
  // naive assumption: active tournament is lastTournamentId and within time window
  const lastId: bigint = await contract.lastTournamentId();
  if (lastId === 0n) throw new Error('No tournaments created');
  const t = await contract.tournaments(lastId);
  const nowSec = Math.floor(Date.now() / 1000);
  // t is now: [id, startTime, endTime, topN, finalized, prizeBps, totalPot]
  const isActive = Number(t.startTime) <= nowSec && nowSec <= Number(t.endTime) && !Boolean(t.finalized);
  if (!isActive) throw new Error('No active tournament currently');
  return Number(lastId);
}

export async function enterTournament(tournamentId: number, wallet: WalletPort): Promise<string> {
  const w = wallet;

  // Auto-switch the wallet to the tournament network before anything else
  await ensureExpectedNetwork(w);

  const c = await getContract(w);
  const publicContract = getPublicContract();

  try {
    const address = await w.getAddress();
    const tokenSymbol = getPaymentTokenSymbol();
    const tokenDecimals = getPaymentTokenDecimals();
    const native = isNativePaymentToken();
    const { tournamentManager } = getContractsConfig();

    const [fee, tournamentInfo, balance] = await Promise.all([
      publicContract.entryFee() as Promise<bigint>,
      getTournamentInfo(tournamentId),
      getPaymentTokenBalance(address),
    ]);

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec < tournamentInfo.startTime) throw new Error('Tournament has not started yet');
    if (nowSec > tournamentInfo.endTime) throw new Error('Tournament has ended');
    if (tournamentInfo.finalized) throw new Error('Tournament is already finalized');

    if (balance < fee) {
      throw new Error(`Insufficient ${tokenSymbol} balance. Need ${ethers.formatUnits(fee, tokenDecimals)} ${tokenSymbol}`);
    }

    if (native) {
      // Native token: send value directly with the transaction (no approve step)
      const gasLimit = await estimateGasWithBuffer(
        () => publicContract.enterTournament.estimateGas(tournamentId, { from: address, value: fee }),
        { fallback: 200000n, bufferBps: 5000n }
      );
      const tx = await c.enterTournament(tournamentId, { value: fee, gasLimit });
      const receiptPublic: ethers.TransactionReceipt | null = await waitForTxPublic(tx.hash).catch(() => null);
      const receipt: ethers.TransactionReceipt = receiptPublic ?? (await tx.wait());
      return receipt?.hash as string;
    }

    // ERC-20 token: approve + transferFrom flow
    const allowance = await getPaymentTokenAllowance(address, tournamentManager.address);
    if (allowance < fee) {
      await approvePaymentToken(tournamentManager.address, ethers.MaxUint256, w);
    }

    // Estimate gas via public RPC — the Farcaster provider throws "missing revert data"
    const gasLimit = await estimateGasWithBuffer(
      () => publicContract.enterTournament.estimateGas(tournamentId, { from: address }),
      { fallback: 500000n, bufferBps: 5000n } // +50%
    );

    // Explicit gasLimit so the wallet provider doesn't try (and fail) to estimate
    const tx = await c.enterTournament(tournamentId, { gasLimit });

    const receiptPublic: ethers.TransactionReceipt | null = await waitForTxPublic(tx.hash).catch(() => null);
    const receipt: ethers.TransactionReceipt = receiptPublic ?? (await tx.wait());

    return receipt?.hash as string;
  } catch (error: any) {
    console.error('enterTournament failed:', error);

    if (error.code === 'CALL_EXCEPTION') {
      if (error.message?.includes('insufficient funds')) {
        throw new Error('Insufficient funds for entry fee and gas');
      }

      // Re-check timing: the tournament may have ended between preflight and tx
      try {
        const info = await getTournamentInfo(tournamentId);
        const now = Math.floor(Date.now() / 1000);
        if (now < info.startTime) throw new Error('Tournament has not started yet');
        if (now > info.endTime) throw new Error('Tournament has ended');
        if (info.finalized) throw new Error('Tournament is finalized');
      } catch (infoError: any) {
        if (infoError?.message?.startsWith('Tournament')) throw infoError;
      }

      throw new Error('Transaction failed - tournament may not be active');
    }

    if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
      throw new Error('Transaction was rejected');
    }

    throw error;
  }
}

export async function submitScoreWithSignature(
  tournamentId: number,
  score: number,
  nonce: number,
  name: string,
  metadata: string,
  signature: string,
  wallet: WalletPort
): Promise<string> {
  const w = wallet;
  const address = await w.getAddress();

  const c = await getContract(w);
  const publicContract = getPublicContract();

  console.log('Estimating gas for submitScore via Public RPC...');
  const gasLimit = await estimateGasWithBuffer(
    () =>
      publicContract.submitScoreWithSignature.estimateGas(
        tournamentId,
        score,
        nonce,
        name,
        metadata,
        signature,
        { from: address }
      ),
    { fallback: 500000n, bufferBps: 2000n } // +20%
  );

  // Use the calculated gas limit to bypass gas estimation issues on Farcaster provider
  const tx = await c.submitScoreWithSignature(tournamentId, score, nonce, name, metadata, signature, {
    gasLimit: gasLimit
  });

  await waitForTxPublic(tx.hash).catch(() => tx.wait());

  return tx.hash;
}

export async function fetchLeaderboard(
  tournamentId: number,
  offset = 0,
  limit = 100,
  inverted = false
): Promise<{ address: string; score: number }[]> {
  if (!isConfigured()) return [];
  const c = getPublicContract();
  return await _fetchLeaderboard(c, tournamentId, offset, limit, inverted);
}

// Enhanced version with retry logic for better reliability after score submission
export async function fetchLeaderboardWithRetry(
  tournamentId: number,
  offset = 0,
  limit = 100,
  maxRetries = 3,
  delayMs = 2000,
  inverted = false
): Promise<{ address: string; score: number }[]> {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchLeaderboard(tournamentId, offset, limit, inverted);
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
  limit = 100,
  inverted = false
): Promise<{ address: string; score: number }[]> {
  const [addrs, scores]: [string[], bigint[]] = await contract.viewLeaderboard(tournamentId, offset, limit);
  let rows = addrs.map((a, i) => ({ address: a, score: Number(scores[i] || 0n) }));
  // client-side sort to avoid on-chain sort costs
  if (inverted) {
    // Kamikaze: lower drain time wins; score 0 means "no score yet" (real drains are >= MIN_DRAIN_MS)
    rows = rows.filter((r) => r.score > 0);
    rows.sort((a, b) => a.score - b.score);
  } else {
    rows.sort((a, b) => b.score - a.score);
  }
  return rows;
}

export async function getEntryFee(): Promise<bigint> {
  if (!isConfigured()) return 0n;
  const c = getPublicContract();
  return await c.entryFee();
}

export async function getTournamentInfo(tournamentId: number, retries = 3): Promise<{ startTime: number; endTime: number; topN: number; finalized: boolean; invertedWinCondition: boolean; totalPot: bigint; }> {
  if (!isConfigured()) return { startTime: 0, endTime: 0, topN: 0, finalized: false, invertedWinCondition: false, totalPot: 0n };
  const c = getPublicContract();
  return await _getTournamentInfo(c, tournamentId, retries);
}

async function _getTournamentInfo(contract: ethers.Contract, tournamentId: number, retries = 3): Promise<{ startTime: number; endTime: number; topN: number; finalized: boolean; invertedWinCondition: boolean; totalPot: bigint; }> {
  let lastError: any;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Result is: [id, startTime, endTime, topN, finalized, invertedWinCondition, totalPot]
      const t = await contract.tournaments(tournamentId);

      return {
        startTime: Number(t.startTime),
        endTime: Number(t.endTime),
        topN: Number(t.topN),
        finalized: Boolean(t.finalized),
        invertedWinCondition: Boolean(t.invertedWinCondition),
        totalPot: BigInt(t.totalPot),
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

export async function getWinners(tournamentId: number, wallet?: WalletPort): Promise<string[]> {
  if (!isConfigured()) return [];
  try {
    const c = getPublicContract();
    const w: string[] = await c.getWinners(tournamentId);
    return w;
  } catch (error: any) {
    console.warn('Public RPC failed for getWinners, trying wallet provider:', error);
    const c = await getContract(wallet);
    const w: string[] = await c.getWinners(tournamentId);
    return w;
  }
}

export async function getPrizeBps(tournamentId: number, wallet?: WalletPort): Promise<number[]> {
  try {
    const c = getPublicContract();
    const arr: bigint[] = await c.getPrizeBps(tournamentId);
    return arr.map(n => Number(n));
  } catch (error: any) {
    console.warn('Public RPC failed for getPrizeBps, trying wallet provider:', error);
    try {
      const c = await getContract(wallet);
      const arr: bigint[] = await c.getPrizeBps(tournamentId);
      return arr.map(n => Number(n));
    } catch (walletError: any) {
      throw error; // Throw original error
    }
  }
}

export async function claimReward(tournamentId: number, wallet?: WalletPort): Promise<string> {
  if (wallet) await ensureExpectedNetwork(wallet);
  const c = await getContract(wallet);
  const tx = await c.claimReward(tournamentId);
  const receipt = await tx.wait();
  return receipt?.hash as string;
}
