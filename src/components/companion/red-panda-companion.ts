import lookGrid from "../../../public/companion/red-panda/look.json";
import peekAtlas from "../../../public/companion/red-panda/peek.json";
import timeline from "../../../public/companion/red-panda/peek-timeline.json";
import { createCssSpriteRenderer, createFrameAnimator, createSegmentPlayer,
  type FrameAnimator, type SegmentPlayer, type TimelineSegment } from "./oil-motion-frame-animator";
import { canTrackPointer, gridFrame, neutralPosition, pointerPosition, type Point } from "./red-panda-look-model";
import { settledPeekState } from "./red-panda-peek-model";

export interface RedPandaCompanion { setActive(active: boolean): void; destroy(): void; }

const base = "/companion/red-panda/";
const neutral = neutralPosition(lookGrid);

/** Connect two approved media surfaces at their neutral hold; never mix visible poses. */
export function createRedPandaCompanion({ stage, look, peek, video }: {
  stage: HTMLDivElement; look: HTMLDivElement; peek: HTMLDivElement; video: HTMLVideoElement;
}): RedPandaCompanion {
  const fine = matchMedia("(pointer: fine)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const abort = new AbortController();
  let active = false;
  let destroyed = false;
  let ready = false;
  let loading = false;
  let failed = false;
  let inView = true;
  let resetPlayer = true;
  let pointer: Point | null = null;
  let position = { ...neutral };
  let horizontal: FrameAnimator | null = null;
  let vertical: FrameAnimator | null = null;
  let player: SegmentPlayer | null = null;
  let mode: "static" | "look" | "centering" | "peek" = "static";
  let paintRaf = 0;
  let targetRaf = 0;
  let lastLook = -1;
  let lastPeek = -1;
  const renderLook = createCssSpriteRenderer(look, lookGrid.columns, lookGrid.rows);
  const renderPeek = createCssSpriteRenderer(peek, peekAtlas.columns, peekAtlas.rows);
  renderLook(gridFrame(neutral, lookGrid));
  const animated = () => fine.matches && !reduced.matches;
  const awake = () => inView && document.visibilityState === "visible";
  const tracking = () => mode === "look" && canTrackPointer({ active, inView,
    visible: document.visibilityState === "visible", finePointer: fine.matches, reducedMotion: reduced.matches });
  const setMode = (next: typeof mode) => { mode = next; stage.dataset.mode = next; };
  const queuePaint = () => { if (!paintRaf && !destroyed && awake()) paintRaf = requestAnimationFrame(paint); };
  const stopHead = () => {
    horizontal?.destroy(); vertical?.destroy(); horizontal = vertical = null;
    if (targetRaf) cancelAnimationFrame(targetRaf);
    targetRaf = 0;
  };
  const pause = () => {
    stopHead(); player?.cancel();
    if (paintRaf) cancelAnimationFrame(paintRaf);
    paintRaf = 0;
  };
  const fail = () => {
    if (destroyed) return;
    failed = true; ready = false; pause(); setMode("static"); stage.dataset.ready = "false";
  };

  function playPeek(show: boolean) {
    stopHead();
    player?.goTo(show ? "neutral" : "hidden");
    // Set the first visible cell before changing surfaces, including after a preference reset.
    const frame = Math.max(0, Math.min(peekAtlas.frameCount - 1, Math.round(video.currentTime * timeline.fps)));
    if (frame !== lastPeek) { renderPeek(frame); lastPeek = frame; }
    setMode("peek");
    queuePaint();
  }

  function paint() {
    paintRaf = 0;
    if (destroyed || !ready || !awake() || !animated()) return;
    if (mode === "look" || mode === "centering") {
      const frame = gridFrame(position, lookGrid);
      if (frame !== lastLook) { renderLook(frame); lastLook = frame; }
      if (mode === "centering" && frame === gridFrame(neutral, lookGrid)) {
        position = { ...neutral };
        playPeek(false);
      }
      return;
    }
    if (mode !== "peek" || !player) return;
    const state = player.getState();
    const frame = Math.max(0, Math.min(peekAtlas.frameCount - 1, Math.round(state.currentTime * timeline.fps)));
    if (frame !== lastPeek) { renderPeek(frame); lastPeek = frame; }
    const settled = settledPeekState(state, timeline);
    if (settled === "neutral" && active) {
      position = { ...neutral };
      const frame = gridFrame(neutral, lookGrid);
      if (frame !== lastLook) { renderLook(frame); lastLook = frame; }
      setMode("look"); startHead(); queuePaint();
    } else if (state.playing) queuePaint();
  }

  function updateTarget() {
    targetRaf = 0;
    if (!tracking() || !pointer) return;
    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const face = { x: box.left + box.width * lookGrid.faceAnchor.x, y: box.top + box.height * lookGrid.faceAnchor.y };
    const target = pointerPosition(face, pointer, { width: innerWidth, height: innerHeight }, lookGrid);
    horizontal?.setTarget(target.x); vertical?.setTarget(target.y);
  }
  const queueTarget = () => {
    if (!targetRaf && tracking()) targetRaf = requestAnimationFrame(updateTarget);
  };
  function startHead() {
    if (!horizontal) horizontal = createFrameAnimator({ frameCount: lookGrid.columns, initialFrame: position.x,
      render: (x) => { position.x = x; queuePaint(); } });
    if (!vertical) vertical = createFrameAnimator({ frameCount: lookGrid.rows, initialFrame: position.y,
      render: (y) => { position.y = y; queuePaint(); } });
    if (mode === "centering") { horizontal.setTarget(neutral.x); vertical.setTarget(neutral.y); }
    else queueTarget();
  }

  function reconcile() {
    if (destroyed) return;
    if (!animated() || failed || !ready) {
      pause(); resetPlayer = true; position = { ...neutral }; setMode("static");
      if (animated() && !failed && awake()) void load();
      return;
    }
    if (!awake()) { pause(); return; }
    if (resetPlayer) {
      player?.destroy();
      player = createSegmentPlayer({ video, states: timeline.states,
        segments: timeline.segments as TimelineSegment[], frameDuration: timeline.frameDuration,
        // A focus before decode already shows the fallback; don't replay an entrance late.
        initialState: active ? "neutral" : timeline.initialState, onStateChange: queuePaint, onError: fail });
      resetPlayer = false;
      setMode(active ? "look" : "peek");
    }
    if (mode === "look" || mode === "centering") {
      setMode(active ? "look" : "centering"); startHead(); queuePaint();
    } else playPeek(active);
  }

  function decodeImage(url: string) {
    const image = new Image(); image.src = url;
    return image.decode();
  }
  async function load() {
    if (loading || ready || failed || destroyed) return;
    loading = true;
    let timer = 0;
    let loaded: () => void = () => {};
    let broken: () => void = () => {};
    try {
      const media = new Promise<void>((resolve, reject) => {
        loaded = () => resolve(); broken = () => reject(new Error("Optional companion media unavailable"));
        video.addEventListener("loadeddata", loaded, { once: true });
        video.addEventListener("error", broken, { once: true });
        abort.signal.addEventListener("abort", broken, { once: true });
      });
      const timeout = new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("Optional companion decode timed out")), 20000);
      });
      video.src = `${base}peek-clock.mp4`; video.preload = "auto"; video.load();
      await Promise.race([Promise.all([decodeImage(`${base}look.webp`), decodeImage(`${base}peek.webp`), media]), timeout]);
      if (destroyed) return;
      look.style.backgroundImage = `url(${base}look.webp)`;
      peek.style.backgroundImage = `url(${base}peek.webp)`;
      ready = true; stage.dataset.ready = "true"; reconcile();
    } catch { fail(); }
    finally {
      clearTimeout(timer); loading = false;
      video.removeEventListener("loadeddata", loaded); video.removeEventListener("error", broken);
      abort.signal.removeEventListener("abort", broken);
    }
  }

  const onPointer = (event: PointerEvent) => { pointer = { x: event.clientX, y: event.clientY }; queueTarget(); };
  const intersection = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; reconcile(); });
  const resize = new ResizeObserver(queueTarget);
  intersection.observe(stage); resize.observe(stage);
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("resize", queueTarget, { passive: true });
  window.addEventListener("scroll", queueTarget, { passive: true });
  document.addEventListener("visibilitychange", reconcile);
  fine.addEventListener("change", reconcile); reduced.addEventListener("change", reconcile);
  video.addEventListener("seeked", queuePaint); video.addEventListener("ended", queuePaint);
  reconcile();
  return {
    setActive(next) { active = next; reconcile(); },
    destroy() {
      destroyed = true; abort.abort(); pause(); player?.destroy();
      intersection.disconnect(); resize.disconnect();
      window.removeEventListener("pointermove", onPointer); window.removeEventListener("resize", queueTarget);
      window.removeEventListener("scroll", queueTarget); document.removeEventListener("visibilitychange", reconcile);
      fine.removeEventListener("change", reconcile); reduced.removeEventListener("change", reconcile);
      video.removeEventListener("seeked", queuePaint); video.removeEventListener("ended", queuePaint);
      video.removeAttribute("src"); video.load();
    },
  };
}
