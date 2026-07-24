import { getAppConfig } from "./app-config";

export type ContractsConfig = {
  chainId: number;
  rpcUrlPublic: string;
  ecosystem: "mezo" | "nimiq";
  walletAdapter: "wagmi" | "nimiq";
  tournamentManager: {
    address: string;
  };
  paymentToken: {
    type: "erc20" | "native";
    symbol: string;
    address: string;
    decimals: number;
  };
  missionPool: {
    address: string;
  };
  score: {
    prefix: string;
  };
};

// Load from a single validated app config (DRY).
export function getContractsConfig(): ContractsConfig {
  const cfg = getAppConfig();
  return {
    chainId: cfg.chain.chainId,
    rpcUrlPublic: cfg.chain.rpcUrlPublic,
    ecosystem: cfg.ecosystem,
    walletAdapter: cfg.walletAdapter,
    tournamentManager: {
      address: cfg.contracts.tournamentManager.address,
    },
    paymentToken: cfg.contracts.paymentToken,
    missionPool: {
      address: cfg.contracts.missionPool.address,
    },
    score: {
      prefix: cfg.score.prefix,
    },
  };
}
