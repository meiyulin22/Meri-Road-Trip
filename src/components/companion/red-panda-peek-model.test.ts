import assert from "node:assert/strict";
import test from "node:test";

import timeline from "../../../public/companion/red-panda/peek-timeline.json";
import type { SegmentPlayerState } from "./oil-motion-frame-animator";
import { settledPeekState } from "./red-panda-peek-model";

const state: SegmentPlayerState = { currentState: 0, currentStateId: "neutral", targetState: 0,
  targetStateId: "neutral", playing: false, currentTime: 0 };

test("a cancelled intermediate frame cannot hand off using its stale settled state ID", () => {
  assert.equal(settledPeekState(state, timeline), "neutral");
  assert.equal(settledPeekState({ ...state, playing: true }, timeline), null);
  assert.equal(settledPeekState({ ...state, currentTime: 2 }, timeline), null);
  assert.equal(settledPeekState({ ...state, currentTime: NaN }, timeline), null);
  assert.equal(settledPeekState({ ...state, currentStateId: "unknown" }, timeline), null);
  assert.equal(settledPeekState({ ...state, currentStateId: "hidden", currentTime: timeline.states[1].hold }, timeline), "hidden");
});

test("the compiled clock keeps its real frame endpoints while playback takes 1 second", () => {
  const segment = timeline.segments[0];
  assert.equal(segment.hold, (timeline.frameCount - 1) / timeline.fps);
  assert.equal(segment.endExclusive, timeline.frameCount / timeline.fps);
  assert.equal((segment.hold - segment.start) / segment.curve.rate, 1);
});
