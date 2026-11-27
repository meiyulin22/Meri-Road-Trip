import { CalendarDays, Lightbulb } from "lucide-react";

import type { CityTip } from "@/domain/catalog/catalog-tips";
import type { Locale } from "@/domain/locale/locale";

import styles from "./plan-tips-card.module.css";

const copy = {
  zh: {
    title: "Meri 的提示",
    festivals: "当地节庆",
    footnote: "Meri 整理的旅行提示，不是实时信息。节庆日期每年不同，出发前请查当年安排。",
  },
  en: {
    title: "Meri's tips",
    festivals: "Local festivals",
    footnote: "Travel tips from Meri's notes, not live information. Festival dates change each year; check before you go.",
  },
} as const;

/**
 * A city's 「Meri 的提示」 (RAG step 5): its city-wide tips, then its festivals, lighter, each with
 * the catalog's own words for when it falls. Tips for a single spot sit under that stop instead.
 */
export function PlanTipsCard({ city, tips, locale }: {
  readonly city: string;
  readonly tips: readonly CityTip[];
  readonly locale: Locale;
}) {
  const text = copy[locale];
  const general = tips.filter(({ kind }) => kind === "city");
  const festivals = tips.filter(({ kind }) => kind === "festival");
  if (tips.length === 0) return null;
  return (
    <section className={styles.card} aria-label={`${text.title} · ${city}`}>
      <header className={styles.header}>
        <span className={styles.icon}><Lightbulb aria-hidden="true" size={16} /></span>
        <h3>{text.title} · {city}</h3>
      </header>
      {general.length > 0 ? (
        <ul className={styles.tips}>
          {general.map((tip) => (
            <li key={tip.name}>
              <strong>{tip.name}</strong>
              <span>{tip.advice}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {festivals.length > 0 ? (
        <div className={styles.festivals}>
          <h4><CalendarDays aria-hidden="true" size={13} />{text.festivals}</h4>
          <ul>
            {festivals.map((tip) => (
              <li key={tip.name}>
                <strong>{tip.name}</strong>
                {tip.appliesIn ? <span className={styles.when}>{tip.appliesIn}</span> : null}
                <span>{tip.advice}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className={styles.footnote}>{text.footnote}</p>
    </section>
  );
}
