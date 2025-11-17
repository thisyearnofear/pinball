import { ethers } from 'ethers';

// Data from the new logs
const tournamentId = 3;
const player = '0x1e17B4FB12B29045b29475f74E536Db97Ddc5D40';
const score = 50500;
const nonce = 1;
const name = '0x1e17B4FB12B29045b29475f74E536Db97Ddc5D40';
const metadata = '';
const signature = '0x2e30a28a23299ee8d1886b0d624e831b3ef5f3db09b6a0745a06fa9f3470e27e4fb08fc525b70bfff0d9e4a6bdccb9d51f5baed99a7aacfe49ff6e05add8042a1c';
const chainId = 42161;

// Calculate hashes
const nameHash = ethers.keccak256(ethers.toUtf8Bytes(name));
const metaHash = ethers.keccak256(ethers.toUtf8Bytes(metadata));

console.log('Name hash:', nameHash);
console.log('Meta hash:', metaHash);

// Build the digest exactly as the contract does
// The contract uses: abi.encodePacked("PINBALL_SCORE:v2", id, player, score, nonce, uint256(42161), nameHash, metaHash)
const innerHash = ethers.keccak256(
  ethers.solidityPacked(
    ['string', 'uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes32', 'bytes32'],
    ['PINBALL_SCORE:v2', tournamentId, player, score, nonce, chainId, nameHash, metaHash]
  )
);

const digest = ethers.keccak256(
  ethers.concat([
    ethers.toUtf8Bytes('\x19Ethereum Signed Message:\n32'),
    innerHash
  ])
);

console.log('Inner hash:', innerHash);
console.log('Digest:', digest);

// Recover the signer
try {
  const recovered = ethers.verifyMessage(ethers.getBytes(digest), signature);
  console.log('Recovered address:', recovered);
  
  // Check if it matches the expected signer
  const expectedSigner = '0xE7caF7b405a5aFe181c1CBa211756AE2Bb1C3BfC';
  console.log('Expected signer:', expectedSigner);
  console.log('Addresses match:', recovered.toLowerCase() === expectedSigner.toLowerCase());
} catch (error) {
  console.error('Error verifying signature:', error);
}