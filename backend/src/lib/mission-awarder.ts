import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { env } from "./env.js";

const MISSION_POOL_ABI = [
  "function awardWinner(uint256 missionId, address winner)",
];

export async function awardMissionWinner(params: { missionId: number; winner: string }): Promise<string> {
  if (!env.MISSION_POOL_ADDRESS) {
    throw new Error("MISSION_POOL_ADDRESS not configured");
  }

  const provider = new JsonRpcProvider(env.MEZO_RPC_URL);
  const wallet = new Wallet(env.SCORE_SIGNER_PK, provider);
  const c = new Contract(env.MISSION_POOL_ADDRESS, MISSION_POOL_ABI, wallet);

  const tx = await c.awardWinner(params.missionId, params.winner);
  const receipt = await tx.wait();
  return receipt?.hash as string;
}

