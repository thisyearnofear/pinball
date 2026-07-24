/**
 * Deploy to Polygon (Amoy testnet or mainnet).
 *
 * Deploys (skipping any that have EXISTING_*_ADDRESS set):
 *   1. MockERC20 as test USDT (6 decimals, mints large supply to deployer)
 *   2. TournamentManager (scoreSigner = deployer, paymentToken = MockERC20)
 *   3. MissionPool (paymentToken = MockERC20, attestor = deployer)
 *   4. Creates an initial tournament (30-day window, top 3, 50/30/20 split)
 *   5. Creates a mission (10 USDT x 100 winners)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-polygon.ts --network polygonamoy
 *
 * To reuse already-deployed contracts, set env vars:
 *   EXISTING_TOKEN_ADDRESS=0x...     (skip MockERC20 deploy)
 *   EXISTING_TM_ADDRESS=0x...       (skip TournamentManager deploy)
 */
const hre = require("hardhat");

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const scoreSigner = process.env.SCORE_SIGNER_ADDR ?? deployer.address;
  const entryFee = process.env.ENTRY_FEE ? BigInt(process.env.ENTRY_FEE) : 1_000_000n;
  const lowGasPrice = 25n * 10n ** 9n; // 25 gwei minimum on Amoy

  console.log("Deploying to Polygon network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "POL");
  console.log("Gas price:", hre.ethers.formatUnits(lowGasPrice, 9), "gwei\n");

  // ── 1. MockERC20 (or reuse) ─────────────────────────────────────
  let tokenAddr = process.env.EXISTING_TOKEN_ADDRESS;
  if (tokenAddr) {
    console.log("1. Reusing MockERC20 at:", tokenAddr);
  } else {
    console.log("1. Deploying MockERC20 (test USDT, 6 decimals)...");
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const initialSupply = 1_000_000n * 10n ** 6n;
    const token = await MockERC20.deploy("Test USDT", "USDT", initialSupply);
    await token.waitForDeployment();
    tokenAddr = await token.getAddress();
    console.log("   MockERC20 (USDT) deployed:", tokenAddr);
  }

  // ── 2. TournamentManager (or reuse) ─────────────────────────────
  let tmAddr = process.env.EXISTING_TM_ADDRESS;
  const tmArtifact = await hre.artifacts.readArtifact("TournamentManager");
  if (tmAddr) {
    console.log("\n2. Reusing TournamentManager at:", tmAddr);
  } else {
    console.log("\n2. Deploying TournamentManager...");
    const tmData = tmArtifact.bytecode + hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint256"],
      [scoreSigner, tokenAddr, entryFee]
    ).slice(2);
    const tmTx = await deployer.sendTransaction({ data: tmData, gasPrice: lowGasPrice });
    const tmReceipt = await tmTx.wait();
    tmAddr = tmReceipt.contractAddress;
    console.log("   TournamentManager deployed:", tmAddr);
  }
  console.log("   scoreSigner:", scoreSigner);
  console.log("   paymentToken:", tokenAddr);

  // ── 3. MissionPool ──────────────────────────────────────────────
  console.log("\n3. Deploying MissionPool...");
  const mpArtifact = await hre.artifacts.readArtifact("MissionPool");
  const mpData = mpArtifact.bytecode + hre.ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address"],
    [tokenAddr, scoreSigner]
  ).slice(2);
  const mpTx = await deployer.sendTransaction({
    data: mpData,
    gasLimit: 1_500_000n,
    gasPrice: lowGasPrice,
  });
  const mpReceipt = await mpTx.wait();
  const mpAddr = mpReceipt.contractAddress;
  console.log("   MissionPool deployed:", mpAddr);

  // ── 4. Create initial tournament ────────────────────────────────
  console.log("\n4. Creating initial tournament...");
  const tm = new hre.ethers.Contract(tmAddr, tmArtifact.abi, deployer);
  const now = Math.floor(Date.now() / 1000);
  const startTime = now;
  const endTime = now + (30 * 24 * 60 * 60); // 30 days
  const topN = 3;
  const prizeBps = [5000, 3000, 2000];

  const createTx = await tm.createTournament(startTime, endTime, topN, prizeBps, {
    gasLimit: 500_000n, gasPrice: lowGasPrice,
  });
  await createTx.wait();
  console.log("   Tournament #1 created!");
  console.log("   Start:", new Date(startTime * 1000).toISOString());
  console.log("   End:", new Date(endTime * 1000).toISOString());
  console.log("   Prize split: 50% / 30% / 20%");

  // ── 5. Create mission (jackpot) ────────────────────────────────
  console.log("\n5. Creating test mission (jackpot)...");
  const token = new hre.ethers.Contract(tokenAddr,
    ["function approve(address spender, uint256 amount) returns (bool)"],
    deployer);
  const missionReward = 10n * 10n ** 6n; // 10 USDT per winner
  const missionMaxWinners = 100;
  const missionTotal = missionReward * BigInt(missionMaxWinners);

  const approveTx = await token.approve(mpAddr, missionTotal, {
    gasLimit: 100_000n, gasPrice: lowGasPrice,
  });
  await approveTx.wait();
  console.log("   Approved", Number(missionTotal) / 1_000_000, "USDT for MissionPool");

  const mp = new hre.ethers.Contract(mpAddr, mpArtifact.abi, deployer);
  const missionTx = await mp.createMission(missionReward, missionMaxWinners, {
    gasLimit: 500_000n, gasPrice: lowGasPrice,
  });
  await missionTx.wait();
  console.log("   Mission #1 created! (10 USDT x 100 winners)");

  // ── Summary ─────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("DEPLOYMENT COMPLETE — Polygon", hre.network.name);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("MockERC20 (USDT):    ", tokenAddr);
  console.log("TournamentManager:   ", tmAddr);
  console.log("MissionPool:         ", mpAddr);
  console.log("Tournament #1:       active (30 days)");
  console.log("Mission #1:          active (10 USDT x 100 winners)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\nAdd these to your .env for the Nimiq profile:");
  console.log(`NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=${tokenAddr}`);
  console.log(`NEXT_PUBLIC_TOURNAMENT_MANAGER_ADDRESS=${tmAddr}`);
  console.log(`NEXT_PUBLIC_MISSION_POOL_ADDRESS=${mpAddr}`);
  console.log(`NEXT_PUBLIC_ACTIVE_MISSION_ID=1`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
