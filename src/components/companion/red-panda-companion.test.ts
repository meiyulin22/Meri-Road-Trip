import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createRedPandaCompanion } from "./red-panda-companion";

/** Small browser boundary fake: run the real oil-motion controllers, not a second state machine. */
function environment(t: TestContext, { coarse = false, reduce = false, broken = false } = {}) {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const install = (key: string, value: unknown) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  class Element extends EventTarget {
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    getBoundingClientRect() { return { left: 500, top: 200, width: 120, height: 120 }; }
  }
  class Video extends Element {
    currentTime = 0; readyState = 2; paused = true; playbackRate = 1; src = ""; preload = "none";
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    load() { if (this.src) queueMicrotask(() => this.dispatchEvent(new Event("loadeddata"))); }
    removeAttribute() { this.src = ""; }
  }
  class Media extends EventTarget { constructor(public matches: boolean) { super(); } }
  const fine = new Media(!coarse), reduced = new Media(reduce);
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const win = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0, now = 0, imageRequests = 0;
  const stage = new Element(), look = new Element(), peek = new Element(), video = new Video();
  install("window", win); install("document", doc); install("innerWidth", 1000); install("innerHeight", 700);
  install("matchMedia", (query: string) => query.includes("pointer") ? fine : reduced);
  install("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  install("cancelAnimationFrame", (handle: number) => frames.delete(handle));
  install("Image", class { src = ""; decode() { imageRequests++; return broken ? Promise.reject(new Error("404")) : Promise.resolve(); } });
  install("IntersectionObserver", class {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe() {} disconnect() {}
  });
  install("ResizeObserver", class { observe() {} disconnect() {} });
  const runtime = createRedPandaCompanion({ stage: stage as unknown as HTMLDivElement,
    look: look as unknown as HTMLDivElement, peek: peek as unknown as HTMLDivElement,
    video: video as unknown as HTMLVideoElement });
  t.after(() => {
    runtime.destroy();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
  const advance = async (milliseconds: number) => {
    for (let n = 0; n < Math.ceil(milliseconds / (1000 / 60)); n++) {
      await flush(); now += 1000 / 60;
      if (!video.paused) video.currentTime += video.playbackRate / 60;
      const work = [...frames.values()]; frames.clear(); work.forEach((callback) => callback(now));
    }
    await flush();
  };
  return { stage, look, video, runtime, fine, reduced, doc, frames, flush, advance,
    imageRequests: () => imageRequests,
    intersection: (visible: boolean) => intersect([{ isIntersecting: visible }]),
    pointer: (x: number, y: number) => win.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: x, clientY: y })) };
}

test("focus peeks, then tracks; blur centers before withdrawal; refocus reverses the same clock", async (t) => {
  const e = environment(t); await e.flush(); await e.advance(50);
  assert.equal(e.stage.dataset.ready, "true");
  assert.equal(e.video.currentTime, 4.25);
  e.runtime.setActive(true); await e.advance(600);
  assert.equal(e.stage.dataset.mode, "peek");
  assert.ok(e.video.currentTime > 0 && e.video.currentTime < 4.25);
  // Cancellation must not turn a midway frame into the old hidden endpoint.
  const midway = e.video.currentTime;
  e.intersection(false); await e.advance(200);
  assert.equal(e.video.currentTime, midway);
  e.intersection(true); await e.advance(1100);
  assert.equal(e.stage.dataset.mode, "look");
  e.pointer(0, 0); await e.advance(600);
  assert.equal(e.look.style.backgroundPosition, "0% 0%");
  e.runtime.setActive(false);
  assert.equal(e.stage.dataset.mode, "centering");
  assert.equal(e.video.currentTime, 0);
  await e.advance(120); // Rapid refocus cancels return-to-neutral without hiding the panda.
  e.runtime.setActive(true); await e.advance(400);
  assert.equal(e.stage.dataset.mode, "look");
  e.runtime.setActive(false); await e.advance(700);
  assert.equal(e.stage.dataset.mode, "peek");
  assert.equal(e.look.style.backgroundPosition, "50% 50%");
  const withdrawing = e.video.currentTime;
  assert.ok(withdrawing > 0 && withdrawing < 4.25);
  e.runtime.setActive(true); await e.advance(200);
  assert.ok(e.video.currentTime < withdrawing);
  await e.advance(1600);
  assert.equal(e.stage.dataset.mode, "look");
  e.runtime.setActive(false); await e.advance(2400);
  assert.equal(e.video.currentTime, 4.25);
  await e.advance(500);
  assert.equal(e.frames.size, 0, "settled hidden state does not spin RAF");
});

test("background pause resumes the latest focus intent; reduced motion and coarse pointers stay static", async (t) => {
  const e = environment(t); await e.flush();
  e.runtime.setActive(true); await e.advance(400);
  e.doc.visibilityState = "hidden"; e.doc.dispatchEvent(new Event("visibilitychange"));
  const paused = e.video.currentTime;
  e.runtime.setActive(false); await e.advance(1000);
  assert.equal(e.video.currentTime, paused);
  e.doc.visibilityState = "visible"; e.doc.dispatchEvent(new Event("visibilitychange"));
  await e.advance(1800); assert.equal(e.video.currentTime, 4.25);
  e.runtime.setActive(true); await e.advance(400);
  e.reduced.matches = true; e.reduced.dispatchEvent(new Event("change"));
  assert.equal(e.stage.dataset.mode, "static");
  assert.equal(e.frames.size, 0);
  e.reduced.matches = false; e.reduced.dispatchEvent(new Event("change"));
  await e.advance(100); assert.equal(e.stage.dataset.mode, "look");
  e.fine.matches = false; e.fine.dispatchEvent(new Event("change"));
  assert.equal(e.stage.dataset.mode, "static");
  assert.equal(e.frames.size, 0);
});

for (const preference of [{ coarse: true }, { reduce: true }]) {
  test(`static preference never requests animation media: ${JSON.stringify(preference)}`, async (t) => {
    const e = environment(t, preference); e.runtime.setActive(true); await e.flush();
    assert.equal(e.stage.dataset.mode, "static");
    assert.equal(e.imageRequests(), 0); assert.equal(e.video.src, "");
  });
}

test("cold focused fallback stays visible when decode finishes; resource failure stays static", async (t) => {
  const e = environment(t); e.runtime.setActive(true); await e.flush(); await e.advance(100);
  assert.equal(e.stage.dataset.mode, "look");
  assert.equal(e.video.currentTime, 0);
  e.video.dispatchEvent(new Event("error"));
  assert.equal(e.stage.dataset.mode, "static");
  assert.equal(e.frames.size, 0);
});

test("an atlas decode failure cannot block focus or start a video loop", async (t) => {
  const e = environment(t, { broken: true }); await e.flush(); e.runtime.setActive(true);
  assert.equal(e.stage.dataset.ready, "false");
  assert.equal(e.stage.dataset.mode, "static");
  assert.equal(e.frames.size, 0);
});
