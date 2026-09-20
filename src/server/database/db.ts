import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to create the database client.");
  }

  return databaseUrl;
}

const client = neon(getDatabaseUrl());

export const db = drizzle(client, { schema });
