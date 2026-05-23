import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Helper: build the inner message hash that `finalizeWithSignedWinners` verifies.
 *
 * The contract computes:
 *   innerHash = keccak256(abi.encodePacked(
 *     "PINBALL_FINALIZE:v1", id, chainId, topN, ...winnerAddrs
 *   ))
 *   digest    = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", innerHash))
 *
 * `abi.encodePacked` rules for the inner message:
 *   - string  → raw UTF-8 bytes
 *   - uint256 → 32 bytes
 *   - uint16  → 2 bytes (types < 32 bytes are NOT padded)
 *   - address[] elements → 32 bytes each (array elements ARE padded per Solidity spec)
 */
function buildFinalizeInnerHash(
  tournamentId: bigint,
  chainId: bigint,
  topN: number,
  winnerAddrs: string[],
): string {
  const PREFIX = ethers.toUtf8Bytes("PINBALL_FINALIZE:v1"); // 19 bytes
  const idBytes = ethers.zeroPadValue(ethers.toBeHex(tournamentId), 32);
  const chainIdBytes = ethers.zeroPadValue(ethers.toBeHex(chainId), 32);
  const topNBytes = ethers.zeroPadValue(ethers.toBeHex(topN), 2); // uint16 → 2 bytes

  // Array elements are zero-padded to 32 bytes per abi.encodePacked rules
  const winnerPacked = ethers.concat(
    winnerAddrs.map((addr) => ethers.zeroPadValue(addr, 32)),
  );

  const innerMessage = ethers.concat([
    PREFIX,
    idBytes,
    chainIdBytes,
    topNBytes,
    winnerPacked,
  ]);
  return ethers.keccak256(innerMessage);
}

/**
 * Produce an EIP-191 "personal_sign" signature over the finalize inner hash.
 * `signer.signMessage(bytes)` prepends "\x19Ethereum Signed Message:\n32" and hashes,
 * which matches the contract's `_recoverSigner` path.
 */
async function signFinalize(
  signer: HardhatEthersSigner,
  tournamentId: bigint,
  chainId: bigint,
  topN: number,
  winnerAddrs: string[],
): Promise<string> {
  const innerHash = buildFinalizeInnerHash(
    tournamentId,
    chainId,
    topN,
    winnerAddrs,
  );
  return signer.signMessage(ethers.getBytes(innerHash));
}

