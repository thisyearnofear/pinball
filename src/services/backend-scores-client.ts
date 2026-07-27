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
