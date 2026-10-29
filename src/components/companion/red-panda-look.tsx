"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import grid from "../../../public/companion/red-panda/look.json";
import { createCssSpriteRenderer, createFrameAnimator, type FrameAnimator } from "./oil-motion-frame-animator";
import { canTrackPointer, gridFrame, neutralPosition, pointerPosition, type Point } from "./red-panda-look-model";
import styles from "./red-panda-look.module.css";

const atlasUrl = "/companion/red-panda/look.webp";
const frontUrl = "/companion/red-panda/front.webp";

/** A decorative head-turn companion. Entrance choreography is deliberately deferred. */
export function RedPandaLook({ active }: { readonly active: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const sprite = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<Point | null>(null);
  const currentPosition = useRef<Point>(neutralPosition(grid));
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    const fine = window.matchMedia("(pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const load = () => {
      if (loading || !fine.matches || reduced.matches) return;
      loading = true;
      const image = new Image();
      image.src = atlasUrl;
      void image.decode().then(() => { if (!cancelled) setReady(true); }).catch(() => {
        // The local neutral image remains visible if the optional atlas cannot load.
        loading = false;
      });
    };
    fine.addEventListener("change", load);
    reduced.addEventListener("change", load);
    load();
    return () => {
      cancelled = true;
      fine.removeEventListener("change", load);
      reduced.removeEventListener("change", load);
    };
  }, []);

  useEffect(() => {
    const element = sprite.current;
    const stageElement = stage.current;
    if (!ready || !element || !stageElement) return;
    const render = createCssSpriteRenderer(element, grid.columns, grid.rows);
    const neutral = neutralPosition(grid);
    let position = { ...currentPosition.current };
    let drawn = -1;
    let targetRaf = 0;
    let paintRaf = 0;
    let horizontal: FrameAnimator | null = null;
    let vertical: FrameAnimator | null = null;
    let inView = true;
    let visible = document.visibilityState === "visible";
    const fine = window.matchMedia("(pointer: fine)");

    const draw = () => {
      paintRaf = 0;
      currentPosition.current = { ...position };
      const frame = gridFrame(position, grid);
      if (frame === drawn) return;
      render(frame);
      drawn = frame;
    };
    const queuePaint = () => { if (!paintRaf) paintRaf = requestAnimationFrame(draw); };
    const tracking = () => canTrackPointer({ active, visible, inView, finePointer: fine.matches, reducedMotion: reducedMotion === true });
    const updateTarget = () => {
      targetRaf = 0;
      const pointer = lastPointer.current;
      if (!tracking() || !pointer) return;
      const box = stageElement.getBoundingClientRect();
      if (!box.width || !box.height) return;
      // The eye midpoint is measured in the compiled neutral cell, not guessed from a container height.
      const face = { x: box.left + box.width * grid.faceAnchor.x, y: box.top + box.height * grid.faceAnchor.y };
      const target = pointerPosition(face, pointer, { width: window.innerWidth, height: window.innerHeight }, grid);
      horizontal?.setTarget(target.x);
      vertical?.setTarget(target.y);
    };
    const queueTarget = () => { if (tracking() && !targetRaf) targetRaf = requestAnimationFrame(updateTarget); };
    const stop = () => {
      horizontal?.destroy();
      vertical?.destroy();
      horizontal = null;
      vertical = null;
      if (targetRaf) cancelAnimationFrame(targetRaf);
      if (paintRaf) cancelAnimationFrame(paintRaf);
      targetRaf = paintRaf = 0;
    };
    const reconcile = () => {
      if (!tracking()) {
        stop();
        if (!fine.matches || reducedMotion) { position = { ...neutral }; draw(); }
        return;
      }
      if (!horizontal) horizontal = createFrameAnimator({ frameCount: grid.columns, initialFrame: position.x,
        render: (x) => { position.x = x; queuePaint(); } });
      if (!vertical) vertical = createFrameAnimator({ frameCount: grid.rows, initialFrame: position.y,
        render: (y) => { position.y = y; queuePaint(); } });
      queueTarget();
    };
    const onPointer = (event: PointerEvent) => {
      lastPointer.current = { x: event.clientX, y: event.clientY };
      queueTarget();
    };
    const onVisibility = () => { visible = document.visibilityState === "visible"; reconcile(); };
    const intersection = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; reconcile(); });
    const resize = new ResizeObserver(queueTarget);
    intersection.observe(stageElement);
    resize.observe(stageElement);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("resize", queueTarget, { passive: true });
    window.addEventListener("scroll", queueTarget, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    fine.addEventListener("change", reconcile);
    draw();
    reconcile();
    return () => {
      stop();
      intersection.disconnect();
      resize.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", queueTarget);
      window.removeEventListener("scroll", queueTarget);
      document.removeEventListener("visibilitychange", onVisibility);
      fine.removeEventListener("change", reconcile);
    };
  }, [active, ready, reducedMotion]);

  return <div aria-hidden="true" className={styles.stage} data-active={active} data-ready={ready} ref={stage}>
    {/* eslint-disable-next-line @next/next/no-img-element -- fixed local decorative fallback, also used without animation */}
    <img alt="" className={styles.front} draggable={false} src={frontUrl} />
    {ready ? <div className={styles.sprite} ref={sprite} style={{ backgroundImage: `url(${atlasUrl})`,
      backgroundSize: `${grid.columns * 100}% ${grid.rows * 100}%`, backgroundPosition: "50% 50%" }} /> : null}
  </div>;
}