describe("TournamentManager – finalizeWithSignedWinners", () => {
  // Shared state
  let owner: HardhatEthersSigner;
  let scoreSignerWallet: HardhatEthersSigner;
  let player1: HardhatEthersSigner;
  let player2: HardhatEthersSigner;
  let player3: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  let musd: Awaited<ReturnType<typeof deployMockERC20>>;
  let tm: Awaited<ReturnType<typeof deployTournamentManager>>;

  const ENTRY_FEE = ethers.parseEther("10"); // 10 MUSD
  const SUPPLY = ethers.parseEther("1000000");

  // Helpers to deploy contracts once per test suite
  async function deployMockERC20() {
    const Factory = await ethers.getContractFactory("MockERC20");
    const token = await Factory.deploy("MockUSD", "MUSD", SUPPLY);
    await token.waitForDeployment();
    return token;
  }

  async function deployTournamentManager(signerAddr: string, musdAddr: string) {
    const Factory = await ethers.getContractFactory("TournamentManager");
    const contract = await Factory.deploy(signerAddr, musdAddr, ENTRY_FEE);
    await contract.waitForDeployment();
    return contract;
  }

  /** Distribute MUSD and approve TournamentManager for entry fees */
  async function fundAndApprove(player: HardhatEthersSigner, amount = ENTRY_FEE) {
    await musd.transfer(player, amount);
    await musd.connect(player).approve(await tm.getAddress(), amount);
  }

  /** Helper: build prizeBps that sum to 10000 for given topN */
  function makePrizeBps(topN: number): number[] {
    if (topN === 1) return [10000];
    if (topN === 2) return [6000, 4000];
    if (topN === 3) return [5000, 3000, 2000];
    throw new Error(`Unsupported topN: ${topN}`);
  }

  /**
   * Helper: create a tournament that has already ended.
   * Uses future timestamps and evm_increaseTime to safely fast-forward.
   */
  async function createEndedTournament(topN = 3) {
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const start = now + 100;
    const end = now + 200;
    const prizeBps = makePrizeBps(topN);

    const tx = await tm.createTournament(start, end, topN, prizeBps);
    const receipt = await tx.wait();
    const event = receipt!.logs.find((l: any) => {
      try { return tm.interface.parseLog(l)?.name === "TournamentCreated"; }
      catch { return false; }
    });
    const parsed = tm.interface.parseLog(event!);
    const id = parsed!.args[0] as bigint;

    // Fast-forward past endTime
    await ethers.provider.send("evm_increaseTime", [300]);
    await ethers.provider.send("evm_mine", []);

    return { id, start, end, prizeBps };
  }

  /** Enter tournament with a player (tournament must be active at current time) */
  async function enterWithPlayer(id: bigint, player: HardhatEthersSigner) {
    // Need to be within the tournament window; use evm_setNextBlockTimestamp trick
    // We assume the caller handles time
    await tm.connect(player).enterTournament(id);
  }

  // ─── Deploy fresh contracts before each test ───────────────────────────────

  beforeEach(async () => {
    [owner, scoreSignerWallet, player1, player2, player3, other] =
      await ethers.getSigners();

    musd = await deployMockERC20();
    tm = await deployTournamentManager(
      scoreSignerWallet.address,
      await musd.getAddress(),
    );
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Succeeds with valid signature from scoreSigner
  // ────────────────────────────────────────────────────────────────────────────
  it("succeeds with a valid signature from scoreSigner", async () => {
    const { id, prizeBps } = await createEndedTournament(3);

    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    const winners = [player1.address, player2.address, player3.address];
    const sig = await signFinalize(
      scoreSignerWallet,
      id,
      chainId,
      3,
      winners,
    );

    await expect(tm.finalizeWithSignedWinners(id, winners, sig))
      .to.emit(tm, "Finalized")
      .withArgs(id, winners);

    const storedWinners = await tm.getWinners(id);
    expect(storedWinners).to.deep.equal(winners);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Reverts with invalid signature (BAD_FINALIZE_SIG)
  // ────────────────────────────────────────────────────────────────────────────
  it("reverts with an invalid signature (BAD_FINALIZE_SIG)", async () => {
    const { id } = await createEndedTournament(3);

    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    const winners = [player1.address, player2.address, player3.address];

    // Sign with the WRONG signer (owner instead of scoreSigner)
    const badSig = await signFinalize(owner, id, chainId, 3, winners);

    await expect(
      tm.finalizeWithSignedWinners(id, winners, badSig),
    ).to.be.revertedWith("BAD_FINALIZE_SIG");
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Reverts with wrong winner count (WINNER_COUNT_MISMATCH)
  // ────────────────────────────────────────────────────────────────────────────
  it("reverts with wrong winner count (WINNER_COUNT_MISMATCH)", async () => {
    const { id } = await createEndedTournament(3);

    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    // Only 2 winners for a topN=3 tournament
    const winners = [player1.address, player2.address];
    const sig = await signFinalize(
      scoreSignerWallet,
      id,
      chainId,
      3,
      winners,
    );

    await expect(
      tm.finalizeWithSignedWinners(id, winners, sig),
    ).to.be.revertedWith("WINNER_COUNT_MISMATCH");
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Reverts if tournament not ended yet
  // ────────────────────────────────────────────────────────────────────────────
  it("reverts if tournament has not ended yet", async () => {
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const start = now + 100;
    const end = now + 7200; // ends in ~2 hours
    const topN = 2;
    const prizeBps = [6000, 4000];

    const tx = await tm.createTournament(start, end, topN, prizeBps);
    const receipt = await tx.wait();
    const event = receipt!.logs.find((l: any) => {
      try { return tm.interface.parseLog(l)?.name === "TournamentCreated"; }
      catch { return false; }
    });
    const parsed = tm.interface.parseLog(event!);
    const id = parsed!.args[0] as bigint;

    // Fast-forward to within the active window (before end)
    await ethers.provider.send("evm_increaseTime", [200]);
    await ethers.provider.send("evm_mine", []);

    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    const winners = [player1.address, player2.address];
    const sig = await signFinalize(
      scoreSignerWallet,
      id,
      chainId,
      topN,
      winners,
    );

    await expect(
      tm.finalizeWithSignedWinners(id, winners, sig),
    ).to.be.revertedWith("NOT_ENDED");
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Reverts if already finalized
  // ────────────────────────────────────────────────────────────────────────────
  it("reverts if tournament is already finalized", async () => {
    const { id } = await createEndedTournament(2);

    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    const winners = [player1.address, player2.address];
    const sig = await signFinalize(
      scoreSignerWallet,
      id,
      chainId,
      2,
      winners,
    );

    // First finalization succeeds
    await tm.finalizeWithSignedWinners(id, winners, sig);

    // Second finalization must revert
    await expect(
      tm.finalizeWithSignedWinners(id, winners, sig),
    ).to.be.revertedWith("ALREADY_FINAL");
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Winners can claim rewards after signed finalization
  // ────────────────────────────────────────────────────────────────────────────
  it("allows winners to claim rewards after signed finalization", async () => {
    // Create tournament with a time window that lets players enter
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const start = now + 100;
    const end = now + 3700; // active window: start to start+3600
    const topN = 2;
    const prizeBps = [6000, 4000];

    const tx = await tm.createTournament(start, end, topN, prizeBps);
    const receipt = await tx.wait();
    const event = receipt!.logs.find((l: any) => {
      try { return tm.interface.parseLog(l)?.name === "TournamentCreated"; }
      catch { return false; }
    });
    const parsed = tm.interface.parseLog(event!);
    const id = parsed!.args[0] as bigint;

    // Fast-forward to active window and enter players
    await ethers.provider.send("evm_increaseTime", [200]);
    await ethers.provider.send("evm_mine", []);

    await fundAndApprove(player1, ENTRY_FEE);
    await fundAndApprove(player2, ENTRY_FEE);
    await tm.connect(player1).enterTournament(id);
    await tm.connect(player2).enterTournament(id);

    // Fast-forward past end
    await ethers.provider.send("evm_increaseTime", [3700]);
    await ethers.provider.send("evm_mine", []);

    // Finalize with signed winners (player1 = 1st, player2 = 2nd)
    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    const winners = [player1.address, player2.address];
    const sig = await signFinalize(
      scoreSignerWallet,
      id,
      chainId,
      topN,
      winners,
    );
    await tm.finalizeWithSignedWinners(id, winners, sig);

    // Fund the contract so it can pay out (it already has 20 MUSD from entry fees)
    const totalPot = ENTRY_FEE * 2n; // 20 MUSD
    const expectedP1 = (totalPot * BigInt(prizeBps[0])) / 10000n; // 12 MUSD
    const expectedP2 = (totalPot * BigInt(prizeBps[1])) / 10000n; // 8 MUSD

    // Player 1 claims
    const p1BalBefore = await musd.balanceOf(player1.address);
    await tm.connect(player1).claimReward(id);
    const p1BalAfter = await musd.balanceOf(player1.address);
    expect(p1BalAfter - p1BalBefore).to.equal(expectedP1);

    // Player 2 claims
    const p2BalBefore = await musd.balanceOf(player2.address);
    await tm.connect(player2).claimReward(id);
    const p2BalAfter = await musd.balanceOf(player2.address);
    expect(p2BalAfter - p2BalBefore).to.equal(expectedP2);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 7. Legacy finalize() still works for small tournaments (backward compat)
  // ────────────────────────────────────────────────────────────────────────────
  it("legacy finalize() still works for small tournaments", async () => {
    // Create tournament with a time window that lets players enter
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const start = now + 100;
    const end = now + 3700;
    const topN = 2;
    const prizeBps = [6000, 4000];

    const tx = await tm.createTournament(start, end, topN, prizeBps);
    const receipt = await tx.wait();
    const event = receipt!.logs.find((l: any) => {
      try { return tm.interface.parseLog(l)?.name === "TournamentCreated"; }
      catch { return false; }
    });
    const parsed = tm.interface.parseLog(event!);
    const id = parsed!.args[0] as bigint;

    // Enter players during active window
    await ethers.provider.send("evm_increaseTime", [200]);
    await ethers.provider.send("evm_mine", []);

    await fundAndApprove(player1, ENTRY_FEE);
    await fundAndApprove(player2, ENTRY_FEE);
    await tm.connect(player1).enterTournament(id);
    await tm.connect(player2).enterTournament(id);

    // Submit scores (use the score signing key)
    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    // Player1 gets score 1000, player2 gets score 500
    await submitScore(player1, id, 1000n, 1n, chainId, "P1", "");
    await submitScore(player2, id, 500n, 1n, chainId, "P2", "");

    // Fast-forward past end
    await ethers.provider.send("evm_increaseTime", [3700]);
    await ethers.provider.send("evm_mine", []);

    // Legacy finalize
    await expect(tm.finalize(id))
      .to.emit(tm, "Finalized");

    const winners = await tm.getWinners(id);
    expect(winners.length).to.equal(topN);
    // player1 should be first (higher score)
    expect(winners[0]).to.equal(player1.address);
    expect(winners[1]).to.equal(player2.address);

    // Can still claim rewards
    const totalPot = ENTRY_FEE * 2n;
    const expectedP1 = (totalPot * BigInt(prizeBps[0])) / 10000n;
    const p1BalBefore = await musd.balanceOf(player1.address);
    await tm.connect(player1).claimReward(id);
    expect((await musd.balanceOf(player1.address)) - p1BalBefore).to.equal(
      expectedP1,
    );
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 8. Verify the signature scheme matches the expected hash
  // ────────────────────────────────────────────────────────────────────────────
  it("verifies the signature scheme: inner hash and EIP-191 prefix", async () => {
    const { id } = await createEndedTournament(3);

    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    const winners = [player1.address, player2.address, player3.address];

    // Build the inner hash the same way the contract does
    const innerHash = buildFinalizeInnerHash(id, chainId, 3, winners);

    // Compute the EIP-191 digest the contract would use
    const expectedDigest = ethers.keccak256(
      ethers.concat([
        ethers.toUtf8Bytes("\x19Ethereum Signed Message:\n32"),
        ethers.getBytes(innerHash),
      ]),
    );

    // Sign via ethers (which does the same EIP-191 prefix internally)
    const sig = await signFinalize(
      scoreSignerWallet,
      id,
      chainId,
      3,
      winners,
    );

    // Recover the signer from the signature and digest
    const recovered = ethers.verifyMessage(
      ethers.getBytes(innerHash),
      sig,
    );
    expect(recovered).to.equal(scoreSignerWallet.address);

    // Additionally verify the full on-chain flow accepts this signature
    await expect(tm.finalizeWithSignedWinners(id, winners, sig))
      .to.emit(tm, "Finalized");
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Extra: reverts for non-existent tournament
  // ────────────────────────────────────────────────────────────────────────────
  it("reverts for a non-existent tournament", async () => {
    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    const fakeId = 999n;
    const winners = [player1.address, player2.address, player3.address];
    const sig = await signFinalize(
      scoreSignerWallet,
      fakeId,
      chainId,
      3,
      winners,
    );

    await expect(
      tm.finalizeWithSignedWinners(fakeId, winners, sig),
    ).to.be.revertedWith("NO_TOURNAMENT");
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Extra: reverts if winner address list differs from signed list
  // ────────────────────────────────────────────────────────────────────────────
  it("reverts if submitted winners differ from signed winners", async () => {
    const { id } = await createEndedTournament(3);

    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    const signedWinners = [player1.address, player2.address, player3.address];
    const sig = await signFinalize(
      scoreSignerWallet,
      id,
      chainId,
      3,
      signedWinners,
    );

    // Submit different winners than what was signed
    const tamperedWinners = [player1.address, player2.address, other.address];

    // This should revert because recovered signer won't match scoreSigner
    await expect(
      tm.finalizeWithSignedWinners(id, tamperedWinners, sig),
    ).to.be.revertedWith("BAD_FINALIZE_SIG");
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Helper: submit a signed score for a player
  // ────────────────────────────────────────────────────────────────────────────
  async function submitScore(
    player: HardhatEthersSigner,
    tournamentId: bigint,
    score: bigint,
    nonce: bigint,
    chainId: bigint,
    name: string,
    metadata: string,
  ) {
    const SCORE_PREFIX = "PINBALL_SCORE:v2";
    const nameHash = ethers.keccak256(ethers.toUtf8Bytes(name));
    const metaHash = ethers.keccak256(ethers.toUtf8Bytes(metadata));

    // Build inner packed message
    // abi.encodePacked: address is 20 bytes (not 32), uint256 is 32 bytes
    const innerMsg = ethers.concat([
      ethers.toUtf8Bytes(SCORE_PREFIX),
      ethers.zeroPadValue(ethers.toBeHex(tournamentId), 32),
      ethers.getBytes(player.address), // address → 20 bytes in abi.encodePacked
      ethers.zeroPadValue(ethers.toBeHex(score), 32),
      ethers.zeroPadValue(ethers.toBeHex(nonce), 32),
      ethers.zeroPadValue(ethers.toBeHex(chainId), 32),
      ethers.getBytes(nameHash),
      ethers.getBytes(metaHash),
    ]);
    const innerHash = ethers.keccak256(innerMsg);
    const sig = await scoreSignerWallet.signMessage(
      ethers.getBytes(innerHash),
    );

    await tm
      .connect(player)
      .submitScoreWithSignature(
        tournamentId,
        score,
        nonce,
        name,
        metadata,
        sig,
      );
  }
});
