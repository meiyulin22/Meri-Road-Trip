import assert from "node:assert/strict";
import test from "node:test";

import { WikimediaClient } from "./wikimedia-client";

function page(pageid: number, title: string) {
  return { pageid, title, imageinfo: [{ thumburl: `https://thumb.wikimedia.org/${pageid}/500px.jpg`,
    descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`, width: 4000, height: 3000, mime: "image/jpeg",
    extmetadata: { Artist: { value: "<b>A&amp;B</b>" }, LicenseShortName: { value: "CC BY 4.0" },
      LicenseUrl: { value: "http://creativecommons.org/licenses/by/4.0" } } }] };
}

test("files are filed back under the names they were asked by, Commons' own spelling notwithstanding", async () => {
  const asked: URL[] = [];
  const agents: string[] = [];
  const client = new WikimediaClient({ fetcher: (async (input: string | URL, init?: RequestInit) => {
    asked.push(new URL(input.toString()));
    agents.push(new Headers(init?.headers).get("User-Agent") ?? "");
    return Response.json({ query: {
      normalized: [{ from: "File:zhenjiang_Jinshan.jpg", to: "File:Zhenjiang Jinshan.jpg" }],
      pages: [page(7, "File:Zhenjiang Jinshan.jpg"), page(8, "File:B.jpg"), { title: "File:Missing.jpg", missing: true }],
    } });
  }) as typeof fetch });
  const answer = await client.files(["zhenjiang_Jinshan.jpg", "B.jpg", "Missing.jpg"]);
  assert.equal(answer.ok, true);
  if (!answer.ok) return;
  assert.deepEqual([...answer.files.keys()].sort(), ["B.jpg", "zhenjiang_Jinshan.jpg"]);
  const file = answer.files.get("zhenjiang_Jinshan.jpg");
  assert.equal(file?.pageId, 7);
  assert.equal(file?.artist, "A&B");
  assert.equal(file?.licenseUrl, "https://creativecommons.org/licenses/by/4.0");
  assert.equal(asked.length, 1);
  assert.equal(asked[0].searchParams.get("titles"), "File:zhenjiang_Jinshan.jpg|File:B.jpg|File:Missing.jpg");
  assert.match(agents[0], /^MeriRoadTrip\//u);
  assert.deepEqual(await client.file("Missing.jpg"), { ok: true, file: null });
  await assert.rejects(client.files(Array.from({ length: 51 }, (_, index) => `${index}.jpg`)));
});
