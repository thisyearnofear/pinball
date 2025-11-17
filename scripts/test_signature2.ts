import { ethers } from 'ethers';

// Test the signature generation
async function testSignature() {
  const pk = '0xdbe72a61966ea02f11773d1578b296adc6572f5392f77635cb8ebf74621f69ef'; // Test private key
  const tournamentId = 3;
  const player = '0x1e17B4FB12B29045b29475f74E536Db97Ddc5D40';
  const score = 50500;
  const nonce = 1n;
  const name = '0x1e17B4FB12B29045b29475f74E536Db97Ddc5D40';
  const metadata = '';
  
  // Calculate hashes
  const nameHash = ethers.keccak256(ethers.toUtf8Bytes(name));
  const metaHash = ethers.keccak256(ethers.toUtf8Bytes(metadata));
  
  console.log('Name hash:', nameHash);
  console.log('Meta hash:', metaHash);
  
  // Build inner hash exactly as in innerScoreHashV2
  const innerHashToSign = ethers.keccak256(
    ethers.solidityPacked(
      ['string', 'uint256', 'address', 'uint256', 'uint256', 'uint256', 'bytes32', 'bytes32'],
      ['PINBALL_SCORE:v2', tournamentId, player, score, nonce, 42161n, nameHash, metaHash]
    )
  );
  
  console.log('Inner hash to sign:', innerHashToSign);
  
  // Create wallet and sign the inner hash directly
  const wallet = new ethers.Wallet(pk);
  
  // Method 1: Use signingKey.sign directly
  const signature1 = wallet.signingKey.sign(innerHashToSign);
  const sig1 = signature1.serialized;
  console.log('Method 1 signature:', sig1);
  
  // Method 2: Use signMessage on the raw bytes
  const sig2 = await wallet.signMessage(ethers.getBytes(innerHashToSign));
  console.log('Method 2 signature:', sig2);
  
  // Now verify using the contract's method
  // Contract adds EIP-191 prefix to the inner hash
  const digest = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes('\x19Ethereum Signed Message:\n32'),
      ethers.getBytes(innerHashToSign)
    ])
  );
  
  console.log('Digest for contract verification:', digest);
  
  // Recover the signer using ecrecover (as contract does)
  const recovered1 = ethers.recoverAddress(digest, sig1);
  console.log('Method 1 recovered address:', recovered1);
  
  const recovered2 = ethers.recoverAddress(digest, sig2);
  console.log('Method 2 recovered address:', recovered2);
  
  // Check if they match the expected signer
  const expectedSigner = '0xE7caF7b405a5aFe181c1CBa211756AE2Bb1C3BfC';
  console.log('Expected signer:', expectedSigner);
  console.log('Method 1 addresses match:', recovered1.toLowerCase() === expectedSigner.toLowerCase());
  console.log('Method 2 addresses match:', recovered2.toLowerCase() === expectedSigner.toLowerCase());
}

testSignature().catch(console.error);