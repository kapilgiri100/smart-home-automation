import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
dotenv.config();

// Support Render's DATABASE_URL connection string (e.g., postgres://user:pass@host:5432/dbname)
const connectionUrl = process.env.DATABASE_URL;

const sslConfig = process.env.SQL_SSL === "true" ? { rejectUnauthorized: false } : false;

const config = connectionUrl
  ? {
      schema: "./db/schema.js",
      out: "./drizzle",
      dialect: "postgresql",
      schemaFilter: ["public"],
      dbCredentials: {
        url: connectionUrl,
        ssl: sslConfig
      },
      verbose: true
    }
  : (() => {
      const sqlHost = process.env.SQL_HOST;
      const sqlDbName = process.env.SQL_DB_NAME;
      const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
      const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;
      if (!sqlHost) {
        throw new Error("SQL_HOST must be set in environment variables.");
      }
      if (!sqlDbName) {
        throw new Error("SQL_DB_NAME must be set in environment variables.");
      }
      if (!user) {
        throw new Error("SQL_ADMIN_USER or SQL_USER must be set in environment variables.");
      }
      if (!password) {
        throw new Error("SQL_ADMIN_PASSWORD or SQL_PASSWORD must be set in environment variables.");
      }
      return {
        schema: "./db/schema.js",
        out: "./drizzle",
        dialect: "postgresql",
        schemaFilter: ["public"],
        dbCredentials: {
          host: sqlHost,
          user: user,
          password: password,
          database: sqlDbName,
          ssl: sslConfig
        },
        verbose: true
      };
    })();

export default defineConfig(config);
