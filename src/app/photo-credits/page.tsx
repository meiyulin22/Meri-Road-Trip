import Image from "next/image";
import Link from "next/link";

import { messages } from "@/components/i18n/messages";
import { loadIntroPhotos } from "@/components/intro/intro-photos";
import { PhotoSourceCredit } from "@/components/trip-workspace/photo-source-dialog";
import { requestLocale } from "@/platform/locale/request-locale";

import styles from "./photo-credits.module.css";

export default async function PhotoCreditsPage() {
  const text = messages[await requestLocale()].intro;
  const photos = loadIntroPhotos();

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link className={styles.brand} href="/intro">{text.brand}</Link>
          <Link className={styles.back} href="/intro">{text.backToIntro}</Link>
        </header>
        <section aria-labelledby="credits-title" className={styles.content}>
          <div className={styles.introduction}>
            <h1 id="credits-title">{text.photoCreditsTitle}</h1>
            <p>{text.photoCreditsDescription}</p>
          </div>
          <div className={styles.photos}>
            {photos.map(({ region, image }) => (
              <figure className={styles.photo} key={region}>
                <Image
                  alt={image.caption}
                  className={styles.image}
                  height={480}
                  sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1040px) calc((100vw - 64px) / 2), 320px"
                  src={image.url}
                  width={640}
                />
                <figcaption className={styles.caption}>
                  <h2>{region}</h2>
                  <p>{image.caption}</p>
                  <PhotoSourceCredit
                    className={styles.credit}
                    href={`/photo-credits/source/${encodeURIComponent(image.url.slice(image.url.lastIndexOf("/") + 1))}`}
                    image={image}
                  />
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
