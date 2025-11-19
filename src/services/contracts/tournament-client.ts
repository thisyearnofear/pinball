import { ethers } from 'ethers';
import { getContractsConfig } from '../../config/contracts';
import { web3Service } from '../web3-service';

// Minimal ABI for the functions we use; replace with full ABI from deployed contract
export const TOURNAMENT_MANAGER_ABI = [
  "function entryFeeWei() view returns (uint256)",
  "function scoreSigner() view returns (address)",
  "function tournaments(uint256) view returns (uint256 id, uint64 startTime, uint64 endTime, uint16 topN, bool finalized, uint256 totalPot)",
  "function lastTournamentId() view returns (uint256)",
  "function getPrizeBps(uint256 id) view returns (uint16[])",
  "function enterTournament(uint256 id) payable",
  "function submitScoreWithSignature(uint256 id, uint256 score, uint256 nonce, string name, string metadata, bytes signature)",
  "function submitScoreWithSignatureV1(uint256 id, uint256 score, string name, string metadata, bytes signature)",
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
// Always use public RPC for reads - Farcaster's provider RPC has connectivity issues
function getPublicContract(): ethers.Contract {
  const { chainId, tournamentManager } = getContractsConfig();

  // Always use public RPC for read operations
  // Farcaster's Privy provider uses its own RPC which may have connectivity/sync issues
  if (chainId !== 42161) {
    throw new Error(`Unsupported chain ID: ${chainId}. Only Arbitrum One (42161) is supported.`);
  }

  console.log('📖 Using public RPC for contract reads (reliable for all environments)');
  const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  return new ethers.Contract(tournamentManager.address, TOURNAMENT_MANAGER_ABI, provider);
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

export async function enterTournament(tournamentId: number): Promise<string> {
  const c = getContract();

  try {
    // Pre-flight checks
    const signer = web3Service.getSigner();
    if (!signer) throw new Error('No signer available');

    const address = await signer.getAddress();
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
      throw new Error(`Wrong network. Please switch to chain ID ${expectedChainId} (Arbitrum One) before entering the tournament. Currently on chain ID ${Number(network.chainId)}.`);
    }

    // Check provider type (Farcaster vs MetaMask)
    const provider = web3Service.getProvider();
    if (provider) {
      console.log('Provider type:', provider.constructor.name);
      // @ts-ignore - accessing internal property for debugging
      const underlyingProvider = provider._getConnection?.()?.url || 'unknown';
      console.log('Underlying provider:', underlyingProvider);
    }

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

    const fee: bigint = await publicContract.entryFeeWei();
    console.log('Entry fee:', ethers.formatEther(fee), 'ETH');

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
        totalPot: ethers.formatEther(tournamentInfo.totalPot) + ' ETH'
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

    // Check balance using PUBLIC RPC (more reliable)
    const balance = await publicContract.runner?.provider?.getBalance(address) ?? 0n;
    console.log('Wallet balance (via Public RPC):', ethers.formatEther(balance), 'ETH');

    if (balance < fee) {
      throw new Error(`Insufficient balance. Need ${ethers.formatEther(fee)} ETH, have ${ethers.formatEther(balance)} ETH`);
    }

    // Estimate gas using PUBLIC RPC
    // This avoids "missing revert data" errors from Farcaster provider
    let gasLimit = 500000n; // Safe default
    try {
      console.log('Estimating gas via Public RPC...');
      const estimatedGas = await publicContract.enterTournament.estimateGas(tournamentId, {
        value: fee,
        from: address
      });
      console.log('✓ Gas estimated via Public RPC:', estimatedGas.toString());
      gasLimit = (estimatedGas * 150n) / 100n; // Add 50% buffer to be safe
    } catch (estimateError: any) {
      console.warn('❌ Public RPC gas estimation failed, using default 500k:', estimateError.message);
      // If public RPC fails, it might be a real revert (e.g. insufficient funds, not active)
      if (estimateError.message?.includes('execution reverted')) {
        throw new Error('Transaction would fail. Please check your balance and tournament status.');
      }
    }

    console.log('Submitting enterTournament transaction...');
    console.log('Params:', { tournamentId, value: ethers.formatEther(fee), gasLimit: gasLimit.toString() });

    // Send transaction using Wallet Signer
    // We explicitly provide gasLimit so Farcaster provider doesn't try to estimate (and fail)
    const tx = await c.enterTournament(tournamentId, {
      value: fee,
      gasLimit: gasLimit
    });

    console.log('Transaction submitted:', tx.hash);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
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
  signature: string
): Promise<string> {
  const address = web3Service.getAddress();
  if (!address) {
    throw new Error("Wallet not connected");
  }

  const c = getContract();
  const publicContract = getPublicContract();

  let gasLimit = 500000n; // Safe default

  try {
    console.log('Estimating gas for submitScore via Public RPC...');
    const estimatedGas = await publicContract.submitScoreWithSignature.estimateGas(
      tournamentId, score, nonce, name, metadata, signature,
      { from: address }
    );
    console.log('✓ Gas estimated via Public RPC:', estimatedGas.toString());
    gasLimit = (estimatedGas * 120n) / 100n; // 20% buffer
  } catch (e) {
    console.warn('Public RPC gas estimation failed for submitScore, using default:', e);
  }

  // Use the calculated gas limit to bypass gas estimation issues on Farcaster provider
  const tx = await c.submitScoreWithSignature(tournamentId, score, nonce, name, metadata, signature, {
    gasLimit: gasLimit
  });
  const receipt = await tx.wait();
  return receipt?.hash as string;
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

export async function getEntryFeeWei(): Promise<bigint> {
  const c = getPublicContract();
  return await c.entryFeeWei();
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

export async function getWinners(tournamentId: number): Promise<string[]> {
  try {
    const c = getPublicContract();
    const w: string[] = await c.getWinners(tournamentId);
    return w;
  } catch (error: any) {
    console.warn('Public RPC failed for getWinners, trying wallet provider:', error);
    const c = getContract();
    const w: string[] = await c.getWinners(tournamentId);
    return w;
  }
}

export async function getPrizeBps(tournamentId: number): Promise<number[]> {
  try {
    const c = getPublicContract();
    const arr: bigint[] = await c.getPrizeBps(tournamentId);
    return arr.map(n => Number(n));
  } catch (error: any) {
    console.warn('Public RPC failed for getPrizeBps, trying wallet provider:', error);
    try {
      const c = getContract();
      const arr: bigint[] = await c.getPrizeBps(tournamentId);
      return arr.map(n => Number(n));
    } catch (walletError: any) {
      throw error; // Throw original error
    }
  }
}

export async function claimReward(tournamentId: number): Promise<string> {
  const c = getContract();
  const tx = await c.claimReward(tournamentId);
  const receipt = await tx.wait();
  return receipt?.hash as string;
}
