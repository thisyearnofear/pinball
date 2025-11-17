import { Wallet, keccak256, toUtf8Bytes, getBytes, concat, solidityPacked } from 'ethers';
// Arbitrum One chain ID (only chain supported)
const ARBITRUM_ONE_CHAIN_ID = 42161n;
// EIP-191 personal_sign style: keccak256("\x19Ethereum Signed Message:\n32" || innerHash)
export function buildPersonalDigest(innerHash) {
    const prefix = toUtf8Bytes("\x19Ethereum Signed Message:\n32");
    const bytes = concat([prefix, getBytes(innerHash)]);
    return keccak256(bytes);
}
/**
 * V1 hash (deprecated - kept for reference)
 * Does not include nonce or chainId - vulnerable to replay attacks
 */
export function innerScoreHash(tournamentId, player, score, nameHash, metaHash) {
    // Use solidityPacked (abi.encodePacked) to match the contract's encoding
    const inner = keccak256(solidityPacked(['bytes', 'uint256', 'address', 'uint256', 'bytes32', 'bytes32'], [toUtf8Bytes('PINBALL_SCORE:'), tournamentId, player, score, nameHash, metaHash]));
    return inner;
}
/**
 * V2 hash (current) - includes nonce and chainId for replay protection
 * Prevents:
 * - Resubmitting the same signature
 * - Replaying on different chains (though we only support Arbitrum One)
 */
export function innerScoreHashV2(tournamentId, player, score, nonce, nameHash, metaHash) {
    // Include nonce and chainId in the hash for replay protection
    const inner = keccak256(solidityPacked(['bytes', 'uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes32', 'bytes32'], [
        toUtf8Bytes('PINBALL_SCORE:v2'),
        tournamentId,
        player,
        score,
        nonce,
        ARBITRUM_ONE_CHAIN_ID,
        nameHash,
        metaHash
    ]));
    return inner;
}
/**
 * Sign a score with V2 hash (includes nonce and chainId)
 */
export async function signScore(pk, tournamentId, player, score, nonce, name, metadata) {
    const wallet = new Wallet(pk);
    const nameHash = keccak256(toUtf8Bytes(name || ''));
    const metaHash = keccak256(toUtf8Bytes(metadata || ''));
    const inner = innerScoreHashV2(BigInt(tournamentId), player, BigInt(score), nonce, nameHash, metaHash);
    const digest = buildPersonalDigest(inner);
    const sig = await wallet.signMessage(getBytes(digest));
    return sig;
}
