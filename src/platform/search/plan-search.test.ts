import assert from "node:assert/strict";
import test from "node:test";

import { DiscoverySearchError, type DiscoverySearchResult } from "./discovery-search";
import { createPlanSearch, planSearchProviderFrom, type PlanSearchCall } from "./plan-search";

const result = (title: string): DiscoverySearchResult => ({ source: "s", title, url: `https://example.test/${title}` });
function engines(bochaFails: DiscoverySearchError | null = null) {
  const asked: string[] = [];
  const bocha: PlanSearchCall = async (query) => { asked.push(`bocha:${query}`); if (bochaFails) throw bochaFails; return [result("b")]; };
  const kimi: PlanSearchCall = async (query) => { asked.push(`kimi:${query}`); return [result("k")]; };
  return { asked, bocha, kimi };
}
const signal = () => new AbortController().signal;

test("Generate plan looks with Bocha first and keeps Kimi for the second look (1.2113 step 1)", async () => {
  const { asked, bocha, kimi } = engines();
  const search = createPlanSearch("bocha", bocha, kimi);
  assert.deepEqual(await search.search("丽江 玉龙雪山", signal()), [result("b")]);
  assert.deepEqual(await search.deep("丽江 玉龙雪山 开放时间", signal()), [result("k")]);
  assert.deepEqual(asked, ["bocha:丽江 玉龙雪山", "kimi:丽江 玉龙雪山 开放时间"]);
});

test("a Bocha failure or spent day falls back to Kimi; PLAN_SEARCH_PROVIDER=kimi skips Bocha", async () => {
  const spent = engines(new DiscoverySearchError("daily_limit"));
  assert.deepEqual(await createPlanSearch("bocha", spent.bocha, spent.kimi).search("q", signal()), [result("k")]);
  assert.deepEqual(spent.asked, ["bocha:q", "kimi:q"]);
  const only = engines();
  await createPlanSearch("kimi", only.bocha, only.kimi).search("q", signal());
  assert.deepEqual(only.asked, ["kimi:q"]);
  // A search the caller gave up on is not sent again elsewhere.
  const stopped = new AbortController();
  stopped.abort();
  const timedOut = engines(new DiscoverySearchError("network"));
  await assert.rejects(createPlanSearch("bocha", timedOut.bocha, timedOut.kimi).search("q", stopped.signal));
  assert.deepEqual(timedOut.asked, ["bocha:q"]);
});

test("the provider switch reads kimi or bocha; unset or anything else is Kimi (merlin, 2026-11-19)", () => {
  assert.equal(planSearchProviderFrom(undefined), "kimi");
  assert.equal(planSearchProviderFrom(" Bocha "), "bocha");
  assert.equal(planSearchProviderFrom("google"), "kimi");
});
