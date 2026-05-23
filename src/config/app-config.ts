export type AppChainConfig = {
  chainId: number;
  /**
   * Public RPC for read operations (reliable regardless of wallet provider).
   * Example: https://rpc.example.org
   */
  rpcUrlPublic: string;
  /**
   * Optional metadata used for wallet_addEthereumChain UX.
   * If not provided, the app can still work if the user already has the network added.
   */
  chainName?: string;
  blockExplorerUrl?: string;
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
};

export type AppContractsConfig = {
  tournamentManager: {
    address: string;
  };
  /**
   * MUSD token address for Mezo integration.
   * Not necessarily used by the current ETH-based contract, but configured now to keep the app future-proof.
   */
  musd: {
    address: string;
  };
  /**
   * Optional: Sponsored Missions bounty pool.
   * Used for the "differentiated pinball economy" feature.
   */
  missionPool: {
    address: string;
  };
};

export type AppScoreConfig = {
  /**
   * Hash prefix used by the score signing scheme.
   * Must match both backend and contract expectations.
   */
  prefix: string;
};

export type AppBackendConfig = {
  baseUrl: string;
};

export type AppConfig = {
  chain: AppChainConfig;
  contracts: AppContractsConfig;
  score: AppScoreConfig;
  backend: AppBackendConfig;
  missions: {
    /**
     * Optional: active mission ID to request Sponsored Mission awards during score signing.
     */
    activeMissionId?: number;
  };
};

let cached: AppConfig | null = null;

export function getAppConfig(): AppConfig {
  if (cached) return cached;

  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error("Invalid NEXT_PUBLIC_CHAIN_ID (must be a positive number)");
  }

  const cfg: AppConfig = {
    chain: {
      chainId,
      rpcUrlPublic: (typeof process.env.NEXT_PUBLIC_RPC_URL_PUBLIC === "string" && process.env.NEXT_PUBLIC_RPC_URL_PUBLIC.trim().length > 0)
        ? process.env.NEXT_PUBLIC_RPC_URL_PUBLIC.trim()
        : "https://rpc.test.mezo.org",
      chainName: process.env.NEXT_PUBLIC_CHAIN_NAME,
      blockExplorerUrl: process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL,
      nativeCurrency: (() => {
        const name = process.env.NEXT_PUBLIC_NATIVE_CURRENCY_NAME;
        const symbol = process.env.NEXT_PUBLIC_NATIVE_CURRENCY_SYMBOL;
        const decimalsRaw = process.env.NEXT_PUBLIC_NATIVE_CURRENCY_DECIMALS;
        const decimals = decimalsRaw ? Number(decimalsRaw) : undefined;

        if (!name || !symbol || decimals === undefined) return undefined;
        if (!Number.isFinite(decimals) || decimals <= 0) return undefined;

        return { name, symbol, decimals };
      })(),
    },
    contracts: {
      tournamentManager: {
        address: (typeof process.env.NEXT_PUBLIC_TOURNAMENT_MANAGER_ADDRESS === "string"
          ? process.env.NEXT_PUBLIC_TOURNAMENT_MANAGER_ADDRESS
          : ""
        ).trim(),
      },
      musd: {
        address: (typeof process.env.NEXT_PUBLIC_MUSD_ADDRESS === "string" ? process.env.NEXT_PUBLIC_MUSD_ADDRESS : "").trim(),
      },
      missionPool: {
        address: (typeof process.env.NEXT_PUBLIC_MISSION_POOL_ADDRESS === "string" ? process.env.NEXT_PUBLIC_MISSION_POOL_ADDRESS : "").trim(),
      },
    },
    score: {
      prefix: process.env.NEXT_PUBLIC_SCORE_PREFIX ?? "PINBALL_SCORE:v2",
    },
    backend: {
      baseUrl: (typeof process.env.NEXT_PUBLIC_BACKEND_URL === "string" && process.env.NEXT_PUBLIC_BACKEND_URL.trim().length > 0)
        ? process.env.NEXT_PUBLIC_BACKEND_URL.trim()
        : "",
    },
    missions: {
      activeMissionId: (() => {
        const v = process.env.NEXT_PUBLIC_ACTIVE_MISSION_ID;
        if (!v) return undefined;
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return undefined;
        return n;
      })(),
    },
  };

  cached = cfg;
  return cfg;
}
