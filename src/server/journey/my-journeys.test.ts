import assert from "node:assert/strict";
import test from "node:test";

import type { JourneySummary } from "@/repositories/journey-summary-repository";
import { guestIdCookieName } from "@/server/identity/guest-identity";

import { loadMyJourneys } from "./my-journeys";

const guestId = "25ba5b26-8db0-4fe3-bfcc-b684dd7889cc";
const journey: JourneySummary = {
  id: "3d17d2c7-fd9b-4748-b751-3a76a9a920be",
  name: "富良野滑雪",
  destination: "富良野",
  startDate: null,
  endDate: null,
  status: "idea",
  updatedAt: "2026-09-21T08:00:00.000Z",
};

function cookieReader(value?: string) {
  return {
    get(name: string) {
      return name === guestIdCookieName && value ? { value } : undefined;
    },
  };
}

test("returns an empty list without creating a guest identity", async () => {
  let listWasCalled = false;

  const result = await loadMyJourneys(cookieReader(), {
    async listByOwner() {
      listWasCalled = true;
      return [journey];
    },
  });

  assert.deepEqual(result, []);
  assert.equal(listWasCalled, false);
});

test("lists Journeys using the existing guest identity", async () => {
  let receivedOwnerGuestId = "";

  const result = await loadMyJourneys(cookieReader(guestId), {
    async listByOwner(ownerGuestId) {
      receivedOwnerGuestId = ownerGuestId;
      return [journey];
    },
  });

  assert.equal(receivedOwnerGuestId, guestId);
  assert.deepEqual(result, [journey]);
});
