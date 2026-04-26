import { ethers } from 'ethers';
import { getContractsConfig } from '../../config/contracts';
import { approveMUSD, getMUSDAllowance, getMUSDBalance } from './musd-client';
import { TOURNAMENT_MANAGER_ABI } from './abi';
import {
  estimateGasWithBuffer,
  getPublicContract as getPublicEthersContract,
  getWriteContract,
  waitForTxPublic,
} from './contract-utils';
import type { WalletPort } from '@/domains/wallet/wallet-port';
import { getLegacyWalletPort } from '@/domains/wallet/legacy-web3service-wallet-port';

async function getContract(wallet?: WalletPort): Promise<ethers.Contract> {
  const { tournamentManager } = getContractsConfig();
  const w = wallet ?? getLegacyWalletPort();
  return await getWriteContract(tournamentManager.address, TOURNAMENT_MANAGER_ABI, w);
}

// Public read-only contract that doesn't require wallet connection
// Always use public RPC for reads - Farcaster's provider RPC has connectivity issues
function getPublicContract(): ethers.Contract {
  const { tournamentManager } = getContractsConfig();
  return getPublicEthersContract(tournamentManager.address, TOURNAMENT_MANAGER_ABI);
}

export async function getActiveTournamentId(): Promise<number> {
  // Use public RPC for read operations (works reliably in all environments)
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
  bestScore: bigint;
  rewardClaimed: boolean;
}> {
  const c = getPublicContract();
  const p = await c.playerInfo(tournamentId, address);
  return {
    entered: Boolean(p.entered),
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

export async function enterTournament(tournamentId: number, wallet?: WalletPort): Promise<string> {
  const w = wallet ?? getLegacyWalletPort();
  const c = await getContract(w);

  try {
    // Pre-flight checks
    const signer = await w.getSigner();
    const address = await w.getAddress();
    console.log('=== ENTER TOURNAMENT DEBUG ===');
    console.log('Tournament ID:', tournamentId);
    console.log('Player address:', address);

    // Log provider details
    if (!signer.provider) throw new Error('No provider available on signer');
    const network = await signer.provider.getNetwork();
    console.log('Network:', {
      chainId: Number(network.chainId),
      name: network.name
    });

    // CRITICAL: Verify we're on the correct network before attempting transaction
    const { chainId: expectedChainId } = getContractsConfig();
    if (Number(network.chainId) !== expectedChainId) {
      throw new Error(`Wrong network. Please switch to chain ID ${expectedChainId} before entering the tournament. Currently on chain ID ${Number(network.chainId)}.`);
    }

    // Check provider type (Farcaster vs MetaMask)
    const provider = await w.getProvider();
    console.log('Provider type:', provider.constructor.name);
    // @ts-ignore - accessing internal property for debugging
    const underlyingProvider = provider._getConnection?.()?.url || 'unknown';
    console.log('Underlying provider:', underlyingProvider);

    // Check player's current status (for logging only - pay-per-play model allows multiple entries)
    const publicContract = getPublicContract();
    try {
      const playerInfo = await publicContract.playerInfo(tournamentId, address);
      console.log('Player info:', {
        entered: playerInfo.entered,
        bestScore: playerInfo.bestScore.toString(),
        playCount: 'Pay-per-play model - each entry adds to pot'
      });
    } catch (checkError) {
      console.warn('Could not check player info:', checkError);
    }

    const fee: bigint = await publicContract.entryFee();
    console.log('Entry fee:', ethers.formatUnits(fee, 18), 'MUSD');

    // Validate tournament is active before attempting transaction
    console.log('Validating tournament status...');
    try {
      const tournamentInfo = await getTournamentInfo(tournamentId);
      const nowSec = Math.floor(Date.now() / 1000);

      console.log('Tournament validation:', {
        tournamentId,
        startTime: tournamentInfo.startTime,
        endTime: tournamentInfo.endTime,
        currentTime: nowSec,
        finalized: tournamentInfo.finalized,
        isActive: nowSec >= tournamentInfo.startTime && nowSec <= tournamentInfo.endTime && !tournamentInfo.finalized,
        totalPot: ethers.formatUnits(tournamentInfo.totalPot, 18) + ' MUSD'
      });

      if (nowSec < tournamentInfo.startTime) {
        throw new Error('Tournament has not started yet');
      }
      if (nowSec > tournamentInfo.endTime) {
        throw new Error('Tournament has ended');
      }
      if (tournamentInfo.finalized) {
        throw new Error('Tournament is already finalized');
      }

      console.log('✓ Tournament is active and accepting entries');
    } catch (validationError: any) {
      console.error('❌ Tournament validation failed:', validationError);
      throw validationError;
    }

    // Ensure player has enough MUSD and allowance for transferFrom (DRY: do it once here).
    const balance = await getMUSDBalance(address);
    if (balance < fee) {
      throw new Error(`Insufficient MUSD balance. Need ${ethers.formatUnits(fee, 18)} MUSD`);
    }

    const { tournamentManager } = getContractsConfig();
    const allowance = await getMUSDAllowance(address, tournamentManager.address);
    if (allowance < fee) {
      console.log('Approving MUSD for tournament entry...');
      await approveMUSD(tournamentManager.address, ethers.MaxUint256, w);
    }

    // Estimate gas using PUBLIC RPC
    // This avoids "missing revert data" errors from Farcaster provider
    console.log('Estimating gas via Public RPC...');
    const gasLimit = await estimateGasWithBuffer(
      () => publicContract.enterTournament.estimateGas(tournamentId, { from: address }),
      { fallback: 500000n, bufferBps: 5000n } // +50%
    );
    console.log('Gas limit (buffered):', gasLimit.toString());

    console.log('Submitting enterTournament transaction...');
    console.log('Params:', { tournamentId, gasLimit: gasLimit.toString() });

    // Send transaction using Wallet Signer
    // We explicitly provide gasLimit so Farcaster provider doesn't try to estimate (and fail)
    const tx = await c.enterTournament(tournamentId, { gasLimit });

    console.log('Transaction submitted:', tx.hash);
    console.log('Waiting for confirmation via Public RPC...');

    const receiptPublic: ethers.TransactionReceipt | null = await waitForTxPublic(tx.hash).catch(() => null);
    const receipt: ethers.TransactionReceipt = receiptPublic ?? (await tx.wait());

    console.log('Transaction confirmed:', {
      hash: receipt?.hash,
      status: receipt?.status,
      gasUsed: receipt?.gasUsed?.toString()
    });

    // Verify entry using PUBLIC RPC
    console.log('Verifying tournament entry...');
    try {
      // Wait a bit for state to update
      await new Promise(resolve => setTimeout(resolve, 2000));

      const playerInfo = await publicContract.playerInfo(tournamentId, address);
      console.log('Post-entry player info:', {
        entered: playerInfo.entered,
        bestScore: playerInfo.bestScore.toString()
      });

      if (!playerInfo.entered) {
        console.error('❌ Transaction succeeded but player is NOT entered!');
        throw new Error('Entry transaction succeeded but player was not registered. Please try again.');
      }

      console.log('✓ Entry verified successfully');
    } catch (verifyError) {
      console.error('Entry verification failed:', verifyError);
      // Don't throw here, the tx succeeded so we should probably let them proceed
      // or at least return the hash
    }

    console.log('=== END DEBUG ===');

    return receipt?.hash as string;
  } catch (error: any) {
    console.error('=== ENTER TOURNAMENT ERROR ===');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error data:', error.data);
    console.error('Error reason:', error.reason);
    console.error('Full error:', error);
    console.error('=== END ERROR ===');

    // Enhanced error messages
    if (error.code === 'CALL_EXCEPTION') {
      if (error.message?.includes('insufficient funds')) {
        throw new Error('Insufficient funds for entry fee and gas');
      }

      // Check if tournament is active
      try {
        const info = await getTournamentInfo(tournamentId);
        const now = Math.floor(Date.now() / 1000);
        console.log('Tournament timing check:', {
          now,
          startTime: info.startTime,
          endTime: info.endTime,
          finalized: info.finalized,
          hasStarted: now >= info.startTime,
          hasEnded: now > info.endTime
        });

        if (now < info.startTime) {
          throw new Error('Tournament has not started yet');
        }
        if (now > info.endTime) {
          throw new Error('Tournament has ended');
        }
        if (info.finalized) {
          throw new Error('Tournament is finalized');
        }
      } catch (infoError) {
        console.warn('Could not fetch tournament info:', infoError);
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
  wallet?: WalletPort
): Promise<string> {
  const w = wallet ?? getLegacyWalletPort();
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
  limit = 100
): Promise<{ address: string; score: number }[]> {
  // Always use public RPC for reliability
  const c = getPublicContract();
  return await _fetchLeaderboard(c, tournamentId, offset, limit);
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

export async function getEntryFee(): Promise<bigint> {
  const c = getPublicContract();
  return await c.entryFee();
}

export async function getTournamentInfo(tournamentId: number, retries = 3): Promise<{ startTime: number; endTime: number; topN: number; finalized: boolean; totalPot: bigint; }> {
  const c = getPublicContract();
  return await _getTournamentInfo(c, tournamentId, retries);
}

async function _getTournamentInfo(contract: ethers.Contract, tournamentId: number, retries = 3): Promise<{ startTime: number; endTime: number; topN: number; finalized: boolean; totalPot: bigint; }> {
  let lastError: any;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Result is now: [id, startTime, endTime, topN, finalized, prizeBps, totalPot]
      const t = await contract.tournaments(tournamentId);

      return {
        startTime: Number(t.startTime),
        endTime: Number(t.endTime),
        topN: Number(t.topN),
        finalized: Boolean(t.finalized),
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
  const c = await getContract(wallet);
  const tx = await c.claimReward(tournamentId);
  const receipt = await tx.wait();
  return receipt?.hash as string;
}
