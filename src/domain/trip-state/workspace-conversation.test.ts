import assert from "node:assert/strict";
import type {TripState} from "./trip-state";
import test from "node:test";
import {createTripStatePatchFromInterpretation,salvageWorkspaceConversationInterpretation,validateWorkspaceConversationInterpretation as validate,InvalidWorkspaceConversationInterpretationError as Invalid} from "./workspace-conversation";
const base={presentationIntent:"none",changes:[],destinationEdit:{operation:"none"},reply:"好的。"};
const state:TripState={name:{state:"known",value:"假期旅行",source:"system"},origin:{state:"missing"},destination:{state:"missing"},startDate:{state:"missing"},endDate:{state:"missing"},duration:{state:"known",value:"5天",source:"user"},transportPreference:{state:"missing"}};
test("destination expressions produce an edit and never a direct state patch",()=>{
 const result=validate({...base,destinationEdit:{operation:"add",places:["梅里雪山"],broadRegion:null}});
 assert.deepEqual(result.destinationEdit,{operation:"add",places:["梅里雪山"],broadRegion:null});
 assert.equal(createTripStatePatchFromInterpretation(result,state),null);
 assert.throws(()=>validate({...base,changes:[{field:"destination",state:"known",value:"四川"}]}),Invalid);
});
test("ordinary changes receive user authority and preserve approximate wording",()=>{
 const result=validate({...base,changes:[{field:"origin",state:"known",value:"大连"},{field:"startDate",state:"approximate",value:"十一月底左右"}]});
 assert.deepEqual(createTripStatePatchFromInterpretation(result,state),{origin:{state:"known",value:"大连",source:"user"},startDate:{state:"approximate",value:"十一月底左右",source:"user"}});
});
test("strict output rejects invented metadata, duplicate fields and unsupported values",()=>{
 for(const bad of [ {...base,intent:"question"}, {...base,reply:" "}, {...base,presentationIntent:"arbitrary_ui"}, {...base,changes:[{field:"origin",state:"known",value:"上海",source:"system"}]}, {...base,changes:[{field:"origin",state:"known",value:"上海"},{field:"origin",state:"known",value:"北京"}]}, {...base,changes:[{field:"transportPreference",state:"known",value:"teleport"}]}, {...base,destinationEdit:{operation:"add",places:["梅里雪山"],broadRegion:null,providerId:"invented"}} ])assert.throws(()=>validate(bad),Invalid);
});
test("normal conversation has no patch and destination removal keeps an explicit operation",()=>{
 assert.equal(createTripStatePatchFromInterpretation(validate(base),state),null);
 assert.deepEqual(validate({...base,destinationEdit:{operation:"remove",places:["潮州"]}}).destinationEdit,{operation:"remove",places:["潮州"]});
});
test("a change that would leave a field as it already is never reaches the patch",()=>{
 const result=validate({...base,changes:[{field:"name",state:"known",value:"假期旅行"},{field:"origin",state:"missing",value:null},{field:"duration",state:"known",value:"5天"},{field:"startDate",state:"missing",value:null}]});
 assert.equal(createTripStatePatchFromInterpretation(result,state),null);
 const mixed=validate({...base,changes:[{field:"name",state:"known",value:"假期旅行"},{field:"duration",state:"known",value:"7天"}]});
 assert.deepEqual(createTripStatePatchFromInterpretation(mixed,state),{duration:{state:"known",value:"7天",source:"user"}});
 const cleared=validate({...base,changes:[{field:"duration",state:"missing",value:null}]});
 assert.deepEqual(createTripStatePatchFromInterpretation(cleared,state),{duration:{state:"missing"}});
});
test("transport can be cleared, and clearing it when it is already missing changes nothing",()=>{
 const cleared=validate({...base,changes:[{field:"transportPreference",state:"missing",value:null}]});
 assert.equal(createTripStatePatchFromInterpretation(cleared,state),null);
 const withTransport:TripState={...state,transportPreference:{state:"known",value:"self_drive",source:"user"}};
 assert.deepEqual(createTripStatePatchFromInterpretation(cleared,withTransport),{transportPreference:{state:"missing"}});
 assert.throws(()=>validate({...base,changes:[{field:"transportPreference",state:"approximate",value:"self_drive"}]}),Invalid);
});
test("salvage names every dropped part and keeps everything usable",()=>{
 const {interpretation,dropped}=salvageWorkspaceConversationInterpretation({...base,extra:1,changes:[{field:"origin",state:"known",value:"上海"},{field:"origin",state:"known",value:"北京"},{field:"startDate",state:"sometime",value:"x"}],destinationEdit:"bad"});
 assert.deepEqual(interpretation.changes,[{field:"origin",state:"known",value:"上海"}]);
 assert.deepEqual(interpretation.destinationEdit,{operation:"none"});
 assert.equal(dropped.length,4);
 assert.throws(()=>salvageWorkspaceConversationInterpretation({...base,reply:""}),Invalid);
 assert.throws(()=>salvageWorkspaceConversationInterpretation("text"),Invalid);
});
