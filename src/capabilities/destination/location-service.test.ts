import { destinationPreferenceId } from "@/domain/trip-message/destination-choice-identity";
import assert from "node:assert/strict";
import test from "node:test";
import {LocationService} from "./location-service";
import type {LocationProvider} from "@/platform/location-provider/location-provider";
import { resolveDestinationPlace } from "./resolve-destination-place";
import { verifyDestinationChoice } from "./verified-destination-choice";
import { applyDestinationEdit } from "./apply-destination-edit";

const city = { providerId: "shangrila-city", name: "香格里拉市", province: "云南省",
 city: "迪庆藏族自治州", district: "香格里拉市", region: "云南省 迪庆藏族自治州 香格里拉市",
 address: null, longitude: 99.74, latitude: 27.84, coordinateSystem: "GCJ-02" as const };
const hotel = { ...city, providerId: "hotel", name: "北京香格里拉饭店", province: "北京市",
 city: "北京市", district: "海淀区" };

test("a hotel-filled bare-name query retries the city name, lands directly, and still reverifies", async () => {
 const queries: string[] = [];
 const service = new LocationService({ async searchByKeyword(query) {
  queries.push(query);
  return { status: "success", candidates: query === "香格里拉" ? [hotel] : [city] };
 } });
 const result = await applyDestinationEdit({ state: "missing" },
  { operation: "add", places: ["香格里拉"], broadRegion: null },
  (expression) => resolveDestinationPlace(expression, (query) => service.resolveExpression(query)), "我还想去香格里拉");
 assert.deepEqual(queries, ["香格里拉", "香格里拉市"]);
 assert.equal(result.choices, null);
 assert.deepEqual(result.added, [{ province: "云南省", place: "迪庆藏族自治州", spot: "香格里拉市" }]);
 const choice = { id: destinationPreferenceId("云南省", "迪庆藏族自治州", "香格里拉市"), name: "迪庆藏族自治州",
  province: "云南省", city: "迪庆藏族自治州", spot: "香格里拉市" };
 assert.deepEqual(await verifyDestinationChoice(choice, service), { status: "verified",
  pick: { province: "云南省", place: "迪庆藏族自治州", spot: "香格里拉市" } });
 assert.equal(queries.at(-1), "香格里拉市");
});

test("administrative retry refuses hotels, roads and a matching name without matching hierarchy", async () => {
 for (const candidate of [hotel, { ...city, name: "香格里拉市人民政府" },
  { ...city, city: "北京市", district: "海淀区" }]) {
  const queries: string[] = [];
  const service = new LocationService({ async searchByKeyword(query) {
   queries.push(query); return { status: "success", candidates: query === "香格里拉" ? [hotel] : [candidate] };
  } });
  assert.deepEqual(await service.resolveExpression("香格里拉"), { status: "unresolved" });
  assert.equal(queries.length, 2);
 }
});

test("already resolved or ambiguous cities do not retry, and retry failure is a provider error", async () => {
 for (const candidates of [[city], [city, { ...city, providerId: "other-city", province: "四川省" }]]) {
  let calls = 0;
  const service = new LocationService({ async searchByKeyword() { calls++; return { status: "success", candidates }; } });
  assert.equal((await service.resolveExpression("香格里拉")).status, candidates.length === 1 ? "resolved" : "ambiguous");
  assert.equal(calls, 1);
 }
 const service = new LocationService({ async searchByKeyword(query) {
  return query === "香格里拉" ? { status: "success", candidates: [hotel] }
   : { status: "failure", reason: "http_error" };
 } });
 assert.deepEqual(await service.resolveExpression("香格里拉"), { status: "provider_error" });
});
test("blank expression does not call the provider",async()=>{
 let calls=0; const service=new LocationService({async searchByKeyword(){calls++;return {status:"success",candidates:[]};}});
 assert.deepEqual(await service.resolveExpression("  "),{status:"not_ready",reason:"destination_missing"}); assert.equal(calls,0);
});
test("search uses the user's expression and empty results stay unresolved",async()=>{
 const queries:string[]=[];const service=new LocationService({async searchByKeyword(q){queries.push(q);return {status:"success",candidates:[]};}});
 assert.deepEqual(await service.resolveExpression("梅里雪山"),{status:"unresolved"});assert.deepEqual(queries,["梅里雪山"]);
});
for(const mode of ["failure","throw"] as const)test("provider "+mode+" becomes a safe error",async()=>{
 const provider:LocationProvider={async searchByKeyword(){if(mode==="throw")throw new Error("secret-key");return {status:"failure",reason:"http_error"};}};
 assert.deepEqual(await new LocationService(provider).resolveExpression("西湖"),{status:"provider_error"});
});
