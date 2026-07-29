/**
 * Deploy TournamentManager (ERC-20 / USDT) to Polygon MAINNET.
 *
 * This is the production deploy that clears the Nimiq Mini Apps Competition
 * eligibility gate: entry fees and payouts in USDT on Polygon, using the
 * ERC-20 approve + transferFrom flow.
 *
 * What it does:
 *   1. Deploys TournamentManager (scoreSigner, USDT address, entryFee)
 *   2. Creates 4 tournaments (2 kamikaze inverted + 2 classic, 30-day window)
 *
 * NO MockERC20, NO MissionPool — mainnet uses the real USDT contract.
 * The deployer must fund the contract with USDT later to pay out prizes,
 * or rely on the entry-fee pot (players fund the pot via transferFrom).
 *
 * Prereqs:
 *   - PRIVATE_KEY set in contracts/.env (the deployer EOA, must hold POL for gas)
 *   - SCORE_SIGNER_ADDR set (backend signing key; defaults to deployer)
 *   - USDT_ADDRESS set to the canonical Tether contract on Polygon (6 decimals)
 *
 * Usage:
 *   cd contracts
 *   USDT_ADDRESS=<USDT_ADDRESS> ENTRY_FEE=1000000 \
 *     npx hardhat run scripts/deploy-polygon-mainnet-usdt.ts --network polygon
 *
 *   ENTRY_FEE is in USDT base units (6 decimals): 1000000 = 1 USDT.
 *
 * To reuse an already-deployed contract:
 *   EXISTING_TM_ADDRESS=<TM> USDT_ADDRESS=<USDT_ADDRESS> \
 *     npx hardhat run scripts/deploy-polygon-mainnet-usdt.ts --network polygon
 */
const hre = require("hardhat");

const USDT_DECIMALS = 6n;

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const scoreSigner = process.env.SCORE_SIGNER_ADDR ?? deployer.address;
  const USDT_ADDRESS = requireEnv("USDT_ADDRESS", process.env.USDT_ADDRESS);
  // Default 1 USDT entry fee (6 decimals). Override with ENTRY_FEE.
  const entryFee = process.env.ENTRY_FEE ? BigInt(process.env.ENTRY_FEE) : 10n ** USDT_DECIMALS;
  const lowGasPrice = 40n * 10n ** 9n; // 40 gwei (mainnet-safe floor)

  if (hre.network.name !== "polygon") {
    console.warn("\nWARNING: target network is", hre.network.name, "— expected 'polygon'.\n");
  }

  console.log("Deploying to Polygon network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "POL");
  console.log("USDT:", USDT_ADDRESS);
  console.log("Entry fee:", hre.ethers.formatUnits(entryFee, USDT_DECIMALS), "USDT");
  console.log("Gas price:", hre.ethers.formatUnits(lowGasPrice, 9), "gwei\n");

  // ── 1. TournamentManager (ERC-20 / USDT) ────────────────────────
  let tmAddr = process.env.EXISTING_TM_ADDRESS;
  const tmArtifact = await hre.artifacts.readArtifact("TournamentManager");
  if (tmAddr) {
    console.log("1. Reusing TournamentManager at:", tmAddr);
  } else {
    console.log("1. Deploying TournamentManager (USDT)...");
    const tmData = tmArtifact.bytecode + hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint256"],
      [scoreSigner, USDT_ADDRESS, entryFee]
    ).slice(2);
    const tmTx = await deployer.sendTransaction({ data: tmData, gasPrice: lowGasPrice });
    const tmReceipt = await tmTx.wait();
    tmAddr = tmReceipt.contractAddress;
    console.log("   TournamentManager deployed:", tmAddr);
  }
  console.log("   scoreSigner:", scoreSigner);
  console.log("   paymentToken (USDT):", USDT_ADDRESS);
  console.log("   entryFee:", hre.ethers.formatUnits(entryFee, USDT_DECIMALS), "USDT");

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
  console.log("DEPLOYMENT COMPLETE — Polygon MAINNET (USDT)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("TournamentManager:", tmAddr);
  console.log("USDT:", USDT_ADDRESS);
  console.log("Tournaments #1-2: KAMIKAZE (inverted, 30 days)");
  console.log("Tournaments #3-4: CLASSIC (30 days)");
  console.log("Entry fee:", hre.ethers.formatUnits(entryFee, USDT_DECIMALS), "USDT");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\nPaste these into netlify.toml [build.environment]:");
  console.log(`  NEXT_PUBLIC_CHAIN_ID = "137"`);
  console.log(`  NEXT_PUBLIC_RPC_URL_PUBLIC = "https://polygon-rpc.com"`);
  console.log(`  NEXT_PUBLIC_CHAIN_NAME = "Polygon"`);
  console.log(`  NEXT_PUBLIC_BLOCK_EXPLORER_URL = "https://polygonscan.com"`);
  console.log(`  NEXT_PUBLIC_PAYMENT_TOKEN_TYPE = "erc20"`);
  console.log(`  NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS = "<USDT_ADDRESS you passed in>"`);
  console.log(`  NEXT_PUBLIC_PAYMENT_TOKEN_SYMBOL = "USDT"`);
  console.log(`  NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS = "6"`);
  console.log(`  NEXT_PUBLIC_TOURNAMENT_MANAGER_ADDRESS = "${tmAddr}"`);
  console.log("\nAlso update backend CHAIN_ID to 137 and TOURNAMENT_MANAGER_ADDRESS.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
