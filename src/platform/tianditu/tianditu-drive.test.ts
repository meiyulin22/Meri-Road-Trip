import assert from "node:assert/strict";
import test from "node:test";

import { DriveLegMemory, driveLegKey } from "./drive-leg-memory";
import { createTiandituDrive, parseDriveXml, thinPath } from "./tianditu-drive";
import type { TiandituClient } from "./tianditu-fetch";

// Shaped as Tianditu answered 崇圣寺三塔 → 大理古城 on 2026-11-16 (shortened).
const answer = `<?xml version="1.0" encoding="UTF-8" ?><result orig='100.146,25.719' mid='' dest='100.161,25.694'>`
  + `<routes count='2'><item id='0'><strguide>向东南行驶</strguide></item></routes>`
  + `<distance>4.76</distance><duration>448.0</duration>`
  + `<routelatlon>100.146,25.719;100.14559,25.71887;100.16095,25.69397;100.161,25.694;</routelatlon></result>`;

test("distance, duration and the road come from the drive service's XML", () => {
  assert.deepEqual(parseDriveXml(answer), {
    distanceKm: 4.76,
    durationSeconds: 448,
    path: [[100.146, 25.719], [100.14559, 25.71887], [100.16095, 25.69397], [100.161, 25.694]],
    // The first and last steps, from the point asked to the road and back: short, so the road reaches both.
    offRoadStartMeters: 44,
    offRoadEndMeters: 6,
  });
  assert.equal(parseDriveXml(answer.replace("<duration>448.0</duration>", "")), null);
  assert.equal(parseDriveXml(answer.replace("100.14559,25.71887", "100.14559,north")), null);
  assert.equal(parseDriveXml("<result><distance>1</distance><duration>2</duration><routelatlon>100,25;</routelatlon></result>"), null);
  // As Tianditu answered on foot from 双廊 to 南诏风情岛: no way, said with zeros (1.2103).
  assert.equal(parseDriveXml("<result><distance>0.0</distance><duration>0.0</duration><routelatlon>100.192,25.917;100.1823,25.9094;</routelatlon></result>"), null);
});

test("a long last step is the stretch the road does not reach, measured before thinning", () => {
  const road = Array.from({ length: 400 }, (_, index) => `${(100.1 + index * 0.0001).toFixed(4)},25.7`).join(";");
  const xml = `<result><distance>3</distance><duration>300</duration><routelatlon>${road};100.14,25.694;</routelatlon></result>`;
  const route = parseDriveXml(xml);
  assert.equal(route?.path.length, 200);
  // From the road's end (100.1399, 25.7) out to the island point: about 670 m.
  assert.ok(route && route.offRoadEndMeters > 600 && route.offRoadEndMeters < 720);
});

test("a long road is thinned to a fixed number of points, keeping both ends", () => {
  const points = Array.from({ length: 1_000 }, (_, index) => index);
  const thin = thinPath(points, 200);
  assert.equal(thin.length, 200);
  assert.equal(thin[0], 0);
  assert.equal(thin.at(-1), 999);
  assert.deepEqual(thinPath([1, 2, 3], 200), [1, 2, 3]);
});

test("one fastest-route request with six-decimal points, and a failure carries only a reason", async () => {
  const sent: Record<string, string>[] = [];
  const client = (xml: string | null): TiandituClient => ({
    get: async () => ({ ok: false, reason: "http_error" }),
    getXml: async (_path, params) => {
      sent.push({ ...params });
      return xml === null ? { ok: false, reason: "refused" } : { ok: true, xml };
    },
  });
  const from = { longitude: 100.146, latitude: 25.719 };
  const to = { longitude: 100.161, latitude: 25.694 };
  const found = await createTiandituDrive(client(answer))(from, to, "drive");
  assert.equal(found.status === "success" && found.route.durationSeconds, 448);
  assert.deepEqual(JSON.parse(sent[0].postStr), { orig: "100.146000,25.719000", dest: "100.161000,25.694000", style: "0" });
  await createTiandituDrive(client(answer))(from, to, "walk");
  assert.equal(JSON.parse(sent[1].postStr).style, "3");
  assert.deepEqual(await createTiandituDrive(client(null))(from, to, "drive"), { status: "failure", reason: "refused" });
  assert.deepEqual(await createTiandituDrive(client("<result></result>"))(from, to, "drive"), { status: "failure", reason: "no_route" });
});

test("a planned leg is remembered for a month under its two rounded points", () => {
  let now = 0;
  const memory = new DriveLegMemory(null, () => now);
  const key = driveLegKey({ longitude: 100.1460001, latitude: 25.719 }, { longitude: 100.161, latitude: 25.694 }, "drive");
  assert.equal(key, "drive:100.14600,25.71900>100.16100,25.69400");
  const route = { distanceKm: 4.76, durationSeconds: 448, path: [[100.146, 25.719], [100.161, 25.694]] as [number, number][],
    offRoadStartMeters: 0, offRoadEndMeters: 0 };
  memory.set(key, route);
  assert.deepEqual(memory.get(key), route);
  now = 31 * 24 * 60 * 60 * 1_000;
  assert.equal(memory.get(key), null);
});
