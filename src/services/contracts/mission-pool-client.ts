import { ethers } from "ethers";
import { getContractsConfig } from "../../config/contracts";
import { approveMUSD, getMUSDAllowance, getMUSDBalance } from "./musd-client";
import { MISSION_POOL_ABI } from "./abi";
import { getPublicContract, getWriteContract as getWriteEthersContract } from "./contract-utils";
import type { WalletPort } from "@/domains/wallet/wallet-port";
import { getLegacyWalletPort } from "@/domains/wallet/legacy-web3service-wallet-port";

function getMissionPoolAddress(): string {
  const { missionPool } = getContractsConfig();
  if (!missionPool.address) {
    throw new Error("MissionPool not configured. Set VITE_MISSION_POOL_ADDRESS");
  }
  return missionPool.address;
}

function getReadContract(): ethers.Contract {
  return getPublicContract(getMissionPoolAddress(), MISSION_POOL_ABI);
}

async function getWriteContract(wallet?: WalletPort): Promise<ethers.Contract> {
  const w = wallet ?? getLegacyWalletPort();
  return await getWriteEthersContract(getMissionPoolAddress(), MISSION_POOL_ABI, w);
}

export async function createSponsoredMission(
  params: { rewardPerWinner: bigint; maxWinners: number },
  wallet?: WalletPort
): Promise<string> {
  const w = wallet ?? getLegacyWalletPort();
  const address = await w.getAddress();

  const total = params.rewardPerWinner * BigInt(params.maxWinners);

  const balance = await getMUSDBalance(address);
  if (balance < total) {
    throw new Error(`Insufficient MUSD balance. Need ${ethers.formatUnits(total, 18)} MUSD`);
  }

  const spender = getMissionPoolAddress();
  const allowance = await getMUSDAllowance(address, spender);
  if (allowance < total) {
    await approveMUSD(spender, ethers.MaxUint256, w);
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
