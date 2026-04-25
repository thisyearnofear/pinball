// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * TournamentManager (MUSD)
 *
 * Core principles:
 * - CONSOLIDATION: Mezo hackathon version uses MUSD (ERC20), not native ETH
 * - CLEAN: contract only handles tournament rules + payouts; no offchain logic
 * - MODULAR: score verification is via a single trusted signer (backend attestor)
 *
 * Entry fees and payouts are denominated in MUSD.
 */
contract TournamentManager {
    // Minimal ERC20 surface (avoid external deps for hackathon simplicity)
    interface IERC20 {
        function transfer(address to, uint256 amount) external returns (bool);
        function transferFrom(address from, address to, uint256 amount) external returns (bool);
    }

    string internal constant SCORE_PREFIX_V2 = "PINBALL_SCORE:v2";

    struct Tournament {
        uint256 id;
        uint64 startTime;
        uint64 endTime;
        uint16 topN;
        bool finalized;
        uint16[] prizeBps; // sum == 10000
        uint256 totalPot;  // in MUSD base units
    }

    struct PlayerInfo {
        bool entered;
        uint256 bestScore;
        bool rewardClaimed;
    }

    address public owner;
    address public scoreSigner;
    IERC20 public immutable musd;
    uint256 public entryFee; // in MUSD base units

    uint256 public lastTournamentId;

    mapping(uint256 => Tournament) public tournaments;
    mapping(uint256 => address[]) public participants;
    mapping(uint256 => mapping(address => PlayerInfo)) public playerInfo;
    mapping(uint256 => mapping(address => uint256)) public playerNonces;
    mapping(uint256 => address[]) public winners;

    event OwnerUpdated(address indexed newOwner);
    event ScoreSignerUpdated(address indexed signer);
    event EntryFeeUpdated(uint256 fee);
    event TournamentCreated(uint256 indexed id, uint64 startTime, uint64 endTime, uint16 topN, uint16[] prizeBps);
    event Entered(uint256 indexed id, address indexed player, uint256 feePaid);
    event ScoreSubmitted(uint256 indexed id, address indexed player, uint256 score);
    event Finalized(uint256 indexed id, address[] winners);
    event RewardClaimed(uint256 indexed id, address indexed player, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor(address _scoreSigner, address _musd, uint256 _entryFee) {
        require(_scoreSigner != address(0), "ZERO_SIGNER");
        require(_musd != address(0), "ZERO_MUSD");
        owner = msg.sender;
        scoreSigner = _scoreSigner;
        musd = IERC20(_musd);
        entryFee = _entryFee;
        emit OwnerUpdated(owner);
        emit ScoreSignerUpdated(_scoreSigner);
        emit EntryFeeUpdated(_entryFee);
    }

    function setOwner(address _new) external onlyOwner {
        require(_new != address(0), "ZERO_OWNER");
        owner = _new;
        emit OwnerUpdated(_new);
    }

    function setScoreSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "ZERO_SIGNER");
        scoreSigner = _signer;
        emit ScoreSignerUpdated(_signer);
    }

    function setEntryFee(uint256 _fee) external onlyOwner {
        entryFee = _fee;
        emit EntryFeeUpdated(_fee);
    }

    function createTournament(
        uint64 startTime,
        uint64 endTime,
        uint16 topN,
        uint16[] calldata prizeBps
    ) external onlyOwner returns (uint256) {
        require(startTime < endTime, "BAD_TIME");
        require(topN > 0, "BAD_TOPN");
        require(prizeBps.length == topN, "BPS_LEN_NEQ_TOPN");

        uint256 sum;
        for (uint256 i = 0; i < prizeBps.length; i++) sum += prizeBps[i];
        require(sum == 10000, "BPS_NEQ_10000");

        uint256 id = ++lastTournamentId;
        Tournament storage t = tournaments[id];
        t.id = id;
        t.startTime = startTime;
        t.endTime = endTime;
        t.topN = topN;
        t.finalized = false;
        t.totalPot = 0;
        for (uint256 i = 0; i < prizeBps.length; i++) {
            t.prizeBps.push(prizeBps[i]);
        }

        emit TournamentCreated(id, startTime, endTime, topN, prizeBps);
        return id;
    }

    function enterTournament(uint256 id) external {
        Tournament storage t = tournaments[id];
        require(t.id == id, "NO_TOURNAMENT");
        require(block.timestamp >= t.startTime && block.timestamp <= t.endTime, "NOT_ACTIVE");

        // Collect entry fee in MUSD
        require(musd.transferFrom(msg.sender, address(this), entryFee), "MUSD_TRANSFER_FROM_FAIL");

        PlayerInfo storage p = playerInfo[id][msg.sender];
        if (!p.entered) {
            p.entered = true;
            participants[id].push(msg.sender);
        }

        t.totalPot += entryFee;
        emit Entered(id, msg.sender, entryFee);
    }

    /**
     * EIP-191 personal_sign style message (V2):
     * keccak256(abi.encodePacked("PINBALL_SCORE:v2", id, player, score, nonce, chainId, nameHash, metaHash))
     */
    function submitScoreWithSignature(
        uint256 id,
        uint256 score,
        uint256 nonce,
        string calldata name,
        string calldata metadata,
        bytes calldata signature
    ) external {
        Tournament storage t = tournaments[id];
        require(t.id == id, "NO_TOURNAMENT");
        require(block.timestamp >= t.startTime && block.timestamp <= t.endTime, "NOT_ACTIVE");
        require(!t.finalized, "FINALIZED");

        PlayerInfo storage p = playerInfo[id][msg.sender];
        require(p.entered, "NOT_ENTERED");

        uint256 expectedNonce = playerNonces[id][msg.sender] + 1;
        require(nonce == expectedNonce, "INVALID_NONCE");

        bytes32 nameHash = keccak256(bytes(name));
        bytes32 metaHash = keccak256(bytes(metadata));

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(
                    abi.encodePacked(
                        SCORE_PREFIX_V2,
                        id,
                        msg.sender,
                        score,
                        nonce,
                        block.chainid,
                        nameHash,
                        metaHash
                    )
                )
            )
        );

        address recovered = _recoverSigner(digest, signature);
        require(recovered == scoreSigner, "BAD_SIG");

        playerNonces[id][msg.sender] = nonce;

        if (score > p.bestScore) {
            p.bestScore = score;
            emit ScoreSubmitted(id, msg.sender, score);
        }
    }

    function finalize(uint256 id) external {
        Tournament storage t = tournaments[id];
        require(t.id == id, "NO_TOURNAMENT");
        require(block.timestamp > t.endTime, "NOT_ENDED");
        require(!t.finalized, "ALREADY_FINAL");

        uint256 n = participants[id].length;
        uint16 topN = t.topN;
        address[] memory arr = participants[id];

        // selection sort for topN (OK for hackathon-scale tournaments)
        for (uint16 i = 0; i < topN && i < n; i++) {
            uint256 maxIdx = i;
            for (uint256 j = i + 1; j < n; j++) {
                if (playerInfo[id][arr[j]].bestScore > playerInfo[id][arr[maxIdx]].bestScore) {
                    maxIdx = j;
                }
            }
            if (maxIdx != i) {
                address tmp = arr[i];
                arr[i] = arr[maxIdx];
                arr[maxIdx] = tmp;
            }
        }

        address[] storage w = winners[id];
        for (uint16 k = 0; k < topN && k < n; k++) {
            w.push(arr[k]);
        }

        t.finalized = true;
        emit Finalized(id, winners[id]);
    }

    function claimReward(uint256 id) external {
        Tournament storage t = tournaments[id];
        require(t.finalized, "NOT_FINAL");

        PlayerInfo storage p = playerInfo[id][msg.sender];
        require(!p.rewardClaimed, "CLAIMED");

        uint16 rank = _rankOf(id, msg.sender);
        require(rank > 0 && rank <= t.topN, "NOT_WINNER");

        uint256 amount = (t.totalPot * t.prizeBps[rank - 1]) / 10000;
        p.rewardClaimed = true;

        require(musd.transfer(msg.sender, amount), "MUSD_TRANSFER_FAIL");
        emit RewardClaimed(id, msg.sender, amount);
    }

    function viewLeaderboard(
        uint256 id,
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory addrs, uint256[] memory scores) {
        address[] memory arr = participants[id];
        uint256 n = arr.length;
        if (offset >= n) return (new address[](0), new uint256[](0));
        uint256 end = offset + limit;
        if (end > n) end = n;
        uint256 len = end - offset;
        addrs = new address[](len);
        scores = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            address a = arr[offset + i];
            addrs[i] = a;
            scores[i] = playerInfo[id][a].bestScore;
        }
    }

    function getWinners(uint256 id) external view returns (address[] memory) {
        return winners[id];
    }

    function getPrizeBps(uint256 id) external view returns (uint16[] memory) {
        Tournament storage t = tournaments[id];
        require(t.id == id, "NO_TOURNAMENT");
        return t.prizeBps;
    }

    function _rankOf(uint256 id, address player) internal view returns (uint16) {
        address[] storage w = winners[id];
        for (uint16 i = 0; i < w.length; i++) {
            if (w[i] == player) return i + 1;
        }
        return 0;
    }

    function _recoverSigner(bytes32 digest, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "SIG_LEN");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "BAD_V");
        return ecrecover(digest, v, r, s);
    }
}
