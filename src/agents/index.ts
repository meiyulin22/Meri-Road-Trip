import { Mastra } from "@mastra/core";
import { InMemoryStore, MastraCompositeStore } from "@mastra/core/storage";
import { WorkflowsPG } from "@mastra/pg";

import { findPlaceImage } from "@/capabilities/destination/place-images";
import { createMoonshotChatModelFromEnvironment } from "@/platform/llm/moonshot-chat-model";
import { createPlacePhotoProvider } from "@/platform/map-providers";
import { createPlanSearchFromEnvironment, type PlanSearch } from "@/platform/search/plan-search";
import { createTiandituClient } from "@/platform/tianditu/tianditu-fetch";
import { TiandituLocationProvider } from "@/platform/tianditu/tianditu-location-provider";
import { driveLegKey, sharedDriveLegMemory } from "@/platform/tianditu/drive-leg-memory";
import { sharedSpotLocationMemory } from "@/platform/tianditu/spot-location-memory";
import { createTiandituDrive } from "@/platform/tianditu/tianditu-drive";
import { sharedCityPointMemory } from "@/platform/tianditu/city-point-memory";
import { createTiandituCityPoint } from "@/platform/tianditu/tianditu-city-point";
import { create12306Rail, type TrainSearch } from "@/platform/rail/rail-12306";
import { sharedRailBudget } from "@/platform/rail/rail-budget";
import { railEnabled, railTools } from "@/platform/rail/rail-mcp";
import { createOpenMeteoForecast } from "@/platform/weather/open-meteo";
import { createRollingGoHotels, hotelEnabled, rollinggoTools, sharedHotelBudget, type RollingGoHotels } from "@/platform/hotel/rollinggo";
import type { WeatherForecast } from "@/platform/weather/weather-forecast";
import { createVariflightHubs, createVariflightSearch, flightEnabled, type FlightSearch, sharedFlightBudget, variflightTools } from "@/platform/flight/variflight";

import { researchCity } from "./planner/research-agent";
import { verifySpots } from "./planner/verify-spots";
import { scoutAgent } from "./scout-agent";
import { createPlanGenerationWorkflow, type PlanGenerationDependencies } from "./workflows/plan-generation";

// Mastra reports feature usage to its makers' PostHog unless this is set. Meri sends
// nothing anywhere it was not asked to, so it is off unless someone turns it on.
process.env.MASTRA_TELEMETRY_DISABLED ??= "1";

let map: TiandituLocationProvider | null = null;
let drive: ReturnType<typeof createTiandituDrive> | null = null;
let weather: WeatherForecast | null = null;
let hotels: RollingGoHotels | null = null;
let cityPoint: ReturnType<typeof createTiandituCityPoint> | null = null;
let rail: ReturnType<typeof create12306Rail> | null = null;
let flights: ReturnType<typeof createVariflightSearch> | null = null;
let flightHubs: ReturnType<typeof createVariflightHubs> | null = null;
let planSearch: PlanSearch | null = null;
let photos: ReturnType<typeof createPlacePhotoProvider> | null = null;

/**
 * Generate plan's real providers, each built on first use so importing needs no keys.
 * The verify script passes its own research and its own place to save versions.
 */
