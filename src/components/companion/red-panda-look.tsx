"use client";

import { useEffect, useRef } from "react";

import { createRedPandaCompanion, type RedPandaCompanion } from "./red-panda-companion";
import styles from "./red-panda-look.module.css";

/** Pure decoration: focus selects intent; oil-motion owns media playback. */
export function RedPandaLook({ active }: { readonly active: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const look = useRef<HTMLDivElement>(null);
  const peek = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLVideoElement>(null);
  const companion = useRef<RedPandaCompanion | null>(null);

  useEffect(() => {
    if (!stage.current || !look.current || !peek.current || !clock.current) return;
    const runtime = createRedPandaCompanion({ stage: stage.current, look: look.current,
      peek: peek.current, video: clock.current });
    companion.current = runtime;
    return () => { runtime.destroy(); companion.current = null; };
  }, []);

  useEffect(() => { companion.current?.setActive(active); }, [active]);

  return <div aria-hidden="true" className={styles.stage} data-active={active} ref={stage}>
    {/* eslint-disable-next-line @next/next/no-img-element -- local decorative fallback, also used with reduced motion */}
    <img alt="" className={styles.front} draggable={false} src="/companion/red-panda/front.webp" />
    <div className={styles.look} ref={look} />
    <div className={styles.peek} ref={peek} />
    {/* One persistent, invisible all-keyframe clock. Only the alpha sprite is displayed. */}
    <video aria-hidden="true" className={styles.clock} ref={clock} muted playsInline preload="none" tabIndex={-1} />
  </div>;
}
