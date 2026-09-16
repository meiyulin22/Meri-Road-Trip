import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { defineConfig } from "drizzle-kit";

if (existsSync(".env.local")) {
  loadEnvFile(".env.local");
}

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to use Drizzle Kit.");
  }

  return databaseUrl;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/database/schema",
  out: "./drizzle",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
