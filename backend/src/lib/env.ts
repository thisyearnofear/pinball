import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8080),
  SCORE_SIGNER_PK: z.string().startsWith('0x').min(10),
  SCORE_SIGNER_ADDR: z.string().startsWith('0x').length(42),
  ALLOWED_ORIGINS: z.string().default('*'),
  RATE_LIMIT: z.coerce.number().default(120),
});

export const env = EnvSchema.parse(process.env);
