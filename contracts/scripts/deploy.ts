const hre = require("hardhat");

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const scoreSigner = requireEnv("SCORE_SIGNER_ADDR", process.env.SCORE_SIGNER_ADDR);
  const musd = requireEnv("MUSD_ADDRESS", process.env.MUSD_ADDRESS);
  const entryFee = process.env.ENTRY_FEE ? BigInt(process.env.ENTRY_FEE) : 1n * 10n ** 18n;

  console.log("Deploying from:", deployer.address);

  // Use raw tx to avoid ethers v6 resolveName issue with Hardhat provider
  const tmArtifact = await hre.artifacts.readArtifact("TournamentManager");
  const tmTx = await deployer.sendTransaction({
    data: tmArtifact.bytecode + hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint256"],
      [scoreSigner, musd, entryFee]
    ).slice(2),
  });
  const tmReceipt = await tmTx.wait();
  const tmAddr = tmReceipt.contractAddress;
  console.log("TournamentManager deployed:", tmAddr);
  console.log("  scoreSigner:", scoreSigner);
  console.log("  musd:", musd);
  console.log("  entryFee:", entryFee.toString());

  const mpArtifact = await hre.artifacts.readArtifact("MissionPool");
  const mpTx = await deployer.sendTransaction({
    data: mpArtifact.bytecode + hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address"],
      [musd, scoreSigner]
    ).slice(2),
  });
  const mpReceipt = await mpTx.wait();
  const mpAddr = mpReceipt.contractAddress;
  console.log("MissionPool deployed:", mpAddr);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
