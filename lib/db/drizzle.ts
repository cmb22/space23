import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();
const url = process.env.POSTGRES_URL
if (!url) throw new Error("No DB url");

const u = new URL(url);
console.log("DB:", {
  vercelEnv: process.env.VERCEL_ENV,
  host: u.hostname,
  port: u.port,
  db: u.pathname,
});
// if (!process.env.POSTGRES_URL) {
//   throw new Error('POSTGRES_URL environment variable is not set');
// }

export const client = postgres(url);
export const db = drizzle(client, { schema });
