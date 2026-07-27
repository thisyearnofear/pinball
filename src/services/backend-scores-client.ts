import axios from 'axios';
import { getAppConfig } from '../config/app-config';

const API_BASE = (() => {
  try {
    return getAppConfig().backend.baseUrl;
  } catch (e) {
    // We do not silently fallback; consumers must set NEXT_PUBLIC_BACKEND_URL
    console.warn('Backend URL not configured: backend client disabled');
    return '';
  }
})();

export type ScoreSignatureResponse = {
  signature: string;
  nonce: string; // Nonce is returned as a string from the backend
  // Anti-cheat: whether the backend verified the uploaded replay for this score.
  replayVerified?: boolean;
  // Optional differentiator: Sponsored Mission award result
  missionAwarded?: boolean;
  missionTxHash?: string;
  missionError?: string;
};

export async function requestScoreSignature(params: {
  tournamentId: number;
  address: string;
  score: number;
  name?: string;
  metadata?: string;
  missionId?: number;
}): Promise<ScoreSignatureResponse> {
  if (!API_BASE) throw new Error('Backend URL not configured');
  const { data } = await axios.post(`${API_BASE}/api/scores/sign`, params, {
    headers: { 'Content-Type': 'application/json' },
  });
  return {
    signature: data.signature as string,
    nonce: String(data.nonce),
    replayVerified: data.replayVerified as boolean | undefined,
    missionAwarded: data.missionAwarded as boolean | undefined,
    missionTxHash: data.missionTxHash as string | undefined,
    missionError: data.missionError as string | undefined,
  };
}

/**
 * Ship a full replay recording to the backend for storage.
 * The replay's keccak hash travels inside the signed score metadata,
 * binding this payload to the on-chain submission.
 */
export async function uploadReplay(params: {
  tournamentId: number;
  address: string;
  replay: string;
}): Promise<{ ok: boolean; hash?: string }> {
  if (!API_BASE) throw new Error('Backend URL not configured');
  const { data } = await axios.post(`${API_BASE}/api/replays`, params, {
    headers: { 'Content-Type': 'application/json' },
  });
  return { ok: Boolean(data.ok), hash: data.hash as string | undefined };
}

export type BestReplay = {
  score: number;
  address: string;
  mode: 'classic' | 'kamikaze';
  replay: string; // encoded ReplayDigest JSON
};

const BEST_REPLAY_TTL_MS = 30_000;
const bestReplayCache = new Map<number, { at: number; value: BestReplay | null }>();

/** Fetch the tournament leader's replay for ghost racing. Null when none exists. */
export async function fetchBestReplay(tournamentId: number): Promise<BestReplay | null> {
  if (!API_BASE) return null;
  const cached = bestReplayCache.get(tournamentId);
  if (cached && Date.now() - cached.at < BEST_REPLAY_TTL_MS) return cached.value;
  let value: BestReplay | null = null;
  try {
    const { data } = await axios.get(`${API_BASE}/api/replays/best/${tournamentId}`);
    if (data && typeof data.replay === 'string') {
      value = {
        score: Number(data.score),
        address: String(data.address),
        mode: data.mode === 'kamikaze' ? 'kamikaze' : 'classic',
        replay: data.replay as string,
      };
    }
  } catch {
    return cached?.value ?? null;
  }
  bestReplayCache.set(tournamentId, { at: Date.now(), value });
  return value;
}
