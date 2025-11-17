/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2023 - https://www.igorski.nl
 */

// Contract-backed high score service (no REST, no mocks)
// Keeps the same public API (startGame, stopGame, getHighScores)

import { web3Service } from './web3-service';
import { getActiveTournamentId, fetchLeaderboard, submitScoreWithSignature, enterTournament, getEntryFeeWei, getTournamentInfo } from './contracts/tournament-client';
import { requestScoreSignature } from './backend-scores-client';
import { getContractsConfig } from '../config/contracts';
import { showToast } from '@/services/toast';
import { getFromStorage, setInStorage } from '@/utils/local-storage';

// Import ethers for direct contract access if needed
import { ethers } from 'ethers';

// Submission state tracking for UI feedback
export type SubmissionStep = 'validating' | 'signing' | 'ready' | 'error';
export type SubmissionStateCallback = (step: SubmissionStep, errorMessage?: string) => void;

let submissionStateCallback: SubmissionStateCallback | null = null;

export const setSubmissionStateCallback = (callback: SubmissionStateCallback | null): void => {
    submissionStateCallback = callback;
};

const notifySubmissionState = (step: SubmissionStep, errorMessage?: string): void => {
    if (submissionStateCallback) {
        submissionStateCallback(step, errorMessage);
    }
};

export type HighScoreDef = {
    name: string; // currently we don't store names on-chain; keep field for compatibility
    score: number;
    duration: number; // not tracked on-chain; set to 0 to preserve shape
};

export const isSupported = (): boolean => {
    // Supported only when wallet is connected and contracts are configured
    try {
        if (!web3Service.isConnected()) {
            return false;
        }
        
        // Additional check: verify configuration is available
        try {
            getContractsConfig();
            return true;
        } catch {
            return false;
        }
    } catch {
        return false;
    }
};

/**
 * Invoke when starting a new game; returns active tournament id as the session id.
 * Note: Does not automatically enter tournament - user must explicitly join via modal.
 */
export const startGame = async (): Promise<string | null> => {
    try {
        const id = await getActiveTournamentId();
        return String(id);
    } catch (e) {
        console.error('startGame failed:', e);
        return null;
    }
};



