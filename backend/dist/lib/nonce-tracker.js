/**
 * Nonce tracker for score signature requests
 * Prevents replay attacks by ensuring each signature is unique per player per tournament
 *
 * For production: migrate this to Redis or a database
 */
export class NonceTracker {
    // Map structure: tournamentId => (playerAddress => NonceEntry)
    store = new Map();
    /**
     * Get next nonce for a player in a tournament
     * Returns the nonce they should use for their next submission
     */
    getNextNonce(tournamentId, playerAddress) {
        const tournamentMap = this.store.get(tournamentId);
        if (!tournamentMap) {
            // First submission for this tournament
            return 1n;
        }
        const entry = tournamentMap.get(playerAddress.toLowerCase());
        if (!entry) {
            // First submission for this player in this tournament
            return 1n;
        }
        // Return the next nonce (current + 1)
        return entry.nonce + 1n;
    }
    /**
     * Record a used nonce for a player in a tournament
     * Called after signature is verified on-chain
     */
    recordNonce(tournamentId, playerAddress, nonce) {
        const normalizedAddress = playerAddress.toLowerCase();
        let tournamentMap = this.store.get(tournamentId);
        if (!tournamentMap) {
            tournamentMap = new Map();
            this.store.set(tournamentId, tournamentMap);
        }
        tournamentMap.set(normalizedAddress, {
            nonce,
            timestamp: Date.now()
        });
    }
    /**
     * Verify that a nonce is the next expected one
     * This is a convenience method for validation
     */
    isValidNext(tournamentId, playerAddress, nonce) {
        const expected = this.getNextNonce(tournamentId, playerAddress);
        return nonce === expected;
    }
    /**
     * Get current nonce for a player (useful for diagnostics)
     */
    getCurrentNonce(tournamentId, playerAddress) {
        const tournamentMap = this.store.get(tournamentId);
        if (!tournamentMap)
            return null;
        const entry = tournamentMap.get(playerAddress.toLowerCase());
        return entry?.nonce ?? null;
    }
    /**
     * Reset nonces for a tournament (admin function)
     */
    resetTournament(tournamentId) {
        this.store.delete(tournamentId);
    }
    /**
     * Reset nonce for a specific player (admin function)
     */
    resetPlayer(tournamentId, playerAddress) {
        const tournamentMap = this.store.get(tournamentId);
        if (tournamentMap) {
            tournamentMap.delete(playerAddress.toLowerCase());
        }
    }
    /**
     * Get stats for monitoring
     */
    getStats() {
        let totalPlayers = 0;
        for (const tournamentMap of this.store.values()) {
            totalPlayers += tournamentMap.size;
        }
        return {
            totalTournaments: this.store.size,
            totalPlayers
        };
    }
}
// Create singleton instance
export const nonceTracker = new NonceTracker();
