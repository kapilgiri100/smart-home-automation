import * as dotenv from "dotenv";

// Load .env FIRST - before any schema or pool imports
// This ensures process.env is populated before we read connection vars
dotenv.config();

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.SQL_HOST || "localhost",
  user: process.env.SQL_USER || "postgres",
  password: String(process.env.SQL_PASSWORD || ""),
  database: process.env.SQL_DB_NAME || "smart-home-automation",
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 1000,
  max: 10,
  keepAlive: true
});

pool.on("error", err => {
  console.error("Unexpected error on idle SQL pool client:", err);
});

export const db = drizzle(pool, { schema });

/**
 * Executes a database operation with retries. This is extremely useful for
 * handling wake-up delays (scale-to-zero) and other transient disconnections.
 */
export async function runWithRetry(fn, retries = 3, delay = 2000) {
  try {
    return await fn();
  } catch (error) {
    const errorMsg = error?.message || String(error);
    const isConnError = errorMsg.includes("terminated unexpectedly") || errorMsg.includes("Connection") || errorMsg.includes("timeout") || errorMsg.includes("failed to connect") || errorMsg.includes("Client has encountered a connection error");
    if (isConnError && retries > 0) {
      console.warn(`[DB Connection Warning] Query failed with connection issue. Retrying in ${delay}ms... (${retries} retries left). Error:`, errorMsg);
      await new Promise(resolve => setTimeout(resolve, delay));
      return runWithRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

