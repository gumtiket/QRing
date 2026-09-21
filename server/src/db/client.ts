import fs from "fs";
import { Pool, PoolConfig } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const caPath = process.env.DATABASE_SSL_CA;

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
};

if (caPath) {
  poolConfig.ssl = {
    ca: fs.readFileSync(caPath, "utf8"),
    rejectUnauthorized: true,
  };
}

export const pool = new Pool(poolConfig);

export const db = drizzle(pool, { schema });
