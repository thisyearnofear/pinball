import { Wallet, keccak256, toUtf8Bytes, getBytes, concat, AbiCoder } from 'ethers';

// EIP-191 personal_sign style: keccak256("\x19Ethereum Signed Message:\n32" || innerHash)
export function buildPersonalDigest(innerHash: string): string {
  const prefix = toUtf8Bytes("\x19Ethereum Signed Message:\n32");
  const bytes = concat([prefix, getBytes(innerHash)]);
  return keccak256(bytes);
}

export function innerScoreHash(
  tournamentId: bigint,
  player: string,
  score: bigint,
  nameHash: string,
  metaHash: string
): string {
  const inner = keccak256(
    new AbiCoder().encode(
      ['bytes', 'uint256', 'address', 'uint256', 'bytes32', 'bytes32'],
      [toUtf8Bytes('PINBALL_SCORE:'), tournamentId, player, score, nameHash, metaHash]
    )
  );
  return inner;
}

export async function signScore(
  pk: string,
  tournamentId: number,
  player: string,
  score: number,
  name: string,
  metadata: string
): Promise<string> {
  const wallet = new Wallet(pk);
  const nameHash = keccak256(toUtf8Bytes(name || ''));
  const metaHash = keccak256(toUtf8Bytes(metadata || ''));
  const inner = innerScoreHash(BigInt(tournamentId), player, BigInt(score), nameHash, metaHash);
  const digest = buildPersonalDigest(inner);
  const sig = await wallet.signMessage(getBytes(digest));
  return sig;
}
