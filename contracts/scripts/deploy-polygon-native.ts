/**
 * Deploy TournamentManagerNative to Polygon (Amoy testnet or mainnet).
 *
 * Deploys:
 *   1. TournamentManagerNative (scoreSigner = deployer, entryFee in wei)
 *   2. Creates 4 tournaments (2 kamikaze inverted + 2 classic, 30-day window)
 *
 * No MockERC20 or MissionPool needed — payments are in native MATIC.
 * Users get test MATIC from the Polygon Amoy faucet.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-polygon-native.ts --network polygonamoy
 *
 * To reuse an already-deployed contract:
 *   EXISTING_TM_ADDRESS=0x...
 */
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const scoreSigner = process.env.SCORE_SIGNER_ADDR ?? deployer.address;
  // 0.01 MATIC entry fee (in wei) — cheap for testing, real enough to matter
  const entryFee = process.env.ENTRY_FEE ? BigInt(process.env.ENTRY_FEE) : 10n ** 16n;
  const lowGasPrice = 28n * 10n ** 9n; // 28 gwei

  console.log("Deploying to Polygon network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "POL");
  console.log("Entry fee:", hre.ethers.formatEther(entryFee), "MATIC");
  console.log("Gas price:", hre.ethers.formatUnits(lowGasPrice, 9), "gwei\n");

  // ── 1. TournamentManagerNative ──────────────────────────────────
  let tmAddr = process.env.EXISTING_TM_ADDRESS;
  const tmArtifact = await hre.artifacts.readArtifact("TournamentManagerNative");
  if (tmAddr) {
    console.log("1. Reusing TournamentManagerNative at:", tmAddr);
  } else {
    console.log("1. Deploying TournamentManagerNative...");
    const tmData = tmArtifact.bytecode + hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [scoreSigner, entryFee]
    ).slice(2);
    const tmTx = await deployer.sendTransaction({ data: tmData, gasPrice: lowGasPrice });
    const tmReceipt = await tmTx.wait();
    tmAddr = tmReceipt.contractAddress;
    console.log("   TournamentManagerNative deployed:", tmAddr);
  }
  console.log("   scoreSigner:", scoreSigner);
  console.log("   entryFee:", hre.ethers.formatEther(entryFee), "MATIC");

  // ── 2. Create tournaments ───────────────────────────────────────
  console.log("\n2. Creating tournaments...");
  const tm = new hre.ethers.Contract(tmAddr, tmArtifact.abi, deployer);
  const now = Math.floor(Date.now() / 1000);
  const startTime = now;
  const endTime = now + (30 * 24 * 60 * 60); // 30 days
  const topN = 3;
  const prizeBps = [5000, 3000, 2000];

  // ids 1-2: Kamikaze (inverted — lowest drain time wins)
  // ids 3-4: Classic (highest score wins)
  const tournamentModes = [true, true, false, false];
  for (let i = 0; i < tournamentModes.length; i++) {
    const inverted = tournamentModes[i];
    const createTx = await tm.createTournament(startTime, endTime, topN, prizeBps, inverted, {
      gasLimit: 500_000n, gasPrice: lowGasPrice,
    });
    await createTx.wait();
    console.log(`   Tournament #${i + 1} created (${inverted ? "KAMIKAZE / inverted" : "CLASSIC"})`);
  }
  console.log("   Start:", new Date(startTime * 1000).toISOString());
  console.log("   End:", new Date(endTime * 1000).toISOString());
  console.log("   Prize split: 50% / 30% / 20%");

  // ── Summary ─────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("DEPLOYMENT COMPLETE — Polygon", hre.network.name);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("TournamentManagerNative:", tmAddr);
  console.log("Tournaments #1-2:       KAMIKAZE (inverted, 30 days)");
  console.log("Tournaments #3-4:       CLASSIC (30 days)");
  console.log("Entry fee:", hre.ethers.formatEther(entryFee), "MATIC");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\nAdd these to your .env:");
  console.log(`NEXT_PUBLIC_TOURNAMENT_MANAGER_ADDRESS=${tmAddr}`);
  console.log(`NEXT_PUBLIC_PAYMENT_TOKEN_TYPE=native`);
  console.log(`NEXT_PUBLIC_PAYMENT_TOKEN_SYMBOL=MATIC`);
  console.log(`NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS=18`);
  console.log(`NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=`);
  console.log(`NEXT_PUBLIC_MISSION_POOL_ADDRESS=`);
  console.log(`NEXT_PUBLIC_ACTIVE_MISSION_ID=`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
