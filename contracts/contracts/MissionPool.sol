// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Minimal ERC20 surface (avoid external deps for hackathon simplicity)
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * MissionPool (MUSD)
 *
 * Differentiator: "Sponsored Missions"
 * - Sponsors deposit MUSD to fund a mission bounty pool
 * - A trusted attestor (same signer as score signing) can award winners
 *
 * This keeps the MVP simple (no extra signature scheme yet) while still enabling
 * a compelling demo: "hit an achievement → backend verifies → onchain award in MUSD".
 */
contract MissionPool {
    struct Mission {
        address sponsor;
        uint256 rewardPerWinner;
        uint16 maxWinners;
        uint16 winnersCount;
        bool active;
    }

    IERC20 public immutable musd;
    address public attestor; // backend-controlled EOA

    uint256 public lastMissionId;
    mapping(uint256 => Mission) public missions;
    mapping(uint256 => mapping(address => bool)) public hasWon;

    event AttestorUpdated(address indexed attestor);
    event MissionCreated(uint256 indexed missionId, address indexed sponsor, uint256 rewardPerWinner, uint16 maxWinners);
    event MissionPaused(uint256 indexed missionId, bool active);
    event WinnerAwarded(uint256 indexed missionId, address indexed winner, uint256 amount);

    modifier onlyAttestor() {
        require(msg.sender == attestor, "NOT_ATTESTOR");
        _;
    }

    constructor(address _musd, address _attestor) {
        require(_musd != address(0), "ZERO_MUSD");
        require(_attestor != address(0), "ZERO_ATTESTOR");
        musd = IERC20(_musd);
        attestor = _attestor;
        emit AttestorUpdated(_attestor);
    }

    function setAttestor(address _attestor) external onlyAttestor {
        require(_attestor != address(0), "ZERO_ATTESTOR");
        attestor = _attestor;
        emit AttestorUpdated(_attestor);
    }

    function createMission(uint256 rewardPerWinner, uint16 maxWinners) external returns (uint256) {
        require(rewardPerWinner > 0, "BAD_REWARD");
        require(maxWinners > 0, "BAD_MAX");

        uint256 total = rewardPerWinner * uint256(maxWinners);
        require(musd.transferFrom(msg.sender, address(this), total), "MUSD_TRANSFER_FROM_FAIL");

        uint256 id = ++lastMissionId;
        missions[id] = Mission({
            sponsor: msg.sender,
            rewardPerWinner: rewardPerWinner,
            maxWinners: maxWinners,
            winnersCount: 0,
            active: true
        });

        emit MissionCreated(id, msg.sender, rewardPerWinner, maxWinners);
        return id;
    }

    function setMissionActive(uint256 missionId, bool active) external {
        Mission storage m = missions[missionId];
        require(m.sponsor != address(0), "NO_MISSION");
        require(msg.sender == m.sponsor || msg.sender == attestor, "NOT_AUTH");
        m.active = active;
        emit MissionPaused(missionId, active);
    }

    function awardWinner(uint256 missionId, address winner) external onlyAttestor {
        Mission storage m = missions[missionId];
        require(m.sponsor != address(0), "NO_MISSION");
        require(m.active, "NOT_ACTIVE");
        require(winner != address(0), "ZERO_WINNER");
        require(!hasWon[missionId][winner], "ALREADY_WON");
        require(m.winnersCount < m.maxWinners, "MAX_WINNERS");

        hasWon[missionId][winner] = true;
        m.winnersCount++;

        require(musd.transfer(winner, m.rewardPerWinner), "MUSD_TRANSFER_FAIL");
        emit WinnerAwarded(missionId, winner, m.rewardPerWinner);

        if (m.winnersCount >= m.maxWinners) {
            m.active = false;
            emit MissionPaused(missionId, false);
        }
    }
}
