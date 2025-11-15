/**
 * Tournament Entry Service
 * Handles joining/registering for tournaments
 */

import { enterTournament as contractEnterTournament, getTournamentInfo } from './tournament-client';

/**
 * Join an active tournament by calling the smart contract
 * Returns the transaction hash if successful
 */
export const joinTournament = async (tournamentId: number): Promise<string> => {
    try {
        const hash = await contractEnterTournament(tournamentId);
        console.log('Successfully joined tournament:', tournamentId, 'tx:', hash);
        return hash;
    } catch (error) {
        console.error('Failed to join tournament:', error);
        throw error;
    }
};

/**
 * Get tournament details
 */
export const getTournamentDetails = async (tournamentId: number): Promise<any> => {
    try {
        return await getTournamentInfo(tournamentId);
    } catch (error) {
        console.error('Failed to get tournament details:', error);
        throw error;
    }
};
