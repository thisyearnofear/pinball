import { ethers } from "ethers";
import { getContractsConfig } from "../../config/contracts";
import type { WalletPort } from "@/domains/wallet/wallet-port";
import { getLegacyWalletPort } from "@/domains/wallet/legacy-web3service-wallet-port";

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

function getPublicProvider(): ethers.Provider {
  const { rpcUrlPublic } = getContractsConfig();
  return new ethers.JsonRpcProvider(rpcUrlPublic);
}

function getMUSDAddress(): string {
  const { musd } = getContractsConfig();
  if (!musd.address) {
    throw new Error("MUSD address not configured. Set VITE_MUSD_ADDRESS");
  }
  return musd.address;
}

export function getMUSDContractRead(): ethers.Contract {
  const provider = getPublicProvider();
  return new ethers.Contract(getMUSDAddress(), ERC20_ABI, provider);
}

export async function getMUSDContractWrite(wallet?: WalletPort): Promise<ethers.Contract> {
  const w = wallet ?? getLegacyWalletPort();
  const signer = await w.getSigner();
  return new ethers.Contract(getMUSDAddress(), ERC20_ABI, signer);
}

export async function getMUSDBalance(address: string): Promise<bigint> {
  const c = getMUSDContractRead();
  const bal: bigint = await c.balanceOf(address);
  return bal;
}

export async function getMUSDAllowance(owner: string, spender: string): Promise<bigint> {
  const c = getMUSDContractRead();
  const allowance: bigint = await c.allowance(owner, spender);
  return allowance;
}

export async function approveMUSD(spender: string, amount: bigint, wallet?: WalletPort): Promise<string> {
  const c = await getMUSDContractWrite(wallet);
  const tx = await c.approve(spender, amount);
  const receipt = await tx.wait();
  return receipt?.hash as string;
}
