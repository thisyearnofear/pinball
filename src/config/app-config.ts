/**
 * Ecosystem profile determines which wallet adapter, payment token, and chain
 * the app uses. This enables one codebase to serve multiple ecosystems
 * (Mezo, Nimiq, Base, etc.) without forks.
 *
 * See docs/VISION.md — "The verifiable arcade is chain-portable."
 */
export type EcosystemProfile = "mezo" | "nimiq";

/**
 * Payment token type determines how entry fees and rewards are handled.
 * - erc20: requires approve + transferFrom (e.g. MUSD, USDT)
 * - native: sends value directly with the transaction (e.g. NIM, ETH)
 */
export type PaymentTokenType = "erc20" | "native";

/**
 * Wallet adapter determines which wallet connection layer is used.
 * - wagmi: RainbowKit + Wagmi (Mezo, generic EVM)
 * - nimiq: @nimiq/mini-app-sdk (Nimiq Pay)
 */
export type WalletAdapter = "wagmi" | "nimiq";

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

export type AppPaymentTokenConfig = {
  type: PaymentTokenType;
  symbol: string;
  /**
   * ERC-20 contract address (only required when type === "erc20").
   * For native tokens, this is empty.
   */
  address: string;
  decimals: number;
};

export type AppContractsConfig = {
  tournamentManager: {
    address: string;
  };
  /**
   * Payment token for entry fees and prizes.
   * Replaces the former MUSD-specific config. The field is kept as `paymentToken`
   * but `musd` is retained as a legacy alias for backward compatibility.
   */
  paymentToken: AppPaymentTokenConfig;
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
  ecosystem: EcosystemProfile;
  walletAdapter: WalletAdapter;
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

// Next.js only inlines *static* `process.env.NEXT_PUBLIC_*` accesses at build
// time; a dynamic `process.env[key]` lookup resolves to undefined in the
// exported client bundle. Every public env var must be listed here explicitly.
const PUBLIC_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_ACTIVE_MISSION_ID: process.env.NEXT_PUBLIC_ACTIVE_MISSION_ID,
  NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
  NEXT_PUBLIC_BLOCK_EXPLORER_URL: process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL,
  NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
  NEXT_PUBLIC_CHAIN_NAME: process.env.NEXT_PUBLIC_CHAIN_NAME,
  NEXT_PUBLIC_ECOSYSTEM_PROFILE: process.env.NEXT_PUBLIC_ECOSYSTEM_PROFILE,
  NEXT_PUBLIC_MISSION_POOL_ADDRESS: process.env.NEXT_PUBLIC_MISSION_POOL_ADDRESS,
  NEXT_PUBLIC_MUSD_ADDRESS: process.env.NEXT_PUBLIC_MUSD_ADDRESS,
  NEXT_PUBLIC_NATIVE_CURRENCY_DECIMALS: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_DECIMALS,
  NEXT_PUBLIC_NATIVE_CURRENCY_NAME: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_NAME,
  NEXT_PUBLIC_NATIVE_CURRENCY_SYMBOL: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_SYMBOL,
  NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS: process.env.NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS,
  NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS: process.env.NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS,
  NEXT_PUBLIC_PAYMENT_TOKEN_SYMBOL: process.env.NEXT_PUBLIC_PAYMENT_TOKEN_SYMBOL,
  NEXT_PUBLIC_PAYMENT_TOKEN_TYPE: process.env.NEXT_PUBLIC_PAYMENT_TOKEN_TYPE,
  NEXT_PUBLIC_RPC_URL_PUBLIC: process.env.NEXT_PUBLIC_RPC_URL_PUBLIC,
  NEXT_PUBLIC_SCORE_PREFIX: process.env.NEXT_PUBLIC_SCORE_PREFIX,
  NEXT_PUBLIC_TOURNAMENT_MANAGER_ADDRESS: process.env.NEXT_PUBLIC_TOURNAMENT_MANAGER_ADDRESS,
  NEXT_PUBLIC_WALLET_ADAPTER: process.env.NEXT_PUBLIC_WALLET_ADAPTER,
};

