import { ethers } from 'ethers';

async function checkTournamentStatus() {
  const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
  const contract = new ethers.Contract(
    '0x12F23bEa8a69b0c8aF3DbBD5e4BEF176396b329E',
    [
      'function tournaments(uint256) view returns (uint256 id, uint64 startTime, uint64 endTime, uint16 topN, bool finalized, uint256 totalPot)',
      'function playerNonces(uint256, address) view returns (uint256)',
      'function playerInfo(uint256, address) view returns (bool entered, uint256 bestScore, bool rewardClaimed)'
    ],
    provider
  );

  const tournamentId = 3;
  const playerAddress = '0x1e17B4FB12B29045b29475f74E536Db97Ddc5D40';

  try {
    // Check tournament info
    const tournament = await contract.tournaments(tournamentId);
    console.log('Tournament info:');
    console.log('  ID:', tournament.id.toString());
    console.log('  Start time:', new Date(Number(tournament.startTime) * 1000).toISOString());
    console.log('  End time:', new Date(Number(tournament.endTime) * 1000).toISOString());
    console.log('  Finalized:', tournament.finalized);
    
    // Check current time
    const currentBlock = await provider.getBlock('latest');
    if (currentBlock) {
      console.log('Current time:', new Date(Number(currentBlock.timestamp) * 1000).toISOString());
      console.log('Is active:', Number(tournament.startTime) <= Number(currentBlock.timestamp) && Number(currentBlock.timestamp) <= Number(tournament.endTime));
    }
    
    // Check player info
    const playerInfo = await contract.playerInfo(tournamentId, playerAddress);
    console.log('Player info:');
    console.log('  Entered:', playerInfo.entered);
    console.log('  Best score:', playerInfo.bestScore.toString());
    
    // Check player nonce
    const playerNonce = await contract.playerNonces(tournamentId, playerAddress);
    console.log('Player nonce:', playerNonce.toString());
    
  } catch (error) {
    console.error('Error checking tournament status:', error);
  }
}

checkTournamentStatus();