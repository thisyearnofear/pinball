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

function requireEnv(key: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required config: ${key}`);
  }
  return value.trim();
}

function optionalEnv(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return v.length ? v : undefined;
}

export function getAppConfig(): AppConfig {
  if (cached) return cached;

  // @ts-expect-error Vite provides import.meta.env
  const env = import.meta.env as Record<string, unknown>;

  const chainId = Number(env.VITE_CHAIN_ID);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error("Invalid VITE_CHAIN_ID (must be a positive number)");
  }

  const cfg: AppConfig = {
    chain: {
      chainId,
      rpcUrlPublic: requireEnv("VITE_RPC_URL_PUBLIC", env.VITE_RPC_URL_PUBLIC),
      chainName: optionalEnv(env.VITE_CHAIN_NAME),
      blockExplorerUrl: optionalEnv(env.VITE_BLOCK_EXPLORER_URL),
      nativeCurrency: (() => {
        const name = optionalEnv(env.VITE_NATIVE_CURRENCY_NAME);
        const symbol = optionalEnv(env.VITE_NATIVE_CURRENCY_SYMBOL);
        const decimalsRaw = optionalEnv(env.VITE_NATIVE_CURRENCY_DECIMALS);
        const decimals = decimalsRaw ? Number(decimalsRaw) : undefined;

        if (!name || !symbol || decimals === undefined) return undefined;
        if (!Number.isFinite(decimals) || decimals <= 0) return undefined;

        return { name, symbol, decimals };
      })(),
    },
    contracts: {
      tournamentManager: {
        address: requireEnv("VITE_TOURNAMENT_MANAGER_ADDRESS", env.VITE_TOURNAMENT_MANAGER_ADDRESS),
      },
      musd: {
        // Allow empty for now (until Mezo integration lands), but keep the key present.
        address: (typeof env.VITE_MUSD_ADDRESS === "string" ? env.VITE_MUSD_ADDRESS : "").trim(),
      },
      missionPool: {
        address: (typeof env.VITE_MISSION_POOL_ADDRESS === "string" ? env.VITE_MISSION_POOL_ADDRESS : "").trim(),
      },
    },
    score: {
      prefix: optionalEnv(env.VITE_SCORE_PREFIX) ?? "PINBALL_SCORE:v2",
    },
    backend: {
      baseUrl: requireEnv("VITE_BACKEND_URL", env.VITE_BACKEND_URL),
    },
    missions: {
      activeMissionId: (() => {
        const v = optionalEnv(env.VITE_ACTIVE_MISSION_ID);
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
