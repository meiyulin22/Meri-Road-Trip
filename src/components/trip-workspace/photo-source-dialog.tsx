"use client";

import { ArrowUpRight, ExternalLink, LoaderCircle, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import { useMessages } from "@/components/i18n/locale-context";
import type { PlaceImage } from "@/domain/location/place-image";

import styles from "./photo-source-dialog.module.css";

export interface PhotoSource {
  readonly url: string;
  readonly artist: string;
  readonly source: "pixabay" | "wikimedia";
  /** Commons only: the licence name, and its deed (or the file page, for public domain) when there is one. */
  readonly license?: string;
  readonly licenseUrl?: string;
}

/** Only a licence deed on creativecommons.org or a Commons file page may become the licence link. */
function parseLicenceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url.host === "creativecommons.org" || (url.host === "commons.wikimedia.org" && url.pathname.startsWith("/wiki/File:"))
      ? url.href : null;
  } catch {
    return null;
  }
}

type SourceState = { readonly status: "loading" | "error" } |
  { readonly status: "ready"; readonly value: PhotoSource };

/** A malformed response never becomes a link outside Meri. */
export function parsePhotoSource(value: unknown): PhotoSource | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { url, artist, source, license, licenseUrl } = value as Record<string, unknown>;
  if (typeof url !== "string" || url.length > 2000 || typeof artist !== "string" ||
    artist.trim() === "" || artist.length > 100 || !(source === "pixabay" || source === "wikimedia")) return null;
  try {
    const target = new URL(url);
    const host = source === "pixabay" ? "pixabay.com" : "commons.wikimedia.org";
    const validPath = source === "wikimedia" ? target.pathname.startsWith("/wiki/File:") && target.pathname.length > "/wiki/File:".length
      : /^\/(?:users\/[^/]+-[1-9]\d*|(?:[a-z]{2}\/)?(?:photos\/)?[^/]+-[1-9]\d*)\/$/u.test(target.pathname);
    if (target.protocol !== "https:" || target.host !== host || target.username || target.password ||
      target.search || target.hash || !validPath) return null;
    const licenseName = source === "wikimedia" && typeof license === "string" && license.trim() !== "" && license.length <= 40
      ? license.trim() : null;
    const licenseLink = licenseName ? parseLicenceUrl(licenseUrl) : null;
    return { url: target.href, artist: artist.trim(), source, ...(licenseName ? { license: licenseName } : {}),
      ...(licenseLink ? { licenseUrl: licenseLink } : {}) };
  } catch {
    return null;
  }
}

export async function requestPhotoSource(href: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<PhotoSource> {
  if (!/^\/photo-credits\/source\/[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp|avif)$/u.test(href)) {
    throw new Error("Invalid photo source request.");
  }
  const response = await fetcher(`${href}?format=json`, { signal, cache: "no-store", redirect: "error",
    headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Photo source is unavailable.");
  const source = parsePhotoSource(await response.json());
  if (!source) throw new Error("Photo source is invalid.");
  return source;
}

/** The credit stays a local action until its external destination has been confirmed. */
export function PhotoSourceCredit({ image, href, className }: {
  readonly image: PlaceImage;
  readonly href: string;
  readonly className: string;
}) {
  const text = useMessages().photoCredits;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<SourceState>({ status: "loading" });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef<AbortController | null>(null);
  const commons = image.credit?.includes(" / Wikimedia Commons,") ?? false;

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      cancelRef.current?.focus();
    }
  }, [open]);

  useEffect(() => () => pendingRef.current?.abort(), []);

  async function loadSource() {
    pendingRef.current?.abort();
    const controller = new AbortController();
    pendingRef.current = controller;
    setSource({ status: "loading" });
    try {
      const value = await requestPhotoSource(href, AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
      if (!controller.signal.aborted) setSource({ status: "ready", value });
    } catch {
      if (!controller.signal.aborted) setSource({ status: "error" });
    }
  }

  function dismiss() {
    pendingRef.current?.abort();
    dialogRef.current?.close();
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openDialog(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
    void loadSource();
  }

  return <>
    <button aria-haspopup="dialog" aria-label={`${text.openCredits}: ${image.credit}`} className={`${className} ${styles.trigger}`}
      onClick={openDialog} ref={triggerRef} type="button">
      {image.credit}{commons ? ` · ${text.resized}` : ""}
    </button>
    {open ? createPortal(<dialog aria-describedby={`${id}-description`} aria-labelledby={`${id}-title`}
      className={styles.dialog} onCancel={(event) => { event.preventDefault(); dismiss(); }} onClose={dismiss}
      onClick={(event) => {
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom)) dismiss();
      }} onPointerDown={(event) => event.stopPropagation()} onPointerMove={(event) => event.stopPropagation()}
      ref={dialogRef}>
      <div className={styles.heading}>
        <span aria-hidden="true" className={styles.sourceIcon}><ExternalLink size={21} strokeWidth={1.6} /></span>
        <button aria-label={text.close} className={styles.close} onClick={dismiss} type="button"><X size={19} /></button>
      </div>
      <h2 id={`${id}-title`}>{text.confirmTitle}</h2>
      <p className={styles.description} id={`${id}-description`}>{text.confirmDescription}</p>
      <div className={styles.photo}>
        <Image alt="" className={styles.thumbnail} height={64} sizes="64px" src={image.url} width={64} />
        <div className={styles.photoDetails}>
          <h3>{image.caption}</h3>
          {source.status === "ready" ? <>
            <p>{source.value.artist}</p>
            <span className={styles.platform}>{source.value.source === "pixabay" ? "Pixabay" : "Wikimedia Commons"}</span>
            {source.value.license ? <p className={styles.licence}>{text.licence}: {source.value.licenseUrl
              ? <a href={source.value.licenseUrl} rel="noopener noreferrer license" target="_blank">{source.value.license}</a>
              : source.value.license}</p> : null}
          </> : <p>{text.photographer}</p>}
        </div>
      </div>
      <div aria-live="polite" className={styles.destination}>
        <span className={styles.urlLabel}>{text.destination}</span>
        {source.status === "ready" ? <p className={styles.url} dir="ltr">{source.value.url}</p>
          : source.status === "loading" ? <p className={styles.loading}><LoaderCircle aria-hidden="true" size={15} />{text.loading}</p>
            : <div className={styles.failed}><p role="alert">{text.loadFailed}</p>
              <button onClick={() => void loadSource()} type="button">{text.retry}</button></div>}
      </div>
      <div className={styles.actions}>
        <button autoFocus className={styles.cancel} onClick={dismiss} ref={cancelRef} type="button">{text.cancel}</button>
        {source.status === "ready" ? <a className={styles.confirm} href={source.value.url} onClick={dismiss}
          rel="noopener noreferrer" target="_blank">{text.visit}<ArrowUpRight aria-hidden="true" size={17} /></a>
          : <button className={styles.confirm} disabled type="button">{text.visit}<ArrowUpRight aria-hidden="true" size={17} /></button>}
      </div>
      <p className={styles.newTab}>{text.newTab}</p>
    </dialog>, document.body) : null}
  </>;
}
