import { AmapLocationProvider } from "../src/infrastructure/location/amap-location-provider";
import { LocationService } from "../src/server/location/location-service";
import type { TripState } from "../src/domain/trip-state/trip-state";

async function main(): Promise<void> {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    process.stderr.write("TLS certificate verification is disabled; enable it before running this check.\n");
    process.exitCode = 1;
    return;
  }

  const destination = process.argv[2]?.trim();
  if (!destination) {
    process.stderr.write("Usage: node --env-file=.env.local --import tsx scripts/verify-location-resolve.ts <destination>\n");
    process.exitCode = 1;
    return;
  }

  const tripState: TripState = {
    name: { state: "known", value: "Location Resolve check", source: "user" },
    origin: { state: "missing" },
    destination: { state: "known", value: destination, source: "user" },
    startDate: { state: "missing" },
    endDate: { state: "missing" },
    duration: { state: "missing" },
    transportPreference: { state: "missing" },
  };
  const result = await new LocationService(new AmapLocationProvider()).resolve(tripState);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "provider_error") process.exitCode = 1;
}

void main();
