/**
 * Single source of truth for contract ABIs used by the frontend.
 *
 * Core Principles:
 * - DRY: One ABI definition per contract.
 * - CLEAN: Keep ABIs minimal and explicit (only what the app calls).
 */

export const TOURNAMENT_MANAGER_ABI = [
  // Tournament info / config
  "function entryFee() view returns (uint256)",
  "function musd() view returns (address)",
  "function scoreSigner() view returns (address)",
  "function tournaments(uint256) view returns (uint256 id, uint64 startTime, uint64 endTime, uint16 topN, bool finalized, uint256 totalPot)",
  "function lastTournamentId() view returns (uint256)",
  "function getPrizeBps(uint256 id) view returns (uint16[])",
  "function getWinners(uint256 id) view returns (address[])",
  "function viewLeaderboard(uint256 id, uint256 offset, uint256 limit) view returns (address[] addrs, uint256[] scores)",

  // Player state
  "function playerInfo(uint256,address) view returns (bool entered, uint256 bestScore, bool rewardClaimed)",
  "function playerNonces(uint256,address) view returns (uint256)",

  // Write functions
  "function enterTournament(uint256 id)",
  "function submitScoreWithSignature(uint256 id, uint256 score, uint256 nonce, string name, string metadata, bytes signature)",
  "function claimReward(uint256 id)",

  // Admin (not used by app UI, but useful for ops scripts / debugging)
  "function finalize(uint256 id)",
] as const;

export const MISSION_POOL_ABI = [
  "function attestor() view returns (address)",
  "function musd() view returns (address)",
  "function lastMissionId() view returns (uint256)",
  "function missions(uint256) view returns (address sponsor, uint256 rewardPerWinner, uint16 maxWinners, uint16 winnersCount, bool active)",
  "function createMission(uint256 rewardPerWinner, uint16 maxWinners) returns (uint256)",
  "function awardWinner(uint256 missionId, address winner)",
  "function setMissionActive(uint256 missionId, bool active)",
] as const;

