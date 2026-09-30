import assert from "node:assert/strict";
import test from "node:test";
import {createTripStatePatchFromInterpretation,validateWorkspaceConversationInterpretation as validate,InvalidWorkspaceConversationInterpretationError as Invalid} from "./workspace-conversation";
const base={presentationIntent:"none",changes:[],destinationEdit:{operation:"none"},reply:"好的。"};
test("destination expressions produce an edit and never a direct state patch",()=>{
 const result=validate({...base,destinationEdit:{operation:"add",places:["梅里雪山"],broadRegion:null}});
 assert.deepEqual(result.destinationEdit,{operation:"add",places:["梅里雪山"],broadRegion:null});
 assert.equal(createTripStatePatchFromInterpretation(result),null);
 assert.throws(()=>validate({...base,changes:[{field:"destination",state:"known",value:"四川"}]}),Invalid);
});
test("ordinary changes receive user authority and preserve approximate wording",()=>{
 const result=validate({...base,changes:[{field:"origin",state:"known",value:"大连"},{field:"startDate",state:"approximate",value:"十一月底左右"}]});
 assert.deepEqual(createTripStatePatchFromInterpretation(result),{origin:{state:"known",value:"大连",source:"user"},startDate:{state:"approximate",value:"十一月底左右",source:"user"}});
});
test("strict output rejects invented metadata, duplicate fields and unsupported values",()=>{
 for(const bad of [ {...base,intent:"question"}, {...base,reply:" "}, {...base,presentationIntent:"arbitrary_ui"}, {...base,changes:[{field:"origin",state:"known",value:"上海",source:"system"}]}, {...base,changes:[{field:"origin",state:"known",value:"上海"},{field:"origin",state:"known",value:"北京"}]}, {...base,changes:[{field:"transportPreference",state:"known",value:"teleport"}]}, {...base,destinationEdit:{operation:"add",places:["梅里雪山"],broadRegion:null,providerId:"invented"}} ])assert.throws(()=>validate(bad),Invalid);
});
test("normal conversation has no patch and destination removal keeps an explicit operation",()=>{
 assert.equal(createTripStatePatchFromInterpretation(validate(base)),null);
 assert.deepEqual(validate({...base,destinationEdit:{operation:"remove",places:["潮州"]}}).destinationEdit,{operation:"remove",places:["潮州"]});
});
