import { ethers } from "hardhat";

/**
 * Deploy TournamentManager for Mezo.
 *
 * Deployment is intentionally simple: we pass only immutable, env-driven values:
 * - scoreSigner: backend signer address (EOA)
 * - musd: MUSD ERC20 address on the target chain
 * - entryFee: token units (18 decimals expected for MUSD on Mezo)
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

async function main() {
  const scoreSigner = requireEnv("SCORE_SIGNER_ADDR", process.env.SCORE_SIGNER_ADDR);
  const musd = requireEnv("MUSD_ADDRESS", process.env.MUSD_ADDRESS);

  // Default: 1 MUSD entry fee (18 decimals). Override as needed.
  const entryFee = process.env.ENTRY_FEE ? BigInt(process.env.ENTRY_FEE) : 1n * 10n ** 18n;

  const TournamentManager = await ethers.getContractFactory("TournamentManager");
  const tm = await TournamentManager.deploy(scoreSigner, musd, entryFee);
  await tm.waitForDeployment();

  const addr = await tm.getAddress();
  console.log("TournamentManager deployed:", addr);
  console.log("scoreSigner:", scoreSigner);
  console.log("musd:", musd);
  console.log("entryFee:", entryFee.toString());

  const MissionPool = await ethers.getContractFactory("MissionPool");
  const mp = await MissionPool.deploy(musd, scoreSigner);
  await mp.waitForDeployment();
  console.log("MissionPool deployed:", await mp.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
