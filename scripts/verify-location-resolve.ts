import { AmapLocationProvider } from "../src/platform/location-provider/amap-location-provider";
import { LocationService } from "@/capabilities/destination/location-service";
import { resolveDestinationPlace } from "@/capabilities/destination/resolve-destination-place";

async function main(): Promise<void> {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    process.stderr.write("TLS certificate verification is disabled; enable it before running this check.\n");
    process.exitCode = 1;
    return;
  }
  const expression = process.argv[2]?.trim();
  if (!expression) {
    process.stderr.write("Usage: node --env-file=.env.local --import tsx scripts/verify-location-resolve.ts <destination>\n");
    process.exitCode = 1;
    return;
  }
  const service = new LocationService(new AmapLocationProvider());
  const result = await resolveDestinationPlace(expression, (query) => service.resolveExpression(query));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "provider_error") process.exitCode = 1;
}

void main();