export function planGenerationDependencies(
  overrides: Partial<PlanGenerationDependencies> = {},
): PlanGenerationDependencies {
  return {
    // Bocha first, Kimi when Bocha fails or its day is spent; Kimi again when the agent wants a second look (1.2113 step 1).
    researchCity: (task, handoff, onProgress) => researchCity(task, handoff, {
      search: (query, signal) => (planSearch ??= createPlanSearchFromEnvironment()).search(query, signal),
      deepSearch: (query, signal) => (planSearch ??= createPlanSearchFromEnvironment()).deep(query, signal),
      model: createMoonshotChatModelFromEnvironment,
    }, onProgress),
    planModel: { model: createMoonshotChatModelFromEnvironment },
    verifySpots: (cards, options, onProgress) => verifySpots(cards, options, {
      search: (query, signal) => (planSearch ??= createPlanSearchFromEnvironment()).search(query, signal),
      deepSearch: (query, signal) => (planSearch ??= createPlanSearchFromEnvironment()).deep(query, signal),
      model: createMoonshotChatModelFromEnvironment,
    }, onProgress),
    map: {
      // One lookup a spot; the first failure stops the check, rate limits included, with no retry.
      search: (name, areas) => {
        map ??= new TiandituLocationProvider(createTiandituClient(fetch, { retryRateLimit: false }));
        return map.searchByKeyword(name, areas);
      },
      memory: sharedSpotLocationMemory,
    },
    drive: {
      // One lookup a leg; the first failure stops the rest, rate limits included, with no retry.
      drive: (from, to, mode) => (drive ??= createTiandituDrive(createTiandituClient(fetch, { retryRateLimit: false })))(from, to, mode),
      memory: sharedDriveLegMemory,
      key: driveLegKey,
    },
    transfers: {
      // A centre a place and a drive a leg; the first failure stops the rest, with no retry.
      cityPoint: (name) => (cityPoint ??= createTiandituCityPoint(createTiandituClient(fetch, { retryRateLimit: false })))(name),
      cityMemory: sharedCityPointMemory,
      drive: {
        drive: (from, to, mode) => (drive ??= createTiandituDrive(createTiandituClient(fetch, { retryRateLimit: false })))(from, to, mode),
        memory: sharedDriveLegMemory,
        key: driveLegKey,
      },
    },
    // Open-Meteo: free, no key; one request a city, capped by OPEN_METEO_MAX_CALLS_PER_DAY (1.2117).
    weather: (points, range) => (weather ??= createOpenMeteoForecast())(points, range),
    // RollingGo only when HOTEL_PROVIDER=rollinggo and a key are set; query only, never booking (1.2117 stays).
    ...(hotelEnabled() ? {
      hotels: {
        search: (search) => (hotels ??= createRollingGoHotels({ enabled: hotelEnabled, tools: rollinggoTools, budget: sharedHotelBudget })).search(search),
        detail: (hotelId) => (hotels ??= createRollingGoHotels({ enabled: hotelEnabled, tools: rollinggoTools, budget: sharedHotelBudget })).detail(hotelId),
      },
    } : {}),
    // A search switched off is left out, so the transport agent is not run for it and the card says so (1.2113 step 1).
    transport: {
      // 12306 only when RAIL_PROVIDER=12306; its server starts on the first search, not on import.
      ...(railEnabled() ? {
        searchTrains: (search: TrainSearch) => (rail ??= create12306Rail({ enabled: railEnabled, tools: railTools, budget: sharedRailBudget, now: () => new Date() }))(search),
      } : {}),
      // VariFlight only when FLIGHT_PROVIDER=variflight and a key are set; each fare search costs ¥0.25.
      ...(flightEnabled() ? {
        searchFlights: (search: FlightSearch) => (flights ??= createVariflightSearch({
          enabled: flightEnabled, tools: variflightTools, budget: sharedFlightBudget, now: () => new Date(),
        }))(search),
        // VariFlight's own change cities (¥0.25), only when the agent's hub for a change of plane did not join (1.2113).
        flightHubs: (search: FlightSearch) => (flightHubs ??= createVariflightHubs({
          enabled: flightEnabled, tools: variflightTools, budget: sharedFlightBudget, now: () => new Date(),
        }))(search),
      } : {}),
      model: createMoonshotChatModelFromEnvironment,
    },
    // The local catalog and photos already downloaded: no remote photo service is asked.
    findImage: (subject) => findPlaceImage(subject, photos ??= createPlacePhotoProvider()),
    saveVersion: async (version) => {
      const { planRunRepository } = await import("@/capabilities/planning/plan-run-repository-instance");
      return planRunRepository.createVersion(version);
    },
    now: () => new Date(),
    ...overrides,
  };
}

const planGeneration = createPlanGenerationWorkflow(planGenerationDependencies());

/**
 * Where Mastra keeps its state. Only workflow snapshots go to Postgres, in a `mastra`
 * schema beside Meri's tables: one table, mastra_workflow_snapshot, that @mastra/pg creates
 * and maintains itself on first use (not a Drizzle migration). A run waiting for an answer
 * therefore survives a restart. Every other Mastra domain stays in memory, unused. Without
 * DATABASE_URL (a script, a test) everything stays in memory.
 */
function mastraStorage() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return new InMemoryStore();
  return new MastraCompositeStore({
    id: "meri-storage",
    default: new InMemoryStore(),
    domains: { workflows: new WorkflowsPG({ connectionString, schemaName: "mastra" }) },
  });
}

/**
 * Every agent and workflow Meri runs, registered once. Meri keeps its own run records and
 * events in its tables; a run that was working when the server stopped is marked
 * interrupted, while one waiting for an answer resumes from its snapshot.
 */
export const mastra = new Mastra({
  agents: { scout: scoutAgent },
  workflows: { planGeneration },
  storage: mastraStorage(),
});
