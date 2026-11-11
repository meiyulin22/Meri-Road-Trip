import assert from "node:assert/strict";
import test from "node:test";
import { addToDestination, destinationPlaceCount, MAX_TRIP_DESTINATION_CITIES } from "@/domain/trip-state/destination-areas";
import { initializeTripState, type DestinationField, type TripState } from "@/domain/trip-state/trip-state";
import { InMemoryTripStateRepository } from "@/platform/persistence/in-memory/in-memory-trip-state-repository";
import { JourneyService } from "./journey-service";
import { DestinationCityLimitError, TripStateConflictError } from "./journey-errors";

const draft = { name: { state: "missing" }, origin: { state: "missing" },
  destinationEdit: { operation: "none" }, startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" } } as const;
const initial = initializeTripState(draft);

async function fixture(tripState: TripState = initial) {
  const repository = new InMemoryTripStateRepository("trip-a");
  await repository.create(tripState);
  const service = new JourneyService({
    tripService: { getTripById: async () => ({ id: "trip-a", status: "idea",
      createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z" }),
    createTrip: async () => { throw Error("unused"); } },
    createTripStateRepository: () => repository, deleteTripById: async () => true,
  });
  return { service, repository };
}

test("simultaneous destination writes reject the stale writer instead of losing a choice", async () => {
  const { service, repository } = await fixture();
  const results = await Promise.allSettled(["云南省", "广东省"].map((province) =>
    service.updateTripState("trip-a", "owner", { destination: { state: "known", source: "user",
      areas: [{ province, places: [] }] } }, initial.destination)));
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  const rejected = results.find((item) => item.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof TripStateConflictError);
  assert.equal((await repository.findByTripId("trip-a"))?.destination.state, "known");
});

test("ordinary field writes retry and preserve a concurrently saved destination", async () => {
  const { service, repository } = await fixture();
  await Promise.all([
    service.updateTripState("trip-a", "owner", { destination: { state: "known", source: "user",
      areas: [{ province: "云南省", places: [{ name: "迪庆藏族自治州", spots: ["梅里雪山"] }] }] } }, initial.destination),
    service.updateTripState("trip-a", "owner", { duration: { state: "known", source: "user", value: "三天" } }),
  ]);
  const saved = await repository.findByTripId("trip-a");
  assert.deepEqual(saved?.duration, { state: "known", source: "user", value: "三天" });
  assert.deepEqual(saved?.destination.state === "known" && saved.destination.areas[0].places[0].spots, ["梅里雪山"]);
});

function cities(count: number): Extract<DestinationField, { state: "known" }> {
  return {
    state: "known",
    source: "user",
    areas: [{
      province: "云南省",
      places: Array.from({ length: count }, (_, index) => ({ name: "测试市" + (index + 1), spots: [] })),
    }],
  };
}

test("the ten-city limit is enforced on new journeys and destination writes", async () => {
  const full = cities(MAX_TRIP_DESTINATION_CITIES);
  const overLimit = cities(MAX_TRIP_DESTINATION_CITIES + 1);
  const { service, repository } = await fixture({ ...initial, destination: full });

  await assert.rejects(service.createJourney(draft, "owner", undefined, undefined, overLimit), DestinationCityLimitError);
  await assert.rejects(service.updateTripState("trip-a", "owner", { destination: overLimit }), DestinationCityLimitError);
  assert.deepEqual((await repository.findByTripId("trip-a"))?.destination, full);

  const provinceOnly = addToDestination(full.areas, { province: "四川省", place: null, spot: null });
  const areas = addToDestination(provinceOnly, { province: "云南省", place: "测试市1", spot: "测试景点" });
  const saved = await service.updateTripState("trip-a", "owner", { destination: { ...full, areas } });
  assert.ok(saved.destination.state === "known");
  assert.equal(destinationPlaceCount(saved.destination.areas), MAX_TRIP_DESTINATION_CITIES);
  assert.deepEqual(saved.destination.areas[0].places[0].spots, ["测试景点"]);
  assert.deepEqual(saved.destination.areas[1], { province: "四川省", places: [] });
});

test("older journeys above the limit can be read, edited and reduced", async () => {
  const destination = cities(MAX_TRIP_DESTINATION_CITIES + 2);
  const { service } = await fixture({ ...initial, destination });

  const updated = await service.updateTripState("trip-a", "owner", {
    duration: { state: "known", value: "7天", source: "user" },
  });
  assert.deepEqual(updated.destination, destination);
  await assert.rejects(service.updateTripState("trip-a", "owner", {
    destination: cities(MAX_TRIP_DESTINATION_CITIES + 3),
  }), DestinationCityLimitError);
  const reduced = cities(MAX_TRIP_DESTINATION_CITIES + 1);
  assert.deepEqual((await service.updateTripState("trip-a", "owner", { destination: reduced })).destination, reduced);
});
