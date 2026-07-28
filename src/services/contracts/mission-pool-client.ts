import { ethers } from "ethers";
import { getContractsConfig } from "../../config/contracts";
import { approvePaymentToken, getPaymentTokenAllowance, getPaymentTokenBalance, getPaymentTokenSymbol, getPaymentTokenDecimals } from "./payment-token-client";
import { MISSION_POOL_ABI } from "./abi";
import { getPublicContract, getWriteContract as getWriteEthersContract } from "./contract-utils";
import type { WalletPort } from "@/domains/wallet/wallet-port";

function getMissionPoolAddress(): string {
  const { missionPool } = getContractsConfig();
  if (!missionPool.address) {
    throw new Error("MissionPool not configured. Set NEXT_PUBLIC_MISSION_POOL_ADDRESS");
  }
  return missionPool.address;
}

function getReadContract(): ethers.Contract {
  return getPublicContract(getMissionPoolAddress(), MISSION_POOL_ABI);
}

async function getWriteContract(wallet: WalletPort): Promise<ethers.Contract> {
  return await getWriteEthersContract(getMissionPoolAddress(), MISSION_POOL_ABI, wallet);
}

export async function createSponsoredMission(
  params: { rewardPerWinner: bigint; maxWinners: number },
  wallet: WalletPort
): Promise<string> {
  const w = wallet;
  const address = await w.getAddress();

  const total = params.rewardPerWinner * BigInt(params.maxWinners);

  const tokenSymbol = getPaymentTokenSymbol();
  const balance = await getPaymentTokenBalance(address);
  if (balance < total) {
    throw new Error(`Insufficient ${tokenSymbol} balance. Need ${ethers.formatUnits(total, getPaymentTokenDecimals())} ${tokenSymbol}`);
  }

  const spender = getMissionPoolAddress();
  const allowance = await getPaymentTokenAllowance(address, spender);
  if (allowance < total) {
    await approvePaymentToken(spender, ethers.MaxUint256, w);
  }

  const c = await getWriteContract(w);
  const tx = await c.createMission(params.rewardPerWinner, params.maxWinners);
  const receipt = await tx.wait();
  return receipt?.hash as string;
}

export async function getLatestMissionId(): Promise<number> {
  const c = getReadContract();
  const id: bigint = await c.lastMissionId();
  return Number(id);
}