// NOTE: To submit a score we require a server signature proving validity.
// The caller must obtain `signature` out-of-band (server API) and pass via metaData (or adapt as needed).
export const stopGame = async ( gameId: string, score: number, playerName?: string, metaData?: string ): Promise<HighScoreDef[]> => {
    try {
        const tournamentId = Number(gameId);
        if (!web3Service.isConnected()) throw new Error('Wallet not connected');

        notifySubmissionState('validating');

        // Verify we're on the correct chain
        const config = getContractsConfig();
        const currentNetwork = await web3Service.getProvider().getNetwork();
        const currentChainId = Number(currentNetwork.chainId);

        if (currentChainId !== config.chainId) {
            try {
                await web3Service.switchChain(config.chainId);
            } catch {
                showToast(`Please switch to ${getChainName(config.chainId)} to submit scores`, 'error');
                notifySubmissionState('error', `Please switch to ${getChainName(config.chainId)} network`);
                throw new Error(`Wrong chain: ${currentChainId}`);
            }
        }

        // Expect metaData to contain a JSON string with { signature: string, metadata?: string }
        let metadata = '';
        if (metaData) {
            try {
                const parsed = JSON.parse(metaData);
                metadata = parsed.metadata || '';
            } catch {
                metadata = metaData;
            }
        }
        const address = web3Service.getAddress();
        if (!address) throw new Error('No wallet address');

        // Log debugging information
        console.log('Submitting score to tournament:', {
            tournamentId,
            score,
            address,
            playerName: playerName || '',
            metadata
        });

        // Prevent duplicate or lower-score resubmissions when user already has equal/higher score
        try {
            const existing = await fetchLeaderboard(tournamentId, 0, 100);
            const mine = existing.find(r => r.address.toLowerCase() === address.toLowerCase());
            if (mine && mine.score >= score) {
                showToast('You already have an equal or higher score on the leaderboard', 'info');
                return [];
            }
        } catch (leaderboardError) {
            console.warn('Could not fetch leaderboard for duplicate check:', leaderboardError);
            // Continue anyway - just couldn't check for duplicates
        }

        const submissionKey = `${tournamentId}:${address}:${score}`;
        try {
            const submittedRaw = getFromStorage('ps_submitted_scores') || '[]';
            const submitted: string[] = JSON.parse(submittedRaw);
            if (submitted.includes(submissionKey)) {
                showToast('This score was already submitted', 'info');
                return [];
            }
        } catch (storageError) {
            console.warn('Could not check storage for duplicate submission:', storageError);
            // Continue anyway - just couldn't check local storage
        }

        notifySubmissionState('signing');
        let signature: string;
        let nonce: string;
        try {
            console.log('Requesting score signature from backend with params:', {
                tournamentId,
                address,
                score,
                name: playerName || '',
                metadata
            });
            const response = await requestScoreSignature({ tournamentId, address, score, name: playerName || '', metadata });
            signature = response.signature;
            nonce = response.nonce;
            console.log('Received signature and nonce from backend:', { nonce });
        } catch (err) {
            showToast('Score server unavailable — please try again later', 'error');
            notifySubmissionState('error', 'Backend signature service unavailable');
            throw err;
        }

        notifySubmissionState('ready');
        try {
            // Wait briefly to ensure the entry transaction has been processed by the blockchain
            // This is important as blockchain state changes need time to propagate
            console.log('Waiting for potential tournament entry transaction to settle...');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Convert nonce string to number for the blockchain function
            const nonceAsBigInt = BigInt(nonce);
            console.log('Submitting score to blockchain contract with params:', {
                tournamentId,
                score,
                nonce: nonceAsBigInt.toString(),
                playerName: playerName || '',
                metadata,
                signatureLength: signature.length,
                address
            });

            // Additional validation - try to fetch player info to confirm they're registered
            try {
                const contractAddress = getContractsConfig().tournamentManager.address;
                const provider = web3Service.getProvider();
                if (provider) {
                    const contract = new ethers.Contract(contractAddress, [
                        "function playerInfo(uint256,address) view returns (bool entered, uint256 bestScore, bool rewardClaimed)"
                    ], provider);

                    const playerInfo = await contract.playerInfo(tournamentId, address);
                    console.log('Player info fetched from contract:', {
                        entered: playerInfo.entered,
                        bestScore: playerInfo.bestScore?.toString()
                    });
                    if (!playerInfo.entered) {
                        throw new Error('Player not registered in tournament despite successful entry attempt');
                    }
                }
            } catch (validationErr) {
                console.warn('Could not validate player registration:', validationErr);
                // Continue anyway, this is just for debugging
            }

            await submitScoreWithSignature(tournamentId, score, nonceAsBigInt, playerName || '', metadata, signature);
            console.log('Score successfully submitted to blockchain');
            showToast('Score submitted!', 'success');
            try {
                const submittedRaw = getFromStorage('ps_submitted_scores') || '[]';
                const submitted: string[] = JSON.parse(submittedRaw);
                submitted.push(submissionKey);
                setInStorage('ps_submitted_scores', JSON.stringify(submitted));
            } catch {}
        } catch (err) {
            // More detailed error logging
            console.error('Score submission to blockchain failed:', {
                error: err,
                tournamentId,
                score,
                address,
                playerName: playerName || '',
                nonce,
                metadata
            });

            // Provide more specific error messages based on common failure reasons
            let errorMessage = 'Failed to submit to blockchain';
            if (err instanceof Error) {
                const errorStr = err.message.toLowerCase();
                if (errorStr.includes('tournament') || errorStr.includes('active')) {
                    errorMessage = 'Tournament may not be active';
                } else if (errorStr.includes('not_active')) {
                    errorMessage = 'Tournament is not active for score submission';
                } else if (errorStr.includes('not_entered')) {
                    errorMessage = 'You have not entered this tournament';
                } else if (errorStr.includes('invalid_nonce')) {
                    errorMessage = 'Invalid nonce - score submission rejected';
                } else if (errorStr.includes('bad_sig') || errorStr.includes('bad_sig')) {
                    errorMessage = 'Invalid signature - score verification failed';
                } else if (errorStr.includes('require') || errorStr.includes('revert')) {
                    errorMessage = 'Transaction failed - common causes: not entered, tournament inactive, or invalid signature';
                } else if (errorStr.includes('gas') || errorStr.includes('estimate')) {
                    errorMessage = 'Transaction failed - check gas settings or balance';
                } else if (errorStr.includes('user rejected') || errorStr.includes('denied')) {
                    errorMessage = 'Transaction was rejected';
                }
            }

            showToast('Score submission failed — please retry', 'error');
            notifySubmissionState('error', errorMessage);
            throw err;
        }

        // Return updated leaderboard top slice
        const rows = await fetchLeaderboard(tournamentId, 0, 100);
        const scores: HighScoreDef[] = rows.map(r => ({ name: '', score: r.score, duration: 0 }));
        return scores;
    } catch (e) {
        console.error('stopGame failed:', e);
        throw e; // Re-throw the error so the UI can handle it properly
    }
};

// Helper function to get chain name for error messages
function getChainName(chainId: number): string {
    switch (chainId) {
        case 42161:
            return 'Arbitrum One';
        case 421614:
            return 'Arbitrum Sepolia';
        default:
            return `Chain ${chainId}`;
    }
}

export const getHighScores = async (): Promise<HighScoreDef[]> => {
    try {
        const id = await getActiveTournamentId();
        const rows = await fetchLeaderboard(id, 0, 100);
        const scores: HighScoreDef[] = rows.map(r => ({ name: '', score: r.score, duration: 0 }));
        return scores;
    } catch (e) {
        console.error('getHighScores failed:', e);
        return [];
    }
};
