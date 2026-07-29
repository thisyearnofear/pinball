import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8080),
  SCORE_SIGNER_PK: z.string().startsWith('0x').min(10),
  // Optional: only used for sanity checks / ops visibility.
  SCORE_SIGNER_ADDR: z.string().startsWith('0x').length(42).optional(),
  ALLOWED_ORIGINS: z.string().default('*'),
  RATE_LIMIT: z.coerce.number().default(120),
  // Bearer token for /admin/* endpoints. When unset, admin endpoints return 404.
  ADMIN_TOKEN: z.string().min(16).optional(),
  // Must match the chain where the TournamentManager is deployed.
  CHAIN_ID: z.coerce.number().int().positive(),
  // Signature protocol prefix (must match the contract).
  SCORE_PREFIX: z.string().default('PINBALL_SCORE:v2'),
  // RPC used by the backend when it needs to broadcast transactions (e.g. Sponsored Missions payouts).
  MEZO_RPC_URL: z.string().default('https://rpc.test.mezo.org'),

  // TournamentManager address (used by the finalize script).
  TOURNAMENT_MANAGER_ADDRESS: z.string().startsWith('0x').length(42).optional(),

  // Optional differentiator: Sponsored Missions contract address (MissionPool)
  MISSION_POOL_ADDRESS: z.string().startsWith('0x').length(42).optional(),
  // Optional: minimum score required to trigger a mission award (hackathon-simple rule).
  MISSION_SCORE_THRESHOLD: z.coerce.number().int().nonnegative().default(250000),
  // When true, mission threshold is inverted (kamikaze: award when score <= threshold).
  MISSION_INVERTED: z.coerce.boolean().default(false),
  // Optional: require multiball flag in metadata to award mission (enables "Jackpot Multiball").
  MISSION_REQUIRE_MULTIBALL: z.coerce.boolean().default(false),
  // Replay verification: strict = reject failing submissions, warn = log only, off = skip.
  REPLAY_VERIFICATION: z.enum(['strict', 'warn', 'off']).default('warn'),
  // Optional Redis URL. When set, rate limiter and nonce tracker use Redis.
  // Falls back to in-memory stores when unset (fine for local dev).
  REDIS_URL: z.string().optional(),
  // NIM payment config (Nimiq Mini Apps Competition bonus points)
  NIM_TREASURY_ADDRESS: z.string().optional(),
  NIM_ENTRY_FEE_LUNA: z.coerce.number().int().nonnegative().default(100000),
  NIMIQ_RPC_URL: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
