import assert from "node:assert/strict";
import test from "node:test";

import { AmapInputTipsProvider } from "./amap-input-tips-provider";

const originalApiKey = process.env.AMAP_API_KEY;

test.afterEach(() => {
  if (originalApiKey === undefined) delete process.env.AMAP_API_KEY;
  else process.env.AMAP_API_KEY = originalApiKey;
});

test("uses InputTips with encoded Chinese and special characters and keeps all valid tips", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  let requestUrl: URL | undefined;
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = new URL(String(input));
    requestInit = init;
    return Response.json({
      status: "1",
      count: "3",
      tips: [
        { id: "poi-1", name: "香格里拉", district: "云南省迪庆藏族自治州", adcode: "533401", address: "建塘镇", location: "99.704,27.829" },
        { id: [], name: " 香格里拉市 ", district: [], adcode: "", address: [], location: [] },
        { id: "busline-1", name: "香格线", location: "" },
      ],
    });
  };

  const result = await new AmapInputTipsProvider(fetcher).suggest("香格 & 山?");

  assert.equal(requestUrl?.origin, "https://restapi.amap.com");
  assert.equal(requestUrl?.pathname, "/v3/assistant/inputtips");
  assert.equal(requestUrl?.searchParams.get("keywords"), "香格 & 山?");
  assert.equal(requestUrl?.searchParams.get("key"), "test-secret-key");
  assert.equal(requestUrl?.searchParams.has("page_size"), false);
  assert.equal(requestInit?.cache, "no-store");
  assert.equal(requestInit?.method, "GET");
  assert.ok(requestInit?.signal);
  assert.deepEqual(result, {
    status: "success",
    suggestions: [
      {
        provider: "amap", providerId: "poi-1", name: "香格里拉",
        region: "云南省迪庆藏族自治州", adcode: "533401", address: "建塘镇",
        coordinates: { longitude: 99.704, latitude: 27.829, coordinateSystem: "GCJ-02" },
      },
      {
        provider: "amap", providerId: null, name: "香格里拉市",
        region: null, adcode: null, address: null, coordinates: null,
      },
      {
        provider: "amap", providerId: "busline-1", name: "香格线",
        region: null, adcode: null, address: null, coordinates: null,
      },
    ],
  });
  assert.equal(JSON.stringify(result).includes("test-secret-key"), false);
});

test("empty successful tips are distinct from malformed claimed results", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  const empty: typeof fetch = async () => Response.json({ status: "1", count: "0", tips: [] });
  const inconsistent: typeof fetch = async () => Response.json({ status: "1", count: "1", tips: [] });
  assert.deepEqual(await new AmapInputTipsProvider(empty).suggest("香格"), {
    status: "success", suggestions: [],
  });
  assert.deepEqual(await new AmapInputTipsProvider(inconsistent).suggest("香格"), {
    status: "failure", reason: "malformed_response",
  });
});

test("skips unusable tips while retaining names with absent or bad coordinates", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  const fetcher: typeof fetch = async () => Response.json({
    status: "1", tips: [
      null, { name: [] }, { name: "" },
      { name: "坏坐标", location: "Infinity,30" },
      { name: "越界", location: "200,30" },
      { name: "缺失" },
    ],
  });
  const result = await new AmapInputTipsProvider(fetcher).suggest("地点");
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.deepEqual(result.suggestions.map(({ name }) => name), ["坏坐标", "越界", "缺失"]);
    assert.ok(result.suggestions.every(({ coordinates }) => coordinates === null));
  }
});

test("nonempty unusable tips and malformed top-level responses fail safely", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  for (const body of [
    { status: "1", tips: [{ name: [] }, { id: "x" }] },
    { status: "1", tips: {} },
    { status: "1" },
    { tips: [] },
    [],
  ]) {
    const fetcher: typeof fetch = async () => Response.json(body);
    assert.deepEqual(await new AmapInputTipsProvider(fetcher).suggest("地点"), {
      status: "failure", reason: "malformed_response",
    });
  }
});

test("Amap status, HTTP, timeout and network failures expose fixed reasons only", async () => {
  process.env.AMAP_API_KEY = "test-secret-key";
  const cases: readonly [typeof fetch, string][] = [
    [async () => Response.json({ status: "0", info: "test-secret-key" }), "upstream_error"],
    [async () => new Response("test-secret-key", { status: 503 }), "upstream_error"],
    [async () => { throw new DOMException("test-secret-key", "TimeoutError"); }, "timeout"],
    [async () => { throw new Error("URL includes test-secret-key"); }, "upstream_error"],
  ];
  for (const [fetcher, reason] of cases) {
    const result = await new AmapInputTipsProvider(fetcher).suggest("地点");
    assert.deepEqual(result, { status: "failure", reason });
    assert.equal(JSON.stringify(result).includes("test-secret-key"), false);
  }
});

test("missing API key fails without calling fetch", async () => {
  delete process.env.AMAP_API_KEY;
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls += 1; throw new Error("unexpected"); };
  assert.deepEqual(await new AmapInputTipsProvider(fetcher).suggest("地点"), {
    status: "failure", reason: "missing_configuration",
  });
  assert.equal(calls, 0);
});
