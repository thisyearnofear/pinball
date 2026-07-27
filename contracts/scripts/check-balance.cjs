const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  const provider = new ethers.JsonRpcProvider(
    process.env.POLYGON_AMOY_RPC_URL ?? 'https://polygon-amoy.publicnode.com'
  );
  const balance = await provider.getBalance(wallet.address);
  console.log('Deployer:', wallet.address);
  console.log('Amoy POL balance:', ethers.formatEther(balance));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
