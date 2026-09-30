
import assert from "node:assert/strict";
import test from "node:test";
import {handleDestinationRecommendationSelectionPost as select} from "@/app/api/trips/[id]/destination-recommendation-selection/route";
import {initializeTripState,applyTripStatePatch} from "@/domain/trip-state/trip-state";
import type {TripMessage} from "@/domain/trip-message/trip-message";
import {TripNotFoundError} from "@/domain/trip/trip-errors";
const tripId="trip-a";
const initial=initializeTripState({name:{state:"missing"},origin:{state:"missing"},destinationEdit:{operation:"none"},startDate:{state:"missing"},endDate:{state:"missing"},duration:{state:"missing"},transportPreference:{state:"missing"}});
const offer:TripMessage={id:"offer",tripId,role:"assistant",content:"选择",createdAt:"2026-09-29T00:00:00Z",presentation:{type:"destination_choices",mode:"add",choices:[{id:"a",name:"潮州市",province:"广东省",city:"潮州市"},{id:"b",name:"梅里雪山",province:"云南省",city:"迪庆藏族自治州",spot:"梅里雪山"}]}};
function fixture(){let state=initial;let writes=0;const messages=[offer];const dependencies:Parameters<typeof select>[3]={
 loadJourney:async()=>({tripState:state}),listMessages:async()=>messages,
 updateTripState:async(_id,_owner,patch)=>{writes++;state=applyTripStatePatch(state,patch);return state;},
 verifyChoice:async c=>({status:"verified",pick:{province:c.province,place:c.city??null,spot:c.spot??null}}),
 persistFollowUp:async input=>{const found=messages.find(m=>m.id===input.messageId);if(found)return found;const m:TripMessage={id:input.messageId,tripId,role:"assistant",content:input.content,createdAt:"2026-09-29T00:00:01Z"};messages.push(m);return m;},
};return {dependencies,getState:()=>state,getWrites:()=>writes,messages};}
const body={messageId:offer.id,destinationIds:["a","b"]};
test("only persisted offered identities can update a Journey",async()=>{
 const f=fixture();for(const invalid of [{...body,name:"伪造"},{...body,destinationIds:["unknown"]},{...body,destinationIds:["a","a"]},{...body,destinationIds:[]},{...body,destinationIds:[""]},{...body,messageId:"missing"}])assert.notEqual((await select(tripId,"owner",invalid,f.dependencies)).status,200);
 assert.equal(f.getWrites(),0);
});
test("missing and wrong owners cannot select",async()=>{
 const f=fixture();assert.equal((await select(tripId,null,body,f.dependencies)).status,404);
 assert.equal((await select(tripId,"wrong",body,{...f.dependencies,loadJourney:async()=>{throw new TripNotFoundError(tripId);}})).status,404);assert.equal(f.getWrites(),0);
});
test("batch selection saves city and attraction preference and retries in either order",async()=>{
 const f=fixture();const first=await select(tripId,"owner",body,f.dependencies);assert.equal(first.status,200);const saved=await first.json();
 assert.deepEqual(saved.tripState.destination.areas,[{province:"广东省",places:[{name:"潮州市",spots:[]}]},{province:"云南省",places:[{name:"迪庆藏族自治州",spots:["梅里雪山"]}]}]);
 const retry=await select(tripId,"owner",{...body,destinationIds:["b","a"]},f.dependencies);assert.equal(retry.status,200);assert.deepEqual((await retry.json()).assistantMessage,saved.assistantMessage);assert.equal(f.getWrites(),1);
});
test("verification failure prevents the whole batch from being saved",async()=>{
 const f=fixture();const response=await select(tripId,"owner",body,{...f.dependencies,verifyChoice:async()=>({status:"provider_error"})});assert.equal(response.status,409);assert.equal(f.getWrites(),0);
});
test("write failure has no follow-up; follow-up failure reports saved state",async()=>{
 const f=fixture();const failed=await select(tripId,"owner",body,{...f.dependencies,updateTripState:async()=>{throw new Error("write");}});assert.equal(failed.status,500);assert.equal(f.messages.length,1);
 const partial=await select(tripId,"owner",body,{...f.dependencies,persistFollowUp:async()=>{throw new Error("reply");}});assert.equal(partial.status,500);const data=await partial.json();assert.equal(data.code,"follow_up_unavailable");assert.deepEqual(data.tripState,f.getState());
});
test("legacy recommendations still require successful provider verification",async()=>{
 const f=fixture();f.messages[0]={...offer,presentation:{type:"destination_recommendations",destinations:[{id:"a",name:"潮州市",province:"广东省"}]}};
 let verified=false;const response=await select(tripId,"owner",{messageId:offer.id,destinationIds:["a"]},{...f.dependencies,verifyChoice:async()=>{verified=true;return {status:"verified",pick:{province:"广东省",place:"潮州市",spot:null}};}});assert.equal(response.status,200);assert.equal(verified,true);
});
test("a replacement retry succeeds even when choice IDs arrive in another order", async () => {
 const f=fixture();f.messages[0]={...offer,presentation:{...offer.presentation as Extract<TripMessage["presentation"],{type:"destination_choices"}>,mode:"replace",baseDestination:JSON.stringify(initial.destination)}};
 assert.equal((await select(tripId,"owner",body,f.dependencies)).status,200);
 assert.equal((await select(tripId,"owner",{...body,destinationIds:["b","a"]},f.dependencies)).status,200);
 assert.equal(f.getWrites(),1);
});
