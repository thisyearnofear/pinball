/**
 * NIM payment service — handles tournament entry fees paid in NIM.
 *
 * NIM lives on the Nimiq chain (non-EVM), so there is no smart contract.
 * The flow:
 *   1. User sends NIM to the configured treasury address with data
 *      encoding the tournament ID: "PINBALL_ENTRY:{tournamentId}:{playerAddr}"
 *   2. Backend receives the tx hash, verifies it on the Nimiq chain via RPC,
 *      and registers the player in the tournament.
 *
 * This gives bonus points in the Nimiq Mini Apps Competition for NIM support.
 */
import { getAppConfig } from "@/config/app-config";
import { getNimiqProvider, getNimAccounts } from "./nimiq-provider";

const LUNA_PER_NIM = 100_000;

export type NimEntryResult = {
  txHash: string;
  from: string;
  valueLuna: number;
};

/**
 * Pay the tournament entry fee in NIM via Nimiq Pay's native provider.
 * Throws if not inside Nimiq Pay or if the user rejects.
 */
export async function payEntryFeeInNim(tournamentId: number, playerAddress: string): Promise<NimEntryResult> {
  const provider = await getNimiqProvider();
  if (!provider) {
    throw new Error("NIM payments require Nimiq Pay. Open this app inside the Nimiq Pay app.");
  }

  const cfg = getAppConfig();
  const treasury = cfg.nim.treasuryAddress;
  if (!treasury) {
    throw new Error("NIM treasury address not configured.");
  }

  const accounts = await getNimAccounts();
  if (accounts.length === 0) {
    throw new Error("No Nimiq account found. Create a wallet in Nimiq Pay first.");
  }
  const from = accounts[0];

  const entryFeeNim = cfg.nim.entryFeeNim;
  const valueLuna = Math.round(entryFeeNim * LUNA_PER_NIM);

  const data = `PINBALL_ENTRY:${tournamentId}:${playerAddress}`;

  const result = await provider.sendBasicTransactionWithData({
    recipient: treasury,
    value: valueLuna,
    data,
  });

  if (typeof result !== "string") {
    const err = result as any;
    throw new Error(err?.error?.message ?? "NIM payment was rejected or failed.");
  }

  return { txHash: result, from, valueLuna };
}

/**
 * Register a NIM payment with the backend so the player is entered
 * into the tournament.
 */
export async function confirmNimEntry(
  tournamentId: number,
  playerAddress: string,
  txHash: string,
  from: string,
  valueLuna: number
): Promise<void> {
  const cfg = getAppConfig();
  const backendUrl = cfg.backend.baseUrl;
  if (!backendUrl) throw new Error("Backend URL not configured.");

  const res = await fetch(`${backendUrl}/api/nim-entry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tournamentId,
      playerAddress,
      txHash,
      from,
      valueLuna,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NIM entry confirmation failed: ${res.status} ${body}`);
  }
}

/**
 * Full NIM entry flow: pay + confirm with backend.
 */
export async function enterTournamentWithNim(
  tournamentId: number,
  playerAddress: string
): Promise<string> {
  const payment = await payEntryFeeInNim(tournamentId, playerAddress);
  await confirmNimEntry(
    tournamentId,
    playerAddress,
    payment.txHash,
    payment.from,
    payment.valueLuna
  );
  return payment.txHash;
}

/**
 * Check if NIM payments are available (inside Nimiq Pay + config present).
 */
export function isNimPaymentAvailable(): boolean {
  const cfg = getAppConfig();
  return Boolean(cfg.nim.treasuryAddress && cfg.nim.entryFeeNim > 0);
}
