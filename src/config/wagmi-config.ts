"use client";

/**
 * Wagmi configuration for Next.js.
 * Only active when NEXT_PUBLIC_WALLET_ADAPTER=wagmi (default for Mezo profile).
 * When NEXT_PUBLIC_WALLET_ADAPTER=nimiq, this module is not used — the app
 * uses @nimiq/mini-app-sdk instead.
 *
 * Defines chains directly to avoid @mezo-org/passport SSR issues.
 */
import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { getAppConfig } from "./app-config";

export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.test.mezo.org"] },
  },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" },
  },
  testnet: true,
});

export const mezoMainnet = defineChain({
  id: 31612,
  name: "Mezo Mainnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.mezo.public.validationcloud.io/"] },
  },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.mezo.org/" },
  },
});

export const polygon = defineChain({
  id: 137,
  name: "Polygon",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://polygon-rpc.com"] },
  },
});

export const polygonAmoy = defineChain({
  id: 80002,
  name: "Polygon Amoy",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://polygon-amoy.publicnode.com"] },
  },
  testnet: true,
});

/**
 * Build wagmi config from the active ecosystem profile.
 * This allows the app to serve multiple chains without code changes.
 */
export function buildWagmiConfig() {
  const cfg = getAppConfig();
  const chainId = cfg.chain.chainId;

  // Select the chain definition based on config
  let chain;
  switch (chainId) {
    case mezoTestnet.id:
      chain = mezoTestnet;
      break;
    case mezoMainnet.id:
      chain = mezoMainnet;
      break;
    case polygon.id:
      chain = polygon;
      break;
    case polygonAmoy.id:
      chain = polygonAmoy;
      break;
    default:
      // Build a chain definition from config for unknown chains
      chain = defineChain({
        id: chainId,
        name: cfg.chain.chainName ?? `Chain ${chainId}`,
        nativeCurrency: cfg.chain.nativeCurrency ?? { name: "Native", symbol: "ETH", decimals: 18 },
        rpcUrls: {
          default: { http: [cfg.chain.rpcUrlPublic] },
        },
        blockExplorers: cfg.chain.blockExplorerUrl
          ? { default: { name: "Explorer", url: cfg.chain.blockExplorerUrl } }
          : undefined,
      });
  }

  return createConfig({
    chains: [chain],
    transports: {
      [chain.id]: http(cfg.chain.rpcUrlPublic),
    },
  });
}

export const config = buildWagmiConfig();

/**
 * Whether the Wagmi adapter is active (based on ecosystem profile).
 */
export function isWagmiAdapter(): boolean {
  return getAppConfig().walletAdapter === "wagmi";
}
