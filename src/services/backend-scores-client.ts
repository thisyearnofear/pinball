import axios from 'axios';

const API_BASE = (import.meta as any).env.VITE_BACKEND_URL as string;
if (!API_BASE) {
  // We do not silently fallback; consumers must set VITE_BACKEND_URL
  console.warn('VITE_BACKEND_URL not set: backend client disabled');
}

export type ScoreSignatureResponse = {
  signature: string;
  nonce: number;
};

export async function requestScoreSignature(params: {
  tournamentId: number;
  address: string;
  score: number;
  name?: string;
  metadata?: string;
}): Promise<ScoreSignatureResponse> {
  if (!API_BASE) throw new Error('Backend URL not configured');
  const { data } = await axios.post(`${API_BASE}/api/scores/sign`, params, {
    headers: { 'Content-Type': 'application/json' },
  });
  return {
    signature: data.signature as string,
    nonce: data.nonce as number,
  };
}
