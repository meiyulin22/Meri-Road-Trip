import assert from "node:assert/strict";
import test from "node:test";

import { AmapLocationProvider } from "./amap-location-provider";

const originalApiKey = process.env.AMAP_API_KEY;

test.afterEach(() => {
  if (originalApiKey === undefined) delete process.env.AMAP_API_KEY;
  else process.env.AMAP_API_KEY = originalApiKey;
});

test("maps Amap POIs into Meri candidates and encodes the keyword", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  let requestUrl: URL | undefined;
  const fetcher: typeof fetch = async (input) => {
    requestUrl = new URL(String(input));
    return Response.json({
      status: "1",
      pois: [{
        id: "B0123",
        name: "西湖风景名胜区",
        pname: "浙江省",
        cityname: "杭州市",
        adname: "西湖区",
        address: "龙井路1号",
        location: "120.148629,30.242113",
      }],
    });
  };

  const result = await new AmapLocationProvider(fetcher).searchByKeyword("西湖 & 阿尔山");

  assert.equal(requestUrl?.origin, "https://restapi.amap.com");
  assert.equal(requestUrl?.pathname, "/v5/place/text");
  assert.equal(requestUrl?.searchParams.get("keywords"), "西湖 & 阿尔山");
  assert.equal(requestUrl?.searchParams.get("page_size"), "5");
  assert.equal(requestUrl?.searchParams.get("show_fields"), null);
  assert.equal(requestUrl?.searchParams.get("key"), "test-secret-key");
  assert.deepEqual(result, {
    status: "success",
    candidates: [{
      providerId: "B0123",
      name: "西湖风景名胜区",
      region: "浙江省 杭州市 西湖区",
      address: "龙井路1号",
      longitude: 120.148629,
      latitude: 30.242113,
      coordinateSystem: "GCJ-02",
    }],
  });
  assert.equal(JSON.stringify(result).includes("test-secret-key"), false);
});

test("an empty successful search returns no candidates", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  const fetcher: typeof fetch = async () => Response.json({ status: "1", pois: [] });

  assert.deepEqual(await new AmapLocationProvider(fetcher).searchByKeyword("不存在"), {
    status: "success",
    candidates: [],
  });
});

test("photo-enabled Text Search parses optional photo objects without changing location candidates", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  let requestUrl: URL | undefined;
  const fetcher: typeof fetch = async (input) => {
    requestUrl = new URL(String(input));
    return Response.json({ status: "1", pois: [
      { id: "a", name: "大理市", pname: "云南省", location: "100.30,25.68",
        photos: [{ title: "风景", url: "https://example.com/photo.jpg" }, { title: "bad" }] },
      { id: "b", name: "安吉县", location: "119.68,30.63" },
    ] });
  };
  const result = await new AmapLocationProvider(fetcher).searchByKeyword("大理", true);
  assert.equal(requestUrl?.pathname, "/v5/place/text");
  assert.equal(requestUrl?.searchParams.get("show_fields"), "photos");
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.deepEqual(result.candidates.map((candidate) => candidate.providerId), ["a", "b"]);
    assert.deepEqual(result.photosByProviderId?.get("a"), [{ title: "风景", url: "https://example.com/photo.jpg" }]);
    assert.deepEqual(result.photosByProviderId?.get("b"), []);
  }
});

test("invalid coordinates are discarded while valid candidates remain", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  const fetcher: typeof fetch = async () => Response.json({
    status: "1",
    pois: [
      { id: "bad-1", name: "坏坐标", location: "Infinity,30" },
      { id: "bad-2", name: "越界", location: "200,30" },
      { id: "bad-3", name: "缺失", location: "" },
      { id: "good", name: "阿尔山", location: "119.94,47.18" },
    ],
  });

  const result = await new AmapLocationProvider(fetcher).searchByKeyword("阿尔山");
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.deepEqual(result.candidates.map((candidate) => candidate.providerId), ["good"]);
  }
});

test("a non-empty response with no valid coordinates is not a genuine empty search", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  const fetcher: typeof fetch = async () => Response.json({
    status: "1",
    pois: [{ id: "bad", name: "坏坐标", location: "NaN,30" }],
  });

  assert.deepEqual(await new AmapLocationProvider(fetcher).searchByKeyword("阿尔山"), {
    status: "failure",
    reason: "invalid_candidates",
  });
});

test("API and transport failures have safe fixed reasons", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  const apiFailure: typeof fetch = async () => Response.json({
    status: "0",
    info: "test-secret-key should not be surfaced",
    pois: [],
  });
  const transportFailure: typeof fetch = async () => {
    throw new Error("request URL contained test-secret-key");
  };

  for (const fetcher of [apiFailure, transportFailure]) {
    const result = await new AmapLocationProvider(fetcher).searchByKeyword("西湖");
    assert.equal(result.status, "failure");
    assert.equal(JSON.stringify(result).includes("test-secret-key"), false);
  }
});

test("missing API key fails before a network request", async () => {
  delete process.env.AMAP_API_KEY;
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    throw new Error("unexpected call");
  };

  assert.deepEqual(await new AmapLocationProvider(fetcher).searchByKeyword("西湖"), {
    status: "failure",
    reason: "missing_configuration",
  });
  assert.equal(calls, 0);
});
