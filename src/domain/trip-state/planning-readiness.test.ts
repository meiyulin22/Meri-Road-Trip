import assert from "node:assert/strict";
import test from "node:test";
import { evaluateGeneratePlanReadiness } from "./planning-readiness";
import { initializeTripState, type DestinationField } from "./trip-state";
const state = initializeTripState({ name: {state:"missing"}, origin: {state:"missing"}, destinationEdit: {operation:"none"}, startDate:{state:"missing"}, endDate:{state:"missing"}, duration:{state:"missing"}, transportPreference:{state:"missing"} });
for (const [destination, result] of [
 [{state:"missing"}, {canProceed:false, reason:"destination_missing"}],
 [{state:"known", source:"user", areas:[{province:"云南省", places:[]}]}, {canProceed:false, reason:"destination_area_only"}],
 [{state:"known", source:"user", areas:[], legacyText:"梅里雪山"}, {canProceed:false, reason:"destination_unverified"}],
 [{state:"known", source:"user", areas:[{province:"云南省", places:[{name:"迪庆藏族自治州",spots:["梅里雪山"]}]}]}, {canProceed:true, destination:"selected"}],
] as const) test("readiness derives from saved destination: " + JSON.stringify(result), () => {
 const input = {...state, destination: destination as DestinationField};
 const before=structuredClone(input);
 assert.deepEqual(evaluateGeneratePlanReadiness(input),result);
 assert.deepEqual(input,before);
});
