import assert from "node:assert/strict";
import test from "node:test";
import {initializeTripState} from "@/domain/trip-state/trip-state";
import {destinationSelectionReply} from "./destination-selection-reply";
import {meriReplies} from "@/capabilities/conversation/meri-replies";
const zh=meriReplies.zh;
const base=initializeTripState({name:{state:"missing"},origin:{state:"missing"},destinationEdit:{operation:"none"},startDate:{state:"missing"},endDate:{state:"missing"},duration:{state:"missing"},transportPreference:{state:"missing"}});
const selected={...base,destination:{state:"known" as const,source:"user" as const,areas:[{province:"广东省",places:[{name:"汕头市",spots:["汕头老城"]}]}]}};
test("selection reply names saved city and spot and invites missing details",()=>{
 const reply=destinationSelectionReply(selected,base,zh);assert.match(reply,/^好，已加入广东省 汕头市（汕头老城）。/);assert.match(reply,/现在已经可以开始生成旅行计划/);assert.match(reply,/继续补充出发地、出发时间、行程天数/);
});
test("known and approximate details are not requested again",()=>{
 const reply=destinationSelectionReply({...selected,origin:{state:"known",value:"上海",source:"user"},startDate:{state:"approximate",value:"十一月左右",source:"user"},duration:{state:"known",value:"三天",source:"user"}},base,zh);
 assert.match(reply,/行程时长也已经记下/);assert.doesNotMatch(reply,/继续补充/);
});
test("a whole province is ready to plan, while a legacy destination is not",()=>{
 const province=destinationSelectionReply({...base,destination:{state:"known",source:"user",areas:[{province:"云南省",places:[]}]}},base,zh);
 assert.match(province,/云南省/);assert.match(province,/可以开始生成/);
 const legacy=destinationSelectionReply({...base,destination:{state:"known",source:"user",areas:[],legacyText:"梅里雪山"}},base,zh);
 assert.match(legacy,/重新搜索确认/);assert.doesNotMatch(legacy,/可以开始生成/);
 assert.throws(()=>destinationSelectionReply(base,base,zh));
});
test("readiness is announced once, on the pick that makes the Journey ready",()=>{
 const more={...selected,destination:{state:"known" as const,source:"user" as const,areas:[{province:"广东省",places:[{name:"汕头市",spots:["汕头老城"]},{name:"潮州市",spots:[]}]}]}};
 const reply=destinationSelectionReply(more,selected,zh);
 assert.equal(reply,"好，已加入广东省 潮州市。");
 assert.equal(destinationSelectionReply(more,more,zh),"这些地点已经在旅程里了。");
});

test("in English the same picks are said in English, with place names as saved",()=>{
 const en=meriReplies.en;
 assert.equal(destinationSelectionReply(selected,base,en),"OK, added 广东省 汕头市（汕头老城）. You can now generate a travel plan. Just tell me to start, or tap Generate plan; if you like, you can also add where you're starting from, when you're leaving, how many days.");
 const legacy=destinationSelectionReply({...base,destination:{state:"known",source:"user",areas:[],legacyText:"梅里雪山"}},base,en);
 assert.equal(legacy,"OK, your destination is now 梅里雪山. The places saved earlier still need to be searched and confirmed again.");
});
