import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

/**
 * Hardhat config for Mezo.
 *
 * Core principles:
 * - DRY: all network details come from env with safe defaults
 * - CLEAN: no deployment logic here, only network/compiler configuration
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

const PRIVATE_KEY = process.env.PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 1 }, // optimize for deployment size (cheaper deploy gas)
      viaIR: true,
      evmVersion: "london",
    },
  },
  networks: {
    mezotestnet: {
      url: process.env.MEZO_TESTNET_RPC_URL ?? "https://rpc.test.mezo.org",
      chainId: Number(process.env.MEZO_TESTNET_CHAIN_ID ?? 31611),
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    mezomainnet: {
      url: process.env.MEZO_MAINNET_RPC_URL ?? "https://mainnet.mezo.public.validationcloud.io/",
      chainId: Number(process.env.MEZO_MAINNET_CHAIN_ID ?? 31612),
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    polygonamoy: {
      url: process.env.POLYGON_AMOY_RPC_URL ?? "https://polygon-amoy.publicnode.com",
      chainId: Number(process.env.POLYGON_AMOY_CHAIN_ID ?? 80002),
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com",
      chainId: Number(process.env.POLYGON_CHAIN_ID ?? 137),
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};

// Fail fast if a deploy is attempted without credentials
if (process.env.npm_lifecycle_script?.includes("hardhat run") && !PRIVATE_KEY) {
  requireEnv("PRIVATE_KEY", PRIVATE_KEY);
}

export default config;
