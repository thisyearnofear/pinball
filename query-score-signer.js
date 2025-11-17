const { ethers } = require('ethers');

// Use the same ABI as the tournament client
const TOURNAMENT_MANAGER_ABI = [
  "function entryFeeWei() view returns (uint256)",
  "function scoreSigner() view returns (address)",
  "function tournaments(uint256) view returns (tuple(uint256,uint64,uint64,uint16,bool,uint256) t)",
  "function lastTournamentId() view returns (uint256)",
  "function getPrizeBps(uint256 id) view returns (uint16[])",
  "function enterTournament(uint256 id) payable",
  "function submitScoreWithSignature(uint256 id, uint256 score, uint256 nonce, string name, string metadata, bytes signature)",
  "function submitScoreWithSignatureV1(uint256 id, uint256 score, string name, string metadata, bytes signature)",
  "function viewLeaderboard(uint256 id, uint256 offset, uint256 limit) view returns (address[] addrs, uint256[] scores)",
  "function finalize(uint256 id)",
  "function getWinners(uint256 id) view returns (address[])",
  "function claimReward(uint256 id)",
];

async function getScoreSigner() {
  try {
    // Use the contract address from the .env.example
    const contractAddress = '0xD6E3E1c800F26cE18C8D5bc3115aA35f59A99952';
    const chainId = '42161'; // Arbitrum One

    // Use public RPC provider for read-only operations
    let rpcUrl;
    if (chainId === '42161') { // Arbitrum One
      rpcUrl = 'https://arb1.arbitrum.io/rpc';
    } else if (chainId === '421614') { // Arbitrum Sepolia
      rpcUrl = 'https://sepolia-rollup.arbitrum.io/rpc';
    } else {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    console.log(`Querying contract ${contractAddress} on chain ${chainId} using RPC: ${rpcUrl}`);

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, TOURNAMENT_MANAGER_ABI, provider);

    // Query the scoreSigner address
    const scoreSigner = await contract.scoreSigner();

    console.log(`Score Signer Address: ${scoreSigner}`);

    return scoreSigner;
  } catch (error) {
    console.error('Error querying score signer:', error);
    throw error;
  }
}

// Run the function
getScoreSigner()
  .then(() => console.log('Query completed'))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });