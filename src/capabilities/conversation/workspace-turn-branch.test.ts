import assert from "node:assert/strict";
import test from "node:test";
import {resolveWorkspaceTurn} from "./workspace-turn-branch";
import type {DestinationEditResult} from "@/capabilities/destination/apply-destination-edit";
const result:DestinationEditResult={destination:{state:"missing"},changed:false,choices:null,unresolved:[],lookupFailed:[],notInDestination:[],ambiguousRemovals:[]};
const input={interpretation:{presentationIntent:"none" as const,changes:[],destinationEdit:{operation:"none" as const},reply:"原回复"},recommendationReply:null,destinationResult:result};
test("recommendations and verified choice offers have their own reply",()=>{
 assert.deepEqual(resolveWorkspaceTurn({...input,recommendationReply:"推荐回复"}),{branch:"destination_recommendations",reply:"推荐回复"});
 const choices={answering:"潮汕",presentation:{type:"destination_choices" as const,mode:"add" as const,choices:[{id:"a",name:"潮州市",province:"广东省",city:"潮州市"}]}};
 assert.equal(resolveWorkspaceTurn({...input,destinationResult:{...result,choices}}).branch,"destination_choices");
});
test("ordinary conversation and successful removal use model reply",()=>{
 assert.deepEqual(resolveWorkspaceTurn(input),{branch:"conversation",reply:"原回复"});
 assert.deepEqual(resolveWorkspaceTurn({...input,destinationResult:{...result,changed:true}}),{branch:"journey_update",reply:"原回复"});
});
test("failed and ambiguous edits cannot claim a successful update",()=>{
 for(const key of ["unresolved","lookupFailed","notInDestination","ambiguousRemovals"] as const){
 const turn=resolveWorkspaceTurn({...input,destinationResult:{...result,[key]:["潮州"]}});
 assert.equal(turn.branch,"conversation");assert.notEqual(turn.reply,"原回复");
 }
});
