import { neon } from "@neondatabase/serverless";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateTripState, type TripState, type TripStateField } from "../src/domain/trip-state/trip-state";

export interface LegacyTripStateInput {
  readonly id: string;
  readonly name: string;
  readonly origin: string | null;
  readonly destination: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

function legacyText(value: string | null): TripStateField {
  return value === null
    ? { state: "missing" }
    : { state: "approximate", value, source: "system" };
}

function legacyDate(value: string | null): TripStateField {
  return value === null
    ? { state: "missing" }
    : { state: "known", value, source: "system" };
}

export function stateFromLegacyTrip(trip: LegacyTripStateInput): TripState {
  // Legacy columns retain text and exact dates, but not location certainty or provenance.
  return validateTripState({
    name: { state: "known", value: trip.name, source: "system" },
    origin: legacyText(trip.origin),
    destination: legacyText(trip.destination),
    startDate: legacyDate(trip.startDate),
    endDate: legacyDate(trip.endDate),
    duration: { state: "missing" },
    transportPreference: { state: "missing" },
  });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const sql = neon(databaseUrl);
  const trips = await sql`
    SELECT t.id::text AS id, t.name, t.origin, t.destination,
      t.start_date::text AS "startDate", t.end_date::text AS "endDate"
    FROM trips t
    WHERE NOT EXISTS (SELECT 1 FROM trip_states s WHERE s.trip_id = t.id)
    ORDER BY t.id
  `;

  for (const trip of trips as LegacyTripStateInput[]) {
    const state = stateFromLegacyTrip(trip);
    const inserted = await sql`
      INSERT INTO trip_states (trip_id, state, created_at, updated_at)
      SELECT t.id, ${JSON.stringify(state)}::jsonb, t.created_at, t.created_at
      FROM trips t
      WHERE t.id = ${trip.id}::uuid
        AND NOT EXISTS (SELECT 1 FROM trip_states s WHERE s.trip_id = t.id)
      ON CONFLICT (trip_id) DO NOTHING
      RETURNING trip_id
    `;
    process.stdout.write(`${trip.id}: ${inserted.length === 1 ? "created" : "already present"}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
