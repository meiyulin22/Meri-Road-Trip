import assert from "node:assert/strict";
import test from "node:test";

import { addPreference, kindOfSuggestion, listPreferences, removePreference } from "@/components/trip-plan/plan-preferences-model";
import { maxStopsForPreferences, type TripPreference } from "@/domain/plan/trip-preference";
import { TripNotFoundError } from "@/domain/trip/trip-errors";

import { handlePreferenceDelete, handlePreferencesGet, handlePreferencesPost } from "./trip-preferences-handler";

const tripId = "trip-id";
const now = new Date("2026-11-14T09:00:00.000Z");
const saved: TripPreference = {
  id: "p1", tripId, label: "少爬台阶", kind: "walking", quote: "少走台阶", source: "conversation",
  messageId: "m1", status: "active", createdAt: "2026-11-13T09:00:00.000Z",
};
const removed: TripPreference = { ...saved, id: "p2", label: "不吃辣", kind: "diet", quote: "我不吃辣", status: "removed" };

function dependencies(rows: TripPreference[], labelled: string[] = []) {
  return {
    loadJourney: async (id: string, owner: string) => {
      if (owner !== "owner-id") throw new TripNotFoundError(id);
      return {};
    },
    listPreferences: async () => rows,
    create: async (preference: TripPreference) => { rows.push(preference); },
    markRemoved: async (_tripId: string, id: string) => {
      const index = rows.findIndex((row) => row.id === id && row.status === "active");
      if (index < 0) return false;
      rows[index] = { ...rows[index], status: "removed" };
      return true;
    },
    labelPreference: async (text: string) => {
      labelled.push(text);
      return { label: "喜欢自然景观", kind: "interests" as const };
    },
    now: () => now,
    newId: () => "new-id",
  };
}

test("lists, adds and removes preferences through the plan page's client", async () => {
  const rows = [saved, removed];
  const labelled: string[] = [];
  const deps = dependencies(rows, labelled);
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (init?.method === "DELETE") return handlePreferenceDelete(tripId, "owner-id", path.split("/").pop()!, deps);
    if (init?.method === "POST") return handlePreferencesPost(tripId, "owner-id", JSON.parse(String(init.body)), deps);
    return handlePreferencesGet(tripId, "owner-id", deps);
  };

  assert.deepEqual((await listPreferences(tripId, fetcher)).map(({ id }) => id), ["p1"]);

  // A sentence the traveller wrote is labelled by the model; their words stay as the quote.
  const written = await addPreference(tripId, "我想去山川湖海", undefined, fetcher);
  assert.deepEqual(written, { id: "new-id", label: "喜欢自然景观", kind: "interests", quote: "我想去山川湖海",
    source: "plan_page", messageId: null, createdAt: now.toISOString() });
  assert.deepEqual(labelled, ["我想去山川湖海"]);

  // A common choice already knows its kind, and the same words are not saved twice.
  const picked = await addPreference(tripId, "带小孩", kindOfSuggestion("带小孩", ["带小孩", "少走路"]), fetcher);
  assert.deepEqual([picked.label, picked.kind], ["带小孩", "companions"]);
  assert.equal((await addPreference(tripId, " 少走台阶 ", undefined, fetcher)).id, "p1");
  assert.deepEqual(labelled, ["我想去山川湖海"]);

  await removePreference(tripId, "p1", fetcher);
  assert.equal(rows.find(({ id }) => id === "p1")?.status, "removed");
  assert.equal((await handlePreferenceDelete(tripId, "owner-id", "p1", deps)).status, 404);
});

test("only the owner reaches preferences, and a preference needs words", async () => {
  const deps = dependencies([saved]);
  assert.equal((await handlePreferencesGet(tripId, null, deps)).status, 404);
  assert.equal((await handlePreferencesGet(tripId, "someone-else", deps)).status, 404);
  assert.equal((await handlePreferencesPost(tripId, "owner-id", { text: "  " }, deps)).status, 400);
  assert.equal((await handlePreferencesPost(tripId, "owner-id", { text: "好", kind: "unknown" }, deps)).status, 400);
});

test("a walking limit or companions make every day lighter", () => {
  assert.equal(maxStopsForPreferences([{ kind: "walking" }], 4), 3);
  assert.equal(maxStopsForPreferences([{ kind: "companions" }, { kind: "diet" }], 4), 3);
  assert.equal(maxStopsForPreferences([{ kind: "interests" }], 4), 4);
  assert.equal(kindOfSuggestion("自己写的一句", ["带小孩"]), undefined);
});
