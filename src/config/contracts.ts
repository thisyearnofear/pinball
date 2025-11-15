export type ContractsConfig = {
  chainId: number;
  tournamentManager: {
    address: string;
    // ABI is imported by the client; here we only keep address and chain
  };
};

// Load from Vite env or window override; no mocks -> throw if missing
export function getContractsConfig(): ContractsConfig {
  // @ts-expect-error Vite provides import.meta.env
  const envChain = Number(import.meta.env.VITE_CHAIN_ID);
  // @ts-expect-error Vite provides import.meta.env
  const addr = (import.meta.env.VITE_TOURNAMENT_MANAGER_ADDRESS as string) || "";

  const chainId = Number.isFinite(envChain) && envChain > 0 ? envChain : 0;
  if (!chainId || !addr) {
    throw new Error("Contracts not configured. Set VITE_CHAIN_ID and VITE_TOURNAMENT_MANAGER_ADDRESS");
  }

  return {
    chainId,
    tournamentManager: {
      address: addr,
    },
  };
}
