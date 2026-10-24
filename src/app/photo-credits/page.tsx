import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { messages } from "@/components/i18n/messages";
import { requestLocale } from "@/platform/locale/request-locale";
import { loadPhotoCatalog } from "@/platform/place-photos/catalog-photo-provider";

import styles from "./photo-credits.module.css";

export async function generateMetadata(): Promise<Metadata> {
  return { title: messages[await requestLocale()].photoCredits.pageTitle };
}

const pixabayLicenceUrl = "https://pixabay.com/service/license-summary/";

/**
 * Who took each photo Meri ships with, where it came from and under which licence. Commons
 * photos are Creative Commons: their licence asks for the author, the licence with a link,
 * the source, and a note that the copy was changed (resized) — every card's credit links
 * here, so all of that is one click away. Each photo has its own anchor, its file name.
 */
export default async function PhotoCreditsPage() {
  const text = messages[await requestLocale()].photoCredits;
  const entries = Object.entries(loadPhotoCatalog())
    .sort(([left], [right]) => left.localeCompare(right, "zh"));
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav><Link className={styles.home} href="/">{text.home}</Link></nav>
        <h1>{text.title}</h1>
        <p className={styles.introduction}>{text.introduction}</p>
        <ul className={styles.list}>
          {entries.map(([name, entry]) => {
            const wikimedia = entry.source === "wikimedia";
            return (
              <li className={styles.item} id={entry.file} key={entry.file}>
                <Image alt="" className={styles.thumbnail} height={72} src={`/photos/${entry.file}`} width={96} />
                <div>
                  <h2>{name}</h2>
                  <p>{entry.artist}</p>
                  <p>
                    {text.source}: <a href={entry.pageUrl} rel="noreferrer" target="_blank">
                      {wikimedia ? "Wikimedia Commons" : "Pixabay"} · {text.original}</a>
                    {" · "}{text.licence}: <a href={wikimedia ? entry.licenseUrl : pixabayLicenceUrl} rel="noreferrer license"
                      target="_blank">{wikimedia ? entry.license : text.pixabayLicence}</a>
                    {" · "}{text.resized}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <h2 className={styles.runtimeTitle} id="runtime">{text.runtimeTitle}</h2>
        <p className={styles.introduction}>{text.runtimeText}{" "}
          <a href={pixabayLicenceUrl} rel="noreferrer license" target="_blank">{text.pixabayLicence}</a></p>
      </div>
    </main>
  );
}
