import Image from "next/image";

import type { PlaceImage } from "@/domain/location/place-image";
import type { Locale } from "@/domain/locale/locale";
import { hotelPhotoHost } from "@/platform/hotel/hotel-photos";
import { loadPhotoCatalog } from "@/platform/place-photos/catalog-photo-provider";
import { mediaPhotoStoreFromEnvironment } from "@/platform/place-photos/media-photo-store";

import styles from "./handbook.module.css";

/** Saved references are rendered as links. Only the explicitly permitted photo URLs load media. */
export function sourceLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export async function DayPhoto({ photo, locale }: { readonly photo: PlaceImage; readonly locale: Locale }) {
  const catalogFile = /^\/photos\/([a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp|avif))$/u.exec(photo.url)?.[1];
  const mediaFile = /^\/media\/place-photos\/((?:pixabay|wikimedia)-[1-9]\d{0,11}\.(?:jpg|png|webp))$/u.exec(photo.url)?.[1];
  const credit = catalogFile ? Object.values(loadPhotoCatalog()).find(({ file }) => file === catalogFile)
    : mediaFile ? await mediaPhotoStoreFromEnvironment()?.readPhotoCredit(mediaFile) : null;
  const source = credit && sourceLink(credit.pageUrl);
  if (!credit || !source) return null;

  const commons = credit.source === "wikimedia";
  const license = credit.licenseUrl && sourceLink(credit.licenseUrl);
  if (commons && (!credit.license || !license)) return null;

  return (
    <figure className={styles.dayPhoto} data-plan-pdf-photo>
      <Image src={photo.url} alt={photo.caption} width={800} height={380} loading="eager" />
      <figcaption>
        <span>{photo.caption}</span>
        <span><a href={source}>{credit.artist} / {commons ? "Wikimedia Commons" : "Pixabay"}</a>
          {commons ? <> · <a href={license}>{credit.license}</a> · {locale === "zh" ? "调整尺寸及裁切" : "Resized and cropped"}</> : null}
        </span>
      </figcaption>
    </figure>
  );
}

export function HotelPhoto({ urls }: { readonly urls: readonly (string | null)[] }) {
  const src = urls.find((value): value is string => {
    const href = value && sourceLink(value);
    return Boolean(href && new URL(href).origin === `https://${hotelPhotoHost}`);
  });
  return src ? (
    <figure className={styles.hotelPhoto} data-plan-pdf-photo>
      <Image src={src} alt="" width={160} height={100} loading="eager" />
      <figcaption>RollingGo</figcaption>
    </figure>
  ) : null;
}
