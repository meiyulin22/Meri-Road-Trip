import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to create the database client.");
  }

  return databaseUrl;
}

function createNeonDatabase(databaseUrl: string) {
  return drizzleNeon(neon(databaseUrl), { schema });
}

function createDatabase(): ReturnType<typeof createNeonDatabase> {
  const databaseUrl = getDatabaseUrl();
  const hostname = new URL(databaseUrl).hostname.toLowerCase();

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
    });
    // Both drivers use the same schema and PostgreSQL query builders. Repositories
    // only use select/insert/update/delete (including returning), never Neon-only
    // batch/auth methods or $client. Keep their existing db type at this boundary;
    // the drivers' client and session types differ, not those repository operations.
    return drizzlePostgres(pool, { schema }) as unknown as ReturnType<typeof createNeonDatabase>;
  }

  return createNeonDatabase(databaseUrl);
}

export const db = createDatabase();
