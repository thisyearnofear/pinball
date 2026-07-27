/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2023 - https://www.igorski.nl
 */

// Contract-backed high score service (no REST, no mocks)
// Keeps the same public API (startGame, stopGame, getHighScores)

import { getActiveTournamentId, fetchLeaderboard, submitScoreWithSignature, ensureExpectedNetwork } from './contracts/tournament-client';
import { requestScoreSignature } from './backend-scores-client';
import { getContractsConfig } from '../config/contracts';
import { getAppConfig } from '../config/app-config';
import { isInvertedTournament } from '../config/tournaments';
import { showToast } from './toast';
import { getFromStorage, setInStorage } from '../utils/local-storage';
import { shortenAddress } from '../utils/address';
import type { WalletPort } from '@/domains/wallet/wallet-port';

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

function readSubmittedScores(): string[] {
    return JSON.parse(getFromStorage('ps_submitted_scores') || '[]');
}

export const isSupported = (): boolean => {
    // Supported only when contracts are configured (wallet state is managed by wallet adapter)
    try {
        getContractsConfig();
        return true;
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
export const stopGame = async (
    gameId: string,
    score: number,
    playerName: string,
    metaData: string,
    walletPort: WalletPort
): Promise<HighScoreDef[]> => {
    try {
        const tournamentId = Number(gameId);
        const wallet = walletPort;

        notifySubmissionState('validating');

        // Verify we're on the correct chain (auto-switch when the wallet allows it)
        try {
            await ensureExpectedNetwork(wallet);
        } catch (networkError: any) {
            showToast(networkError?.message ?? 'Wrong network', 'error');
            notifySubmissionState('error', networkError?.message ?? 'Wrong network');
            throw networkError;
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
        const address = await wallet.getAddress();

        // Prevent duplicate or non-improving resubmissions (direction-aware:
        // kamikaze/inverted tournaments improve by going LOWER)
        const inverted = isInvertedTournament(tournamentId);
        try {
            const existing = await fetchLeaderboard(tournamentId, 0, 100, inverted);
            const mine = existing.find(r => r.address.toLowerCase() === address.toLowerCase());
            const notImproved = mine && (inverted ? mine.score <= score : mine.score >= score);
            if (notImproved) {
                throw new Error('SCORE_NOT_IMPROVED');
            }
        } catch (leaderboardError: any) {
            if (leaderboardError.message === 'SCORE_NOT_IMPROVED') {
                throw leaderboardError;
            }
            console.warn('Could not fetch leaderboard for duplicate check:', leaderboardError);
            // Continue anyway - just couldn't check for duplicates
        }

        const submissionKey = `${tournamentId}:${address}:${score}`;
        try {
            if (readSubmittedScores().includes(submissionKey)) {
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
            const response = await requestScoreSignature({
                tournamentId,
                address,
                score,
                name: playerName || '',
                metadata,
                missionId: (() => {
                    try {
                        const cfg = getAppConfig();
                        // Only request mission awards if MissionPool is configured and we have an active mission id.
                        if (!getContractsConfig().missionPool.address) return undefined;
                        return cfg.missions.activeMissionId;
                    } catch {
                        return undefined;
                    }
                })()
            });
            signature = response.signature;
            nonce = response.nonce;

            if (response.replayVerified === true) {
                showToast('Replay verified — score is cheat-checked ✓', 'success');
            }

            // Optional: show mission reward feedback (backend broadcasts tx)
            if (response.missionAwarded && response.missionTxHash) {
                showToast('Mission reward sent!', 'success');
            } else if (response.missionAwarded === false && response.missionError) {
                console.log('Mission not awarded:', response.missionError);
            }
        } catch (err) {
            showToast('Score server unavailable — please try again later', 'error');
            notifySubmissionState('error', 'Backend signature service unavailable');
            throw err;
        }

        notifySubmissionState('ready');
        try {
            // Wait briefly to ensure the entry transaction has been processed by the blockchain
            // This is important as blockchain state changes need time to propagate
            await new Promise(resolve => setTimeout(resolve, 1000));

            const nonceAsBigInt = BigInt(nonce);

            await submitScoreWithSignature(tournamentId, score, Number(nonceAsBigInt), playerName || '', metadata, signature, wallet);
            showToast('Score submitted!', 'success');
            try {
                const submitted = readSubmittedScores();
                submitted.push(submissionKey);
                setInStorage('ps_submitted_scores', JSON.stringify(submitted));
            } catch { }
        } catch (err: any) {
            // Check for user rejection first (most common user action)
            if (err.code === 'ACTION_REJECTED' || err.code === 4001 ||
                err.message?.toLowerCase().includes('user rejected') ||
                err.message?.toLowerCase().includes('user denied')) {
                console.log('User cancelled score submission');
                showToast('Score submission cancelled', 'info');
                notifySubmissionState('error', 'You cancelled the transaction');
                throw new Error('Score submission cancelled by user');
            }

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
                if (errorStr.includes('not_entered')) {
                    errorMessage = 'You must enter the tournament before submitting scores. Please join the tournament first.';
                    showToast('Please enter the tournament first', 'error');
                } else if (errorStr.includes('tournament') || errorStr.includes('active')) {
                    errorMessage = 'Tournament may not be active';
                } else if (errorStr.includes('not_active')) {
                    errorMessage = 'Tournament is not active for score submission';
                } else if (errorStr.includes('invalid_nonce')) {
                    errorMessage = 'Invalid nonce - score submission rejected';
                } else if (errorStr.includes('bad_sig')) {
                    errorMessage = 'Invalid signature - score verification failed';
                } else if (errorStr.includes('require') || errorStr.includes('revert')) {
                    errorMessage = 'Transaction failed - common causes: not entered, tournament inactive, or invalid signature';
                } else if (errorStr.includes('gas') || errorStr.includes('estimate')) {
                    errorMessage = 'Transaction failed - check gas settings or balance';
                }
            }

            showToast('Score submission failed — please retry', 'error');
            notifySubmissionState('error', errorMessage);
            throw err;
        }

        // Return updated leaderboard top slice
        const rows = await fetchLeaderboard(tournamentId, 0, 100, inverted);
        const scores: HighScoreDef[] = rows.map(r => ({ name: '', score: r.score, duration: 0 }));
        return scores;
    } catch (e) {
        console.error('stopGame failed:', e);
        throw e; // Re-throw the error so the UI can handle it properly
    }
};

export const getHighScores = async (): Promise<HighScoreDef[]> => {
    try {
        const id = await getActiveTournamentId();
        const rows = await fetchLeaderboard(id, 0, 100, isInvertedTournament(id));
        const scores: HighScoreDef[] = rows.map(r => ({
            name: shortenAddress(r.address),
            score: r.score,
            duration: 0
        }));
        return scores;
    } catch (e) {
        console.error('getHighScores failed:', e);
        return [];
    }
};
