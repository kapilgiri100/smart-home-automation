import * as dotenv from "dotenv";

// Load .env FIRST - before any schema or pool imports
// This ensures process.env is populated before we read connection vars
dotenv.config();

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

const sslConfig = process.env.SQL_SSL === "true"
  ? { rejectUnauthorized: false }
  : false;

// Support Render's DATABASE_URL connection string (e.g., postgres://user:pass@host:5432/dbname)
// Append ?sslmode=require to silence the pg SSL warning and ensure secure connections
let connectionString = process.env.DATABASE_URL;
if (connectionString && process.env.SQL_SSL === "true") {
  const separator = connectionString.includes("?") ? "&" : "?";
  connectionString = `${connectionString}${separator}sslmode=require`;
}

const pool = connectionString
  ? new Pool({
      connectionString,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 1000,
      max: 10,
      keepAlive: true
    })
  : new Pool({
      host: process.env.SQL_HOST || "localhost",
      user: process.env.SQL_USER || "postgres",
      password: String(process.env.SQL_PASSWORD || ""),
      database: process.env.SQL_DB_NAME || "smart-home-automation",
      port: parseInt(process.env.SQL_PORT || "5432"),
      ssl: sslConfig,
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
    const isConnError = errorMsg.includes("terminated unexpectedly") || errorMsg.includes("Connection") || errorMsg.includes("timeout") || errorMsg.includes("failed to connect") || errorMsg.includes("Client has encountered a connection error") || errorMsg.includes("ECONNREFUSED") || errorMsg.includes("connect") || errorMsg.includes("getaddrinfo");
    if (isConnError && retries > 0) {
      console.warn(`[DB Connection Warning] Query failed with connection issue. Retrying in ${delay}ms... (${retries} retries left). Error:`, errorMsg);
      await new Promise(resolve => setTimeout(resolve, delay));
      return runWithRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

/**
 * Auto-creates all database tables based on the Drizzle ORM schema.
 * This is essential for Render deployments where the PostgreSQL database
 * starts empty and npm run db:push cannot run at build time.
 * 
 * The SQL uses IF NOT EXISTS so it's safe to call on every startup.
 */
export async function createTables() {
  console.log("[DB MIGRATE]: Auto-creating database tables (if not exist)...");
  
  const statements = [
    // 1. Users table
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      uid TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      is_authorized BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    // 2. Appliances table
    `CREATE TABLE IF NOT EXISTS appliances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    // 3. Sensors table
    `CREATE TABLE IF NOT EXISTS sensors (
      id INTEGER PRIMARY KEY DEFAULT 1,
      fire_status BOOLEAN NOT NULL DEFAULT false,
      gas_status BOOLEAN NOT NULL DEFAULT false,
      fire_pump_status BOOLEAN NOT NULL DEFAULT false,
      fire_sensor_available BOOLEAN NOT NULL DEFAULT true,
      gas_sensor_available BOOLEAN NOT NULL DEFAULT true,
      sonic_sensor_available BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    // 4. Water tank table
    `CREATE TABLE IF NOT EXISTS water_tank (
      id INTEGER PRIMARY KEY DEFAULT 1,
      percentage INTEGER NOT NULL DEFAULT 0,
      pump_status BOOLEAN NOT NULL DEFAULT false,
      tank_height INTEGER NOT NULL DEFAULT 100,
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    // 5. Activity logs table
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      event TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    // 6. Schedules table
    `CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      appliance_id TEXT NOT NULL,
      action TEXT NOT NULL,
      time TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_executed TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    // Add last_executed to schedules tables created before this column existed
    `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS last_executed TIMESTAMP`,
  ];

  for (const stmt of statements) {
    try {
      await runWithRetry(() => pool.query(stmt));
      console.log(`[DB MIGRATE]: Table created/verified successfully.`);
    } catch (error) {
      console.error(`[DB MIGRATE]: Error creating table:`, error?.message);
      throw error;
    }
  }
  
  console.log("[DB MIGRATE]: All database tables verified/created successfully!");
}

