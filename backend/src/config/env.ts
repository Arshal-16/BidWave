import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgresql://bidwave:bidwave@localhost:5432/bidwave'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  JWT_ACCESS_SECRET: z.string().min(16).default('bidwave_development_jwt_access_secret_key_32bytes_long'),
  JWT_REFRESH_SECRET: z.string().min(16).default('bidwave_development_jwt_refresh_secret_key_32bytes_long'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRY_DAYS: z.coerce.number().default(7),
  
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:3000,http://localhost:4000'),
  
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('auctions@bidwave.com'),
  
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('bidwave-images'),
  
  DEFAULT_ANTI_SNIPE_WINDOW_SECONDS: z.coerce.number().default(30),
  DEFAULT_ANTI_SNIPE_EXTENSION_SECONDS: z.coerce.number().default(60),
});

export const env = envSchema.parse(process.env);
