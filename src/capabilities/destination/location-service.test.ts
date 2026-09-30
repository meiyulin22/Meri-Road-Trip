import assert from "node:assert/strict";
import test from "node:test";
import {LocationService} from "./location-service";
import type {LocationProvider} from "@/platform/location-provider/location-provider";
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
