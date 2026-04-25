import { getAppConfig } from "./app-config";

export type ContractsConfig = {
  chainId: number;
  rpcUrlPublic: string;
  tournamentManager: {
    address: string;
    // ABI is imported by the client; here we only keep address and chain
  };
  musd: {
    address: string;
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
    tournamentManager: {
      address: cfg.contracts.tournamentManager.address,
    },
    musd: {
      address: cfg.contracts.musd.address,
    },
    missionPool: {
      address: cfg.contracts.missionPool.address,
    },
    score: {
      prefix: cfg.score.prefix,
    },
  };
}
