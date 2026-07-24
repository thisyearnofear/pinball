/**
 * Payment token client — supports both ERC-20 and native token flows.
 *
 * For ERC-20 tokens (MUSD, USDT): uses approve + balanceOf + allowance.
 * For native tokens (NIM, ETH): balance is fetched via provider.getBalance(),
 * and "approval" is a no-op (native value is sent with the transaction itself).
 *
 * This abstraction enables the ecosystem profile system: the same tournament
 * flow works with MUSD on Mezo, NIM on Nimiq, or USDT on Polygon.
 * See docs/VISION.md — "The verifiable arcade is chain-portable."
 */
import { ethers } from "ethers";
import { getContractsConfig } from "../../config/contracts";
import { getPublicProvider } from "./contract-utils";
import type { WalletPort } from "@/domains/wallet/wallet-port";

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

function getPaymentTokenConfig() {
  const { paymentToken } = getContractsConfig();
  if (paymentToken.type === "erc20" && !paymentToken.address) {
    throw new Error("Payment token address not configured. Set NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS or NEXT_PUBLIC_MUSD_ADDRESS");
  }
  return paymentToken;
}

// ── ERC-20 helpers ──────────────────────────────────────────────

function getErc20ContractRead(): ethers.Contract {
  const { address } = getPaymentTokenConfig();
  return new ethers.Contract(address, ERC20_ABI, getPublicProvider());
}

async function getErc20ContractWrite(wallet: WalletPort): Promise<ethers.Contract> {
  const { address } = getPaymentTokenConfig();
  const signer = await wallet.getSigner();
  return new ethers.Contract(address, ERC20_ABI, signer);
}

// ── Unified public API ──────────────────────────────────────────

/**
 * Get the payment token balance for an address.
 * Works for both ERC-20 and native tokens.
 */
export async function getPaymentTokenBalance(address: string): Promise<bigint> {
  const { type } = getPaymentTokenConfig();

  if (type === "native") {
    return await getPublicProvider().getBalance(address);
  }

  const c = getErc20ContractRead();
  const bal: bigint = await c.balanceOf(address);
  return bal;
}

/**
 * Get the ERC-20 allowance for a spender.
 * For native tokens, returns MaxUint256 (no approval needed).
 */
export async function getPaymentTokenAllowance(owner: string, spender: string): Promise<bigint> {
  const { type } = getPaymentTokenConfig();

  if (type === "native") {
    return ethers.MaxUint256;
  }

  const c = getErc20ContractRead();
  const allowance: bigint = await c.allowance(owner, spender);
  return allowance;
}

/**
 * Approve a spender to spend ERC-20 tokens.
 * For native tokens, this is a no-op (returns immediately).
 */
export async function approvePaymentToken(spender: string, amount: bigint, wallet: WalletPort): Promise<string> {
  const { type } = getPaymentTokenConfig();

  if (type === "native") {
    return ""; // no approval needed for native tokens
  }

  const c = await getErc20ContractWrite(wallet);
  const tx = await c.approve(spender, amount);
  const receipt = await tx.wait();
  return receipt?.hash as string;
}

/**
 * Check if a payment token is native (no approve step needed).
 */
export function isNativePaymentToken(): boolean {
  return getPaymentTokenConfig().type === "native";
}

/**
 * Get the payment token symbol from config.
 */
export function getPaymentTokenSymbol(): string {
  return getPaymentTokenConfig().symbol;
}

/**
 * Get the payment token decimals from config.
 */
export function getPaymentTokenDecimals(): number {
  return getPaymentTokenConfig().decimals;
}

// ── Legacy compatibility shims (re-export under old names) ──────
// These allow gradual migration of consumers without breaking existing code.

export const getMUSDBalance = getPaymentTokenBalance;
export const getMUSDAllowance = getPaymentTokenAllowance;
export const approveMUSD = approvePaymentToken;