function env(key: string): string | undefined {
  const v = PUBLIC_ENV[key] ?? process.env[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function detectEcosystem(): EcosystemProfile {
  const explicit = env("NEXT_PUBLIC_ECOSYSTEM_PROFILE");
  if (explicit === "mezo" || explicit === "nimiq") return explicit;
  // Default: infer from payment token presence for backward compatibility
  if (env("NEXT_PUBLIC_MUSD_ADDRESS") || env("NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS")) {
    // If MUSD is set and no explicit profile, assume mezo (legacy behavior)
    if (env("NEXT_PUBLIC_MUSD_ADDRESS")) return "mezo";
  }
  return "mezo";
}

function detectWalletAdapter(profile: EcosystemProfile): WalletAdapter {
  const explicit = env("NEXT_PUBLIC_WALLET_ADAPTER");
  if (explicit === "wagmi" || explicit === "nimiq") return explicit;
  return profile === "nimiq" ? "nimiq" : "wagmi";
}

function detectPaymentToken(profile: EcosystemProfile): AppPaymentTokenConfig {
  const tokenType = env("NEXT_PUBLIC_PAYMENT_TOKEN_TYPE") as PaymentTokenType | undefined;

  // Native token (e.g. NIM, ETH)
  if (tokenType === "native" || (profile === "nimiq" && !env("NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS"))) {
    return {
      type: "native",
      symbol: env("NEXT_PUBLIC_PAYMENT_TOKEN_SYMBOL") ?? "NIM",
      address: "",
      decimals: Number(env("NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS") ?? 18),
    };
  }

  // ERC-20 token (e.g. MUSD, USDT)
  const address = env("NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS") ?? env("NEXT_PUBLIC_MUSD_ADDRESS") ?? "";
  const symbol = env("NEXT_PUBLIC_PAYMENT_TOKEN_SYMBOL") ?? (profile === "mezo" ? "MUSD" : "USDT");

  return {
    type: "erc20",
    symbol,
    address,
    decimals: Number(env("NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS") ?? 18),
  };
}

export function getAppConfig(): AppConfig {
  if (cached) return cached;

  const ecosystem = detectEcosystem();
  const walletAdapter = detectWalletAdapter(ecosystem);
  const chainId = Number(env("NEXT_PUBLIC_CHAIN_ID") ?? (ecosystem === "mezo" ? 31611 : 137));
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error("Invalid NEXT_PUBLIC_CHAIN_ID (must be a positive number)");
  }

  const cfg: AppConfig = {
    ecosystem,
    walletAdapter,
    chain: {
      chainId,
      rpcUrlPublic: env("NEXT_PUBLIC_RPC_URL_PUBLIC") ?? "https://rpc.test.mezo.org",
      chainName: env("NEXT_PUBLIC_CHAIN_NAME"),
      blockExplorerUrl: env("NEXT_PUBLIC_BLOCK_EXPLORER_URL"),
      nativeCurrency: (() => {
        const name = env("NEXT_PUBLIC_NATIVE_CURRENCY_NAME");
        const symbol = env("NEXT_PUBLIC_NATIVE_CURRENCY_SYMBOL");
        const decimalsRaw = env("NEXT_PUBLIC_NATIVE_CURRENCY_DECIMALS");
        const decimals = decimalsRaw ? Number(decimalsRaw) : undefined;

        if (!name || !symbol || decimals === undefined) return undefined;
        if (!Number.isFinite(decimals) || decimals <= 0) return undefined;

        return { name, symbol, decimals };
      })(),
    },
    contracts: {
      tournamentManager: {
        address: env("NEXT_PUBLIC_TOURNAMENT_MANAGER_ADDRESS") ?? "",
      },
      paymentToken: detectPaymentToken(ecosystem),
      missionPool: {
        address: env("NEXT_PUBLIC_MISSION_POOL_ADDRESS") ?? "",
      },
    },
    score: {
      prefix: env("NEXT_PUBLIC_SCORE_PREFIX") ?? "PINBALL_SCORE:v2",
    },
    backend: {
      baseUrl: env("NEXT_PUBLIC_BACKEND_URL") ?? "",
    },
    missions: {
      activeMissionId: (() => {
        const v = env("NEXT_PUBLIC_ACTIVE_MISSION_ID");
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
