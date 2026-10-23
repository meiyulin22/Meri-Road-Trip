import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const databaseModule = fileURLToPath(new URL("./db.ts", import.meta.url));

function inspectDriver(databaseUrl: string | undefined) {
  const environment = { ...process.env };
  delete environment.DATABASE_URL;
  if (databaseUrl !== undefined) environment.DATABASE_URL = databaseUrl;

  // Isolate the module's environment-dependent initialization. Inspecting the
  // lazy client never opens a connection, so these checks need no database.
  return spawnSync(process.execPath, ["--import", "tsx", "--eval", `
    const { Pool } = require("pg");
    const { db } = require(${JSON.stringify(databaseModule)});
    console.log(db.$client instanceof Pool ? "postgres" : "neon");
  `], { env: environment, encoding: "utf8", timeout: 15_000, windowsHide: true });
}

for (const hostname of ["localhost", "127.0.0.1", "LOCALHOST"]) {
  test(`uses node-postgres for ${hostname} without connecting during import`, () => {
    const result = inspectDriver(`postgresql://meri:meri@${hostname}:5433/meri`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "postgres");
  });
}

for (const hostname of ["example.neon.tech", "localhost.example.com"]) {
  test(`keeps Neon HTTP for ${hostname}`, () => {
    const result = inspectDriver(`postgresql://meri:meri@${hostname}/meri`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "neon");
  });
}

for (const databaseUrl of [undefined, "   "]) {
  test(`rejects a ${databaseUrl === undefined ? "missing" : "blank"} DATABASE_URL`, () => {
    const result = inspectDriver(databaseUrl);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /DATABASE_URL is required to create the database client\./u);
  });
}
