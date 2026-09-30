import assert from "node:assert/strict";
import test from "node:test";

import { applyDestinationEdit } from "./apply-destination-edit";
import { verifyDestinationChoice } from "./verified-destination-choice";

const meriCandidate = { providerId: "amap-meri", name: "梅里雪山", province: "云南省",
  city: "迪庆藏族自治州", district: "德钦县", region: "云南省迪庆藏族自治州德钦县",
  address: "德钦县", longitude: 98.67, latitude: 28.43, coordinateSystem: "GCJ-02" as const };

test("a verified spot becomes an offer and does not mutate destination until selection", async () => {
  const current = { state: "missing" } as const;
  const result = await applyDestinationEdit(current, { operation: "set", places: ["梅里雪山"], broadRegion: null },
    async () => ({ status: "resolved", pick: { id: "amap-meri", province: "云南省",
      place: "迪庆藏族自治州", spot: "梅里雪山" } }));
  assert.equal(result.destination, current);
  assert.equal(result.changed, false);
  assert.equal(result.choices?.presentation.choices[0].name, "梅里雪山");
  assert.equal(result.choices?.presentation.choices[0].city, "迪庆藏族自治州");
  assert.equal(result.choices?.presentation.mode, "replace");
});

test("selection rechecks provider identity and preserves the named spot", async () => {
  const verified = await verifyDestinationChoice({ id: "amap-meri", name: "梅里雪山", province: "云南省",
    city: "迪庆藏族自治州", spot: "梅里雪山" }, {
    search: async () => ({ status: "success", candidates: [meriCandidate] }),
  });
  assert.deepEqual(verified, { status: "verified",
    pick: { province: "云南省", place: "迪庆藏族自治州", spot: "梅里雪山" } });
  const stale = await verifyDestinationChoice({ id: "other", name: "梅里雪山", province: "四川省",
    city: "迪庆藏族自治州", spot: "梅里雪山" }, {
    search: async () => ({ status: "success", candidates: [meriCandidate] }),
  });
  assert.equal(stale.status, "unresolved");
});
