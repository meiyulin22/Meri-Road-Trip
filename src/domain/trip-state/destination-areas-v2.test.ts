import assert from "node:assert/strict";
import test from "node:test";

import { addToDestination, destinationContains, findInDestination, removeFromDestination } from "./destination-areas";

test("a city groups multiple spots and deleting it keeps its province", () => {
  const city = { province: "云南省", place: "迪庆藏族自治州", spot: "梅里雪山" };
  const another = { ...city, spot: "松赞林寺" };
  const areas = addToDestination(addToDestination([], city), another);
  assert.equal(areas.length, 1);
  assert.deepEqual(areas[0].places[0].spots, ["梅里雪山", "松赞林寺"]);
  assert.equal(addToDestination(areas, city)[0].places[0].spots.length, 2);
  const removed = removeFromDestination(areas, { ...city, spot: null });
  assert.deepEqual(removed, [{ province: "云南省", places: [] }]);
  assert.equal(destinationContains(removed, city), false);
});

test("removing a spot keeps the city", () => {
  const pick = { province: "云南省", place: "迪庆藏族自治州", spot: "梅里雪山" };
  assert.deepEqual(removeFromDestination(addToDestination([], pick), pick), [
    { province: "云南省", places: [{ name: "迪庆藏族自治州", spots: [] }] },
  ]);
});

test("ambiguous prefixes cannot silently delete one saved place", () => {
  const areas = [
    { province: "广东省", places: [{ name: "潮州市", spots: [] }, { name: "潮州新区", spots: [] }] },
  ];
  assert.equal(findInDestination(areas, "潮州"), null);
  assert.deepEqual(findInDestination(areas, "潮州市"), { province: "广东省", place: "潮州市", spot: null });
});
