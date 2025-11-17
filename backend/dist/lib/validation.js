/**
 * Input validation for score submissions
 *
 * Note: Player names are NOT validated here because they are wallet-derived
 * (42 chars: "0x" + 40 hex digits) and not user-customizable.
 * No user input field exists for names, so no injection/overflow risk.
 */
// Maximum plausible score (reasonable upper bound for any game)
export const MAX_SCORE = 10_000_000; // 10 million points
// Metadata constraints
export const MAX_METADATA_LENGTH = 10_000; // 10KB JSON
/**
 * Score bounds validation
 */
export function validateScoreBounds(score) {
    if (score < 0) {
        return { valid: false, reason: 'NEGATIVE_SCORE' };
    }
    if (score > MAX_SCORE) {
        return { valid: false, reason: 'SCORE_TOO_HIGH' };
    }
    // Check for NaN or Infinity
    if (!Number.isFinite(score)) {
        return { valid: false, reason: 'INVALID_SCORE' };
    }
    return { valid: true };
}
/**
 * Player name handling (wallet-derived, not user-customizable)
 *
 * Names come from wallet address or hardcoded defaults.
 * No sanitization needed since there's no user input.
 * Kept for reference in case names become user-customizable in future.
 */
export function getPlayerName(input) {
    // Simply return the name as-is (wallet address or default)
    // Wallet addresses: 42 chars (0x + 40 hex)
    // Defaults: "Anonymous Player" (16 chars)
    // Both are safe and don't need sanitization
    return input || '';
}
export function validateGameMetadata(metadataStr) {
    // Check length before parsing
    if (metadataStr.length > MAX_METADATA_LENGTH) {
        return { valid: false, reason: 'METADATA_TOO_LARGE' };
    }
    // Handle empty metadata
    if (!metadataStr || metadataStr.trim() === '') {
        return { valid: true, data: {} };
    }
    // Try to parse JSON
    let data;
    try {
        data = JSON.parse(metadataStr);
    }
    catch {
        return { valid: false, reason: 'METADATA_INVALID_JSON' };
    }
    // Validate it's an object
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return { valid: false, reason: 'METADATA_NOT_OBJECT' };
    }
    // Optional: validate known fields if present
    if (data.duration !== undefined) {
        if (typeof data.duration !== 'number' || data.duration < 0 || data.duration > 3600000) {
            return { valid: false, reason: 'METADATA_INVALID_DURATION' };
        }
    }
    if (data.ballsUsed !== undefined) {
        if (typeof data.ballsUsed !== 'number' || data.ballsUsed < 0 || data.ballsUsed > 1000) {
            return { valid: false, reason: 'METADATA_INVALID_BALLS_USED' };
        }
    }
    if (data.tableId !== undefined) {
        if (typeof data.tableId !== 'number' || data.tableId < 0 || data.tableId > 100) {
            return { valid: false, reason: 'METADATA_INVALID_TABLE_ID' };
        }
    }
    if (data.timestamp !== undefined) {
        if (typeof data.timestamp !== 'number' || data.timestamp <= 0) {
            return { valid: false, reason: 'METADATA_INVALID_TIMESTAMP' };
        }
    }
    return { valid: true, data };
}
/**
 * Combined validation for score submission request
 */
export function validateScoreSubmission(input) {
    // Validate score
    const scoreValid = validateScoreBounds(input.score);
    if (!scoreValid.valid) {
        return { valid: false, reason: scoreValid.reason };
    }
    // Validate tournament ID
    if (input.tournamentId <= 0 || !Number.isInteger(input.tournamentId)) {
        return { valid: false, reason: 'INVALID_TOURNAMENT_ID' };
    }
    // Validate address format
    if (!input.address.startsWith('0x') || input.address.length !== 42) {
        return { valid: false, reason: 'INVALID_ADDRESS_FORMAT' };
    }
    // Validate address checksum (basic)
    if (!/^0x[0-9a-fA-F]{40}$/.test(input.address)) {
        return { valid: false, reason: 'INVALID_ADDRESS_FORMAT' };
    }
    // Player name: wallet-derived, no validation needed
    const playerName = getPlayerName(input.name || '');
    // Validate metadata
    const metadataValidation = validateGameMetadata(input.metadata || '');
    if (!metadataValidation.valid) {
        return { valid: false, reason: metadataValidation.reason };
    }
    return {
        valid: true,
        sanitized: {
            tournamentId: input.tournamentId,
            address: input.address,
            score: input.score,
            name: playerName,
            metadata: metadataValidation.data || {}
        }
    };
}
