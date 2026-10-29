import type { SegmentPlayerState, TimelineState } from "./oil-motion-frame-animator";

/** cancel() retains the previous settled ID: a stopped mid-frame is not a handoff. */
export function settledPeekState(state: SegmentPlayerState, timeline: {
  readonly states: readonly TimelineState[]; readonly frameDuration: number;
}): string | null {
  if (state.playing || !Number.isFinite(state.currentTime)) return null;
  const endpoint = timeline.states.find((entry) => entry.id === state.currentStateId);
  return endpoint && Math.abs(endpoint.hold - state.currentTime) <= timeline.frameDuration / 2 + 1e-6
    ? endpoint.id : null;
}
