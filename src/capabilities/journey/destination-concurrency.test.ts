import assert from "node:assert/strict";
import test from "node:test";
import { initializeTripState } from "@/domain/trip-state/trip-state";
import { InMemoryTripStateRepository } from "@/platform/persistence/in-memory/in-memory-trip-state-repository";
import { JourneyService } from "./journey-service";
import { TripStateConflictError } from "./journey-errors";

const initial = initializeTripState({ name: { state: "missing" }, origin: { state: "missing" },
  destinationEdit: { operation: "none" }, startDate: { state: "missing" }, endDate: { state: "missing" },
  duration: { state: "missing" }, transportPreference: { state: "missing" } });

async function fixture() {
  const repository = new InMemoryTripStateRepository("trip-a");
  await repository.create(initial);
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
