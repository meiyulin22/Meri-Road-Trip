import assert from "node:assert/strict";
import test from "node:test";
import { Chat } from "@ai-sdk/react";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

import type { TripState } from "@/domain/trip-state/trip-state";

import {
  reconcileCommittedUserId,
  WorkspaceChatTransport,
  type CommittedWorkspaceTurn,
} from "./workspace-chat-transport";

const tripState: TripState = {
  name: { state: "known", value: "滑雪", source: "system" },
  origin: { state: "missing" },
  destination: { state: "known", value: "富良野", source: "user" },
  startDate: { state: "missing" },
  endDate: { state: "missing" },
  duration: { state: "missing" },
  transportPreference: { state: "missing" },
};

const user: UIMessage = {
  id: "optimistic-1",
  role: "user",
  parts: [{ type: "text", text: "改成富良野" }],
};

const responseBody = {
  interpretation: {
    intent: "trip_state_update",
    changes: [{ field: "destination", state: "known", value: "富良野" }],
    reply: "好的，目的地改成富良野。",
  },
  tripState,
  messages: [
    { id: "persisted-user", tripId: "trip-1", role: "user", content: "改成富良野", createdAt: "2026-09-23T00:00:00.000Z" },
    { id: "persisted-assistant", tripId: "trip-1", role: "assistant", content: "好的，目的地改成富良野。", createdAt: "2026-09-23T00:00:00.001Z" },
  ],
};

function sendOptions(messages: UIMessage[] = [user]): Parameters<ChatTransport<UIMessage>["sendMessages"]>[0] {
  return {
    trigger: "submit-message",
    chatId: "trip-1",
    messageId: undefined,
    messages,
    abortSignal: new AbortController().signal,
  };
}

async function readChunks(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const reader = stream.getReader();
  const chunks: UIMessageChunk[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

test("calls the existing JSON contract and exposes only a committed assistant turn", async () => {
  let requestedBody: unknown;
  let requestedSignal: AbortSignal | null | undefined;
  const commits: CommittedWorkspaceTurn[] = [];
  const transport = new WorkspaceChatTransport("trip-1", (turn) => {
    commits.push(turn);
  }, async (input, init) => {
    assert.equal(input, "/api/trip-workspace/messages");
    requestedBody = JSON.parse(init?.body as string);
    requestedSignal = init?.signal;
    return Response.json(responseBody);
  });
  const options = sendOptions();
  const chunks = await readChunks(await transport.sendMessages(options));

  assert.deepEqual(requestedBody, { message: "改成富良野", tripId: "trip-1" });
  assert.strictEqual(requestedSignal, options.abortSignal);
  assert.equal(commits[0].temporaryUserId, "optimistic-1");
  assert.deepEqual(commits[0].tripState, tripState);
  assert.equal(commits[0].persistedUser.id, "persisted-user");
  assert.deepEqual(chunks, [
    { type: "start", messageId: "persisted-assistant" },
    { type: "text-start", id: "persisted-assistant" },
    { type: "text-delta", id: "persisted-assistant", delta: "好的，目的地改成富良野。" },
    { type: "text-end", id: "persisted-assistant" },
    { type: "finish" },
  ]);
  assert.deepEqual(reconcileCommittedUserId([user], user.id, commits[0].persistedUser), [{
    id: "persisted-user",
    role: "user",
    parts: [{ type: "text", text: "改成富良野" }],
  }]);
});

test("does not expose an assistant before the server response finishes", async () => {
  let finishRequest: ((response: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => { finishRequest = resolve; });
  let committed = false;
  const transport = new WorkspaceChatTransport("trip-1", () => { committed = true; }, () => pending);
  let resolved = false;
  const streamPromise = transport.sendMessages(sendOptions()).then((stream) => {
    resolved = true;
    return stream;
  });

  await Promise.resolve();
  assert.equal(committed, false);
  assert.equal(resolved, false);
  finishRequest!(Response.json(responseBody));
  await streamPromise;
  assert.equal(committed, true);
});

test("a failed request creates no assistant response and is never retried automatically", async () => {
  let calls = 0;
  let committed = false;
  const transport = new WorkspaceChatTransport("trip-1", () => { committed = true; }, async () => {
    calls += 1;
    return Response.json({ error: "failed" }, { status: 502 });
  });

  await assert.rejects(transport.sendMessages(sendOptions()));
  assert.equal(calls, 1);
  assert.equal(committed, false);
});

test("rejects a mismatched persisted turn before reporting a commit", async () => {
  let committed = false;
  const transport = new WorkspaceChatTransport("trip-1", () => { committed = true; }, async () =>
    Response.json({
      ...responseBody,
      messages: [responseBody.messages[0], { ...responseBody.messages[1], content: "different" }],
    }),
  );

  await assert.rejects(transport.sendMessages(sendOptions()));
  assert.equal(committed, false);
});

test("rejects regeneration rather than replaying the mutation", async () => {
  let calls = 0;
  const transport = new WorkspaceChatTransport("trip-1", () => {}, async () => {
    calls += 1;
    return Response.json(responseBody);
  });
  await assert.rejects(transport.sendMessages({ ...sendOptions(), trigger: "regenerate-message" }));
  assert.equal(calls, 0);
});

test("AI SDK Chat finishes with the authoritative persisted IDs and one assistant", async () => {
  const chat = new Chat<UIMessage>({
    id: "trip-1",
    transport: new WorkspaceChatTransport("trip-1", (turn) => {
      chat.messages = reconcileCommittedUserId(
        chat.messages,
        turn.temporaryUserId,
        turn.persistedUser,
      );
    }, async () => Response.json(responseBody)),
  });

  await chat.sendMessage({ text: "改成富良野" });

  assert.equal(chat.status, "ready");
  assert.deepEqual(chat.messages.map((message) => message.id), [
    "persisted-user",
    "persisted-assistant",
  ]);
  assert.equal(chat.messages[1].role, "assistant");
  assert.equal(chat.messages[1].parts[0].type, "text");
  if (chat.messages[1].parts[0].type === "text") {
    assert.equal(chat.messages[1].parts[0].text, "好的，目的地改成富良野。");
    assert.equal(chat.messages[1].parts[0].state, "done");
  }
});

test("AI SDK Chat keeps an unconfirmed user message without fabricating an assistant", async () => {
  let calls = 0;
  const chat = new Chat({
    id: "trip-1",
    transport: new WorkspaceChatTransport("trip-1", () => {
      assert.fail("A failed request must not report a committed turn.");
    }, async () => {
      calls += 1;
      throw new Error("connection lost");
    }),
  });

  await chat.sendMessage({ text: "改成富良野" });

  assert.equal(chat.status, "error");
  assert.equal(chat.messages.length, 1);
  assert.equal(chat.messages[0].role, "user");
  assert.equal(calls, 1);
});
