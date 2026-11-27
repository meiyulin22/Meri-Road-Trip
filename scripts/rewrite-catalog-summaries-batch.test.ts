import assert from "node:assert/strict";
import test from "node:test";

import { needsVoiceRewrite, parseVoiceAnswers, voiceBatches, voiceUserMessage } from "./rewrite-catalog-summaries-batch";

const entry = (id: string, summary = "镇远攻略列在古城街的住宿候选。") => ({
  id,
  kind: "stay" as const,
  name: id,
  summary,
  location: { province: "贵州省", prefecture: "黔东南苗族侗族自治州", county: null },
});

test("only summaries that name the guide are rewritten", () => {
  assert.equal(needsVoiceRewrite({ summary: "攻略收录的镇远餐馆。" }), true);
  assert.equal(needsVoiceRewrite({ summary: "镇远古城里的住处。" }), false);
});

test("batches are numbered from 1 and the last one may be short", () => {
  const batches = voiceBatches([entry("a"), entry("b"), entry("c")], 2);
  assert.deepEqual(batches.map((batch) => batch.map(({ n, entry: { id } }) => `${n}${id}`)), [["1a", "2b"], ["1c"]]);
  assert.throws(() => voiceBatches([], 0), /positive integer/);
});

test("the message gives each entry's number, kind, name, city and summary", () => {
  assert.equal(voiceUserMessage([{ n: 1, entry: entry("古城街") }]), "1. [住宿] 古城街（黔东南苗族侗族自治州）：镇远攻略列在古城街的住宿候选。");
});

test("answers are kept by number; unknown, repeated or malformed answers are dropped", () => {
  const items = voiceBatches([entry("a"), entry("b"), entry("c")], 30)[0];
  const content = JSON.stringify({ items: [
    { n: 1, summary: " 镇远古城街一带可以住。 ", places: ["镇远", " 古城街 ", ""] },
    { n: 2, summary: "x", places: [] },
    { n: 2, summary: "y", places: [] },
    { n: 9, summary: "z", places: [] },
  ] });
  const answers = parseVoiceAnswers(content, items);
  assert.deepEqual([...answers.keys()], [1]);
  assert.deepEqual(answers.get(1), { summary: "镇远古城街一带可以住。", places: ["镇远", "古城街"] });
  assert.equal(parseVoiceAnswers("not json", items).size, 0);
  assert.equal(parseVoiceAnswers(JSON.stringify({ rows: [] }), items).size, 0);
  assert.equal(parseVoiceAnswers(null, items).size, 0);
});
