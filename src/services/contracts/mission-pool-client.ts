import { ethers } from "ethers";
import { getContractsConfig } from "../../config/contracts";
import { web3Service } from "../web3-service";
import { approveMUSD, getMUSDAllowance, getMUSDBalance } from "./musd-client";

const MISSION_POOL_ABI = [
  "function attestor() view returns (address)",
  "function musd() view returns (address)",
  "function lastMissionId() view returns (uint256)",
  "function missions(uint256) view returns (address sponsor, uint256 rewardPerWinner, uint16 maxWinners, uint16 winnersCount, bool active)",
  "function createMission(uint256 rewardPerWinner, uint16 maxWinners) returns (uint256)",
  "function awardWinner(uint256 missionId, address winner)",
  "function setMissionActive(uint256 missionId, bool active)"
];

function getMissionPoolAddress(): string {
  const { missionPool } = getContractsConfig();
  if (!missionPool.address) {
    throw new Error("MissionPool not configured. Set VITE_MISSION_POOL_ADDRESS");
  }
  return missionPool.address;
}

function getPublicProvider(): ethers.Provider {
  const { rpcUrlPublic } = getContractsConfig();
  return new ethers.JsonRpcProvider(rpcUrlPublic);
}

function getReadContract(): ethers.Contract {
  return new ethers.Contract(getMissionPoolAddress(), MISSION_POOL_ABI, getPublicProvider());
}

function getWriteContract(): ethers.Contract {
  const provider = web3Service.getProvider();
  const signer = web3Service.getSigner();
  if (!provider) throw new Error("Wallet not connected");
  const runner = signer ?? provider;
  return new ethers.Contract(getMissionPoolAddress(), MISSION_POOL_ABI, runner);
}

export async function createSponsoredMission(params: { rewardPerWinner: bigint; maxWinners: number }): Promise<string> {
  const address = web3Service.getAddress();
  if (!address) throw new Error("Wallet not connected");

  const total = params.rewardPerWinner * BigInt(params.maxWinners);

  const balance = await getMUSDBalance(address);
  if (balance < total) {
    throw new Error(`Insufficient MUSD balance. Need ${ethers.formatUnits(total, 18)} MUSD`);
  }

  const spender = getMissionPoolAddress();
  const allowance = await getMUSDAllowance(address, spender);
  if (allowance < total) {
    await approveMUSD(spender, ethers.MaxUint256);
  }

  const c = getWriteContract();
  const tx = await c.createMission(params.rewardPerWinner, params.maxWinners);
  const receipt = await tx.wait();
  return receipt?.hash as string;
}

export async function getLatestMissionId(): Promise<number> {
  const c = getReadContract();
  const id: bigint = await c.lastMissionId();
  return Number(id);
}

