"use client";

import { useEffect, useRef } from "react";
import styles from "./companion.module.css";

const media = "/companion/workspace-red-panda/";
const actions = [
  ["take-out", "look", "stow"],
  ["walk"],
  ["drink"],
  ["cookie"],
] as const;

/** The character is decorative. The separate status bubble owns announcements. */
export function WorkspaceRedPanda() {
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const stage = container.current;
    const player = video.current;
    if (!stage || !player) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let failed = false;
    let action = 0;
    let step = 0;
    let timer: number | undefined;
    let loading: number | undefined;
    let clip: string | undefined;
    let first = true;

    function canPlay() {
      return visible && !document.hidden && !reduced.matches && !failed;
    }

    function stop() {
      window.clearTimeout(timer);
      window.clearTimeout(loading);
      timer = undefined;
      clip = undefined;
      step = 0;
      stage!.dataset.clip = "idle";
      stage!.dataset.poster = "idle";
      delete stage!.dataset.playing;
      player!.pause();
      player!.removeAttribute("src");
      player!.load();
    }

    function fail() {
      failed = true;
      stop();
    }

    function schedule() {
      if (!canPlay() || timer !== undefined || clip) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (canPlay()) startClip();
      }, first ? 2500 : 6500);
    }

    function startClip() {
      first = false;
      clip = actions[action][step];
      stage!.dataset.clip = clip;
      delete stage!.dataset.playing;
      player!.src = media + clip + ".webm";
      loading = window.setTimeout(fail, 12000);
      play();
    }

    function play() {
      const requested = clip;
      void player!.play().catch((error: unknown) => {
        if (requested === clip && canPlay() && !(error instanceof DOMException && error.name === "AbortError")) fail();
      });
    }

    function onPlaying() {
      window.clearTimeout(loading);
      // Some decoders play VP9 while discarding its alpha channel.
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) return fail();
      context.drawImage(player!, 0, 0, 1, 1, 0, 0, 1, 1);
      if (context.getImageData(0, 0, 1, 1).data[3] !== 0) return fail();
      stage!.dataset.playing = "true";
    }

    function onEnded() {
      stage!.dataset.poster = clip === "take-out" || clip === "look" ? "map" : "idle";
      step += 1;
      if (step < actions[action].length) {
        startClip();
        return;
      }
      action = (action + 1) % actions.length;
      stop();
      schedule();
    }

    function syncVisibility() {
      if (!canPlay()) {
        window.clearTimeout(timer);
        window.clearTimeout(loading);
        timer = undefined;
        if (reduced.matches) stop();
        else player!.pause();
        return;
      }
      if (clip) {
        if (player!.readyState < 2) loading = window.setTimeout(fail, 12000);
        play();
      } else schedule();
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncVisibility();
    });
    observer.observe(stage);
    player.addEventListener("playing", onPlaying);
    player.addEventListener("ended", onEnded);
    player.addEventListener("error", fail);
    reduced.addEventListener("change", syncVisibility);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      observer.disconnect();
      player.removeEventListener("playing", onPlaying);
      player.removeEventListener("ended", onEnded);
      player.removeEventListener("error", fail);
      reduced.removeEventListener("change", syncVisibility);
      document.removeEventListener("visibilitychange", syncVisibility);
      stop();
    };
  }, []);

  return (
    <div aria-hidden="true" className={styles.workspacePanda} data-clip="idle" ref={container}>
      <video muted playsInline preload="none" ref={video} />
    </div>
  );
}
