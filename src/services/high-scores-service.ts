/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2023 - https://www.igorski.nl
 */

// Contract-backed high score service (no REST, no mocks)
// Keeps the same public API (startGame, stopGame, getHighScores)

import { web3Service } from './web3-service';
import { getActiveTournamentId, fetchLeaderboard, submitScoreWithSignature } from './contracts/tournament-client';
import { requestScoreSignature } from './backend-scores-client';

export type HighScoreDef = {
    name: string; // currently we don't store names on-chain; keep field for compatibility
    score: number;
    duration: number; // not tracked on-chain; set to 0 to preserve shape
};

export const isSupported = (): boolean => {
    // Supported only when wallet is connected and contracts are configured
    try {
        return web3Service.isConnected();
    } catch {
        return false;
    }
};

/**
 * Invoke when starting a new game; returns active tournament id as the session id.
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
        const signature = await requestScoreSignature({ tournamentId, address, score, name: playerName || '', metadata });
        await submitScoreWithSignature(tournamentId, score, playerName || '', metadata, signature);
        // Return updated leaderboard top slice
        const rows = await fetchLeaderboard(tournamentId, 0, 100);
        const scores: HighScoreDef[] = rows.map(r => ({ name: '', score: r.score, duration: 0 }));
        return scores;
    } catch (e) {
        console.error('stopGame failed:', e);
        return [];
    }
};

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
