// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * TournamentManager
 * - Weekly (or scheduled) tournaments with entry fees in native ETH
 * - Best-score-per-player counting
 * - Server-signed score submission (EIP-191 personal_sign compatible)
 * - Configurable prize split for top N winners (default top 3: 50/30/20)
 * - Simple leaderboard retrieval (not fully sorted on-chain; front-end can sort)
 *
 * Notes:
 * - For MVP we accept server-signed scores from a trusted authority whose address is set by owner
 * - Commit-reveal hooks can be added later without breaking storage layout by reserving slots
 */

contract TournamentManager {
    struct Tournament {
        uint256 id;
        uint64 startTime;
        uint64 endTime;
        uint16 topN; // number of winners eligible for rewards
        bool finalized;
        uint16[] prizeBps; // sum must be 10000 (100%)
        uint256 totalPot;
    }

    struct PlayerInfo {
        bool entered;
        uint256 bestScore;
        bool rewardClaimed;
    }

    address public owner;
    address public scoreSigner; // trusted server signer
    uint256 public entryFeeWei; // in wei

    uint256 public lastTournamentId;

    mapping(uint256 => Tournament) public tournaments;
    mapping(uint256 => address[]) public participants;
    mapping(uint256 => mapping(address => PlayerInfo)) public playerInfo;
    
    // Nonce tracking for replay protection (phase 2)
    // tournamentId => playerAddress => nextValidNonce
    mapping(uint256 => mapping(address => uint256)) public playerNonces;

    // Winners stored after finalize in descending order of score
    mapping(uint256 => address[]) public winners;

    // events
    event OwnerUpdated(address indexed newOwner);
    event ScoreSignerUpdated(address indexed signer);
    event EntryFeeUpdated(uint256 feeWei);
    event TournamentCreated(uint256 indexed id, uint64 startTime, uint64 endTime, uint16 topN, uint16[] prizeBps);
    event Entered(uint256 indexed id, address indexed player, uint256 value);
    event ScoreSubmitted(uint256 indexed id, address indexed player, uint256 score);
    event Finalized(uint256 indexed id, address[] winners);
    event RewardClaimed(uint256 indexed id, address indexed player, uint256 amount);
    event FundsWithdrawn(address indexed to, uint256 amount);
    event EmergencyPayout(uint256 indexed id, address indexed player, uint256 amount);
    event TournamentCancelled(uint256 indexed id, uint256 refundedAmount);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor(address _scoreSigner, uint256 _entryFeeWei) {
        owner = msg.sender;
        scoreSigner = _scoreSigner;
        entryFeeWei = _entryFeeWei;
        emit OwnerUpdated(owner);
        emit ScoreSignerUpdated(_scoreSigner);
        emit EntryFeeUpdated(_entryFeeWei);
    }

    function setOwner(address _new) external onlyOwner {
        owner = _new;
        emit OwnerUpdated(_new);
    }

    function setScoreSigner(address _signer) external onlyOwner {
        scoreSigner = _signer;
        emit ScoreSignerUpdated(_signer);
    }

    function setEntryFee(uint256 _feeWei) external onlyOwner {
        entryFeeWei = _feeWei;
        emit EntryFeeUpdated(_feeWei);
    }

    function createTournament(uint64 startTime, uint64 endTime, uint16 topN, uint16[] calldata prizeBps) external onlyOwner returns (uint256) {
        require(startTime < endTime, "BAD_TIME");
        require(topN > 0, "BAD_TOPN");
        uint256 sum;
        for (uint256 i = 0; i < prizeBps.length; i++) sum += prizeBps[i];
        require(sum == 10000, "BPS_NEQ_10000");
        require(prizeBps.length == topN, "BPS_LEN_NEQ_TOPN");

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

    function enterTournament(uint256 id) external payable {
        Tournament storage t = tournaments[id];
        require(t.id == id, "NO_TOURNAMENT");
        require(block.timestamp >= t.startTime && block.timestamp <= t.endTime, "NOT_ACTIVE");
        require(msg.value == entryFeeWei, "BAD_FEE");

        PlayerInfo storage p = playerInfo[id][msg.sender];
        if (!p.entered) {
            p.entered = true;
            participants[id].push(msg.sender);
        }
        t.totalPot += msg.value;
        emit Entered(id, msg.sender, msg.value);
    }

    // EIP-191 personal_sign style message (V2): includes nonce and chainId for replay protection
    // keccak256(abi.encodePacked("PINBALL_SCORE:v2", id, player, score, nonce, chainId, nameHash, metaHash))
    // The backend must sign this digest. The front-end will pass the signature bytes here.
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

        // Verify nonce hasn't been used and is the next expected nonce
        uint256 expectedNonce = playerNonces[id][msg.sender] + 1;
        require(nonce == expectedNonce, "INVALID_NONCE");

        bytes32 nameHash = keccak256(bytes(name));
        bytes32 metaHash = keccak256(bytes(metadata));
        
        // V2 digest includes nonce and chainId
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(
                "PINBALL_SCORE:v2",
                id,
                msg.sender,
                score,
                nonce,
                block.chainid,
                nameHash,
                metaHash
            ))
        ));
        
        address recovered = _recoverSigner(digest, signature);
        require(recovered == scoreSigner, "BAD_SIG");

        // Increment nonce after successful verification
        playerNonces[id][msg.sender] = nonce;

        if (score > p.bestScore) {
            p.bestScore = score;
            emit ScoreSubmitted(id, msg.sender, score);
        }
    }

    // Keep V1 method for backwards compatibility during migration
    // Deprecated: use submitScoreWithSignature with nonce instead
    function submitScoreWithSignatureV1(
        uint256 id,
        uint256 score,
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

        bytes32 nameHash = keccak256(bytes(name));
        bytes32 metaHash = keccak256(bytes(metadata));
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encodePacked("PINBALL_SCORE:", id, msg.sender, score, nameHash, metaHash))));
        address recovered = _recoverSigner(digest, signature);
        require(recovered == scoreSigner, "BAD_SIG");

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

        // Determine winners: simple selection of topN by bestScore
        uint256 n = participants[id].length;
        uint16 topN = t.topN;
        address[] memory arr = participants[id];

        // selection sort for topN (gas OK for small N; for large sets consider off-chain snapshot + merkle)
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

        // find rank
        uint16 rank = _rankOf(id, msg.sender);
        require(rank > 0 && rank <= t.topN, "NOT_WINNER");

        uint256 amount = (t.totalPot * t.prizeBps[rank - 1]) / 10000;
        p.rewardClaimed = true;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "PAY_FAIL");
        emit RewardClaimed(id, msg.sender, amount);
    }

    function viewLeaderboard(uint256 id, uint256 offset, uint256 limit) external view returns (address[] memory addrs, uint256[] memory scores) {
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

    function repairPrizeBps(uint256 id, uint16[] calldata newBps) external onlyOwner {
        Tournament storage t = tournaments[id];
        require(t.id == id, "NO_TOURNAMENT");
        require(newBps.length == t.topN, "BPS_LEN_NEQ_TOPN");
        uint256 sum;
        for (uint256 i = 0; i < newBps.length; i++) sum += newBps[i];
        require(sum == 10000, "BPS_NEQ_10000");
        delete t.prizeBps;
        for (uint256 i = 0; i < newBps.length; i++) {
            t.prizeBps.push(newBps[i]);
        }
    }

    function withdrawFunds(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "ZERO_ADDRESS");
        require(amount <= address(this).balance, "INSUFFICIENT_BALANCE");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "TRANSFER_FAILED");
        emit FundsWithdrawn(to, amount);
    }

    function emergencyPayout(uint256 id, address[] calldata payoutWinners, uint16[] calldata payoutBps) external onlyOwner {
        require(payoutWinners.length == payoutBps.length, "LENGTH_MISMATCH");
        uint256 sum;
        for (uint256 i = 0; i < payoutBps.length; i++) sum += payoutBps[i];
        require(sum == 10000, "BPS_NEQ_10000");
        
        Tournament storage t = tournaments[id];
        uint256 pot = t.totalPot;
        require(pot > 0, "NO_POT");

        for (uint256 i = 0; i < payoutWinners.length; i++) {
            address winner = payoutWinners[i];
            PlayerInfo storage p = playerInfo[id][winner];
            require(!p.rewardClaimed, "ALREADY_CLAIMED");
            
            uint256 amount = (pot * payoutBps[i]) / 10000;
            p.rewardClaimed = true;
            (bool ok, ) = winner.call{value: amount}("");
            require(ok, "PAY_FAIL");
            emit EmergencyPayout(id, winner, amount);
        }
    }

    function cancelTournament(uint256 id) external onlyOwner {
        Tournament storage t = tournaments[id];
        require(t.id == id, "NO_TOURNAMENT");
        require(!t.finalized, "ALREADY_FINAL");
        
        address[] memory parts = participants[id];
        uint256 refundAmount = t.totalPot / parts.length;
        uint256 totalRefunded = 0;

        for (uint256 i = 0; i < parts.length; i++) {
            PlayerInfo storage p = playerInfo[id][parts[i]];
            if (p.entered && !p.rewardClaimed) {
                p.rewardClaimed = true;
                (bool ok, ) = parts[i].call{value: refundAmount}("");
                require(ok, "REFUND_FAIL");
                totalRefunded += refundAmount;
            }
        }
        
        t.finalized = true;
        emit TournamentCancelled(id, totalRefunded);
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

    // receive pot funding if needed in future or refunds
    receive() external payable {}
}
