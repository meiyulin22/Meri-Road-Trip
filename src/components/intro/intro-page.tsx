"use client";

import { ArrowRight, Check, Compass, Map, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { useMessages } from "@/components/i18n/locale-context";
import { PhotoSourceCredit } from "@/components/trip-workspace/photo-source-dialog";
import { LanguageToggle } from "@/components/ui/language-toggle";
import type { PlaceImage } from "@/domain/location/place-image";

import styles from "./intro-page.module.css";

const TUTORIAL_INTERVAL_MS = 3_000;

export function IntroPage({ photos }: {
  readonly photos: readonly { region: string; image: PlaceImage }[];
}) {
  const text = useMessages().intro;
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduceMotion || paused) return;
    let timer: number | undefined;
    const opening = window.setTimeout(() => {
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          setStep((current) => (current + 1) % text.steps.length);
        }
      }, TUTORIAL_INTERVAL_MS);
    }, 2_000);
    return () => {
      window.clearTimeout(opening);
      window.clearInterval(timer);
    };
  }, [paused, reduceMotion, text.steps.length]);

  const start = (className: string) => (
    <form action="/" method="get" className={styles.startForm}>
      <button className={className} type="submit">
        {text.startJourney}<ArrowRight aria-hidden="true" size={19} />
      </button>
    </form>
  );

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="intro-title">
        <header className={styles.header}>
          <Link className={styles.smallBrand} href="/intro" aria-label={text.brand}>
            <span aria-hidden="true" className={styles.smallMark} />{text.brand}
          </Link>
          <LanguageToggle />
        </header>
        <div className={styles.heroContent}>
          <div aria-hidden="true" className={styles.camp}>
            <span className={styles.sun} />
            <span className={styles.mountain} />
          </div>
          <h1 id="intro-title" className={styles.title}>
            <span className={styles.wordmark} role="img" aria-label={text.brand} />
          </h1>
          <p className={styles.lead}>{text.description}</p>
          <div className={styles.tutorial} aria-label={text.tutorialLabel}>
            <div className={styles.stepWindow}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={step} initial={reduceMotion ? false : { opacity: 0, y: 7 }}
                  animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -7 }}
                  transition={{ duration: reduceMotion ? 0 : 0.22 }} className={styles.step}>
                  <p>{text.steps[step]}</p>
                  {step >= 3 ? <span className={styles.soon}>{text.comingSoon}</span> : null}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className={styles.tutorialControls}>
              <div className={styles.dots} role="group" aria-label={text.tutorialLabel}>
                {text.steps.map((line, index) => (
                  <button key={line} type="button" aria-label={line} aria-pressed={step === index}
                    className={styles.dot} onClick={() => { setStep(index); setPaused(true); }} />
                ))}
              </div>
              {!reduceMotion ? <button className={styles.pause} type="button" aria-pressed={paused}
                onClick={() => setPaused((value) => !value)}>{paused ? text.play : text.pause}</button> : null}
            </div>
          </div>
          {start(styles.primary)}
          <a className={styles.discover} href="#intro-features">{text.discover}</a>
        </div>
        <div aria-hidden="true" className={styles.landscape} />
      </section>

      <section id="intro-features" className={styles.features} aria-labelledby="intro-features-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>{text.featuresEyebrow}</p>
          <h2 id="intro-features-title">{text.featuresTitle}</h2>
        </div>
        <article className={styles.destinationFeature}>
          <div className={styles.featureCopy}>
            <Compass aria-hidden="true" size={26} strokeWidth={1.4} />
            <h3>{text.decideTitle}</h3>
            <p>{text.decideDescription}</p>
            <span className={styles.available}><Check aria-hidden="true" size={14} />{text.available}</span>
          </div>
          <div className={styles.examples}>
            <p className={styles.exampleLabel}>{text.examples}</p>
            <div className={styles.photoGrid}>
              {photos.map(({ region, image }) => (
                <figure className={styles.photoCard} key={region}>
                  <Image alt={image.caption} src={image.url} width={500} height={360}
                    sizes="(max-width: 600px) 80vw, 240px" className={styles.placePhoto} />
                  <figcaption><strong>{region}</strong><span>{image.caption}</span></figcaption>
                  <PhotoSourceCredit image={image} href={`/photo-credits/source/${image.url.split("/").pop()}`}
                    className={styles.credit} />
                </figure>
              ))}
            </div>
            <p className={styles.photoNote}>{text.photoNote}</p>
          </div>
        </article>
        <div className={styles.plannedGrid}>
          <article className={styles.plannedFeature}>
            <ShieldCheck aria-hidden="true" size={27} strokeWidth={1.4} />
            <span className={styles.soon}>{text.comingSoon}</span>
            <h3>{text.verifyTitle}</h3><p>{text.verifyDescription}</p>
          </article>
          <article className={styles.plannedFeature}>
            <Map aria-hidden="true" size={27} strokeWidth={1.4} />
            <span className={styles.soon}>{text.comingSoon}</span>
            <h3>{text.planTitle}</h3><p>{text.planDescription}</p>
          </article>
        </div>
      </section>
      <footer className={styles.footer}>
        <h2>{text.footerTitle}</h2>
        {start(styles.primary)}
        <div className={styles.footerRow}>
          <Link href="/photo-credits">{text.photoCreditsTitle}</Link>
          <LanguageToggle />
        </div>
      </footer>
    </main>
  );
}
