import type { Locale } from "@/domain/locale/locale";
import { htmlLang } from "@/domain/locale/locale";
import { packingList } from "@/domain/plan/outfit";
import type { RouteCity } from "@/domain/plan/plan-draft";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { PlanVersion } from "@/domain/plan/plan-run";
import { formatExactDate, parseExactDate } from "@/domain/trip-state/trip-dates";

import { basePixels, gridHeight, gridWidth } from "../../outfit-art";
import { itemName } from "../../plan-outfit-view";
import { PlanTransferCard } from "../../plan-transfer-card";
import { DayWeatherBadge, WeatherCredit } from "../../plan-weather";
import { dayWeather, forecastProviders } from "../../plan-weather-view";
import { HandbookCity } from "./handbook-city";
import { bookingText, dayLabel, HandbookDay } from "./handbook-day";
import styles from "./handbook.module.css";

const copy = {
  zh: {
    handbook: "旅行手册",
    noDates: "日期待定",
    version: (number: number) => `计划 v${number}`,
    outdated: "已过期",
    outdatedNote: "旅程已变更。请重新生成计划，再导出更新后的手册。",
    overview: "行程总览",
    route: "城市路线示意",
    days: (count: number) => `${count} 天`,
    contents: "目录",
    bookings: "预约提醒",
    travel: "往返与转场",
    noTransfers: "此计划没有保存往返或转场的交通安排。",
    packing: "打包清单",
    noPacking: "此计划没有保存穿搭建议，暂无对应的打包清单。",
    notes: "来源与备注",
    rollinggo: "酒店信息和图片来自 RollingGo；价格是参考价，以预订页面为准。Meri 不代订，也不收佣金。",
    independent: "Meri 是个人非商业项目。",
    checkOpening: "请在出发前确认开放时间和预约要求。",
  },
  en: {
    handbook: "Travel handbook",
    noDates: "Dates to be confirmed",
    version: (number: number) => `Plan v${number}`,
    outdated: "Outdated",
    outdatedNote: "Your journey has changed. Regenerate the plan, then export an updated handbook.",
    overview: "Journey overview",
    route: "City route sketch",
    days: (count: number) => `${count} ${count === 1 ? "day" : "days"}`,
    contents: "Contents",
    bookings: "Bookings to make",
    travel: "Getting there and back",
    noTransfers: "This plan has no saved arrangements for travel to, from, or between cities.",
    packing: "Packing list",
    noPacking: "This plan has no saved outfits to build a packing list from.",
    notes: "Sources and notes",
    rollinggo: "Hotel details and photos are from RollingGo. Prices are reference rates. Check the booking page for its price. Meri makes no bookings and takes no commission.",
    independent: "Meri is a personal, non-commercial project.",
    checkOpening: "Confirm opening hours and booking requirements before setting off.",
  },
} as const;

function coverDates(version: PlanVersion, locale: Locale): string {
  const dates = [version.tripState.startDate, version.tripState.endDate].map(parseExactDate)
    .flatMap((time) => time === null ? [] : [formatExactDate(time)]);
  return [...new Set(dates)].join(" – ") || copy[locale].noDates;
}

function Cover({ version, locale, stale }: { readonly version: PlanVersion; readonly locale: Locale; readonly stale: boolean }) {
  const text = copy[locale];
  const { tripState, plan } = version;
  return (
    <header className={styles.cover}>
      <div className={styles.coverTop}>
        <p className={styles.brand}>Meri</p>
        <p className={styles.version} data-stale={stale}>{text.version(version.version)}{stale ? ` · ${text.outdated}` : ""}</p>
      </div>
      <div className={styles.coverTitle}>
        <p className={styles.kicker}>{text.handbook}</p>
        <h1>{tripState.name.state === "missing" ? text.handbook : tripState.name.value}</h1>
        <p>{coverDates(version, locale)}</p>
      </div>
      <div className={styles.pandaPanel} aria-hidden="true">
        <svg className={styles.mountains} viewBox="0 0 600 300" preserveAspectRatio="xMidYMax slice">
          <circle cx="478" cy="76" r="34" fill="#e8c7a3" />
          <path d="M0 239 95 166 160 199 279 97 375 192 444 151 600 249V300H0Z" fill="#a9bca3" />
          <path d="M0 249 130 205 236 233 338 184 437 222 527 201 600 230V300H0Z" fill="#7d9a85" />
          <path d="M0 273 134 241 250 271 381 227 518 255 600 238V300H0Z" fill="#527764" />
        </svg>
        <svg className={styles.panda} viewBox={`0 0 ${gridWidth} ${gridHeight}`} shapeRendering="crispEdges">
          {basePixels.map(([x, y, width, height, fill], index) => <rect key={index} x={x} y={y} width={width} height={height} fill={fill} />)}
        </svg>
      </div>
      <p className={styles.coverRoute}>{plan.draft.route.cities.map(({ city }) => city).join(" → ")}</p>
      {stale ? <p className={styles.staleNote}>{text.outdatedNote}</p> : null}
    </header>
  );
}

/** A diagram of the route order only. Labels remain selectable in the PDF. */
function RouteSketch({ cities, locale }: { readonly cities: readonly RouteCity[]; readonly locale: Locale }) {
  return (
    <ol className={styles.routeSketch}>
      {cities.map(({ city, days, province }, index) => (
        <li key={`${province}-${city}-${index}`}>
          <svg width="24" height="34" viewBox="0 0 24 34" aria-hidden="true">
            {index > 0 ? <path d="M12 0v12" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
            {index + 1 < cities.length ? <path d="M12 22v12" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
            <circle cx="12" cy="17" r="5" fill="#edf1e8" stroke="currentColor" strokeWidth="2" />
          </svg>
          <strong>{city}</strong><span>{copy[locale].days(days)}</span>
        </li>
      ))}
    </ol>
  );
}

function Overview({ plan, locale }: { readonly plan: ReadyPlan; readonly locale: Locale }) {
  const text = copy[locale];
  const { draft, spots } = plan;
  const bookings = draft.days.flatMap((day) => day.stops.flatMap(({ spotId }) => {
    const spot = spots.find(({ id }) => id === spotId);
    const check = draft.checks?.find((item) => item.day === day.day && item.spotId === spotId);
    const booking = check ? check.reservation : spot?.availability?.reservation;
    if (!booking || ("required" in booking && !booking.required)) return [];
    return [{ day: day.day, spotId, name: spot?.name ?? spotId, daysAhead: booking.daysAhead }];
  }));
  return (
    <section className={styles.page}>
      <header className={styles.sectionHead}><h2>{text.overview}</h2></header>
      <div className={styles.overviewGroup}>
        <h3>{text.route}</h3>
        <RouteSketch cities={draft.route.cities} locale={locale} />
      </div>
      {bookings.length ? (
        <section className={styles.overviewGroup}>
          <h3>{text.bookings}</h3>
          <ul className={styles.bookings}>
            {bookings.map(({ day, spotId, name, daysAhead }) => (
              <li key={`${day}-${spotId}`}><a href={`#meri-day-${day}`}>{dayLabel(day, locale)} · {name}</a><span>{bookingText(daysAhead, locale)}</span></li>
            ))}
          </ul>
        </section>
      ) : null}
      <nav aria-label={text.contents} className={styles.overviewGroup}>
        <h3>{text.contents}</h3>
        <ol className={styles.toc}>
          {draft.days.map((day) => (
            <li key={day.day}>
              <a href={`#meri-day-${day.day}`}>
                <strong>{dayLabel(day.day, locale)}</strong><span>{day.city}{day.date ? ` · ${day.date}` : ""}</span>
                <DayWeatherBadge view={dayWeather(day, spots.filter(({ province }) => province === day.province))} locale={locale} />
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  );
}

function Packing({ plan, locale }: { readonly plan: ReadyPlan; readonly locale: Locale }) {
  const text = copy[locale];
  const { base, extras } = packingList(plan.draft.outfits ?? []);
  const items = [...base.map(({ id, days }) => ({ key: id, name: itemName(id, locale), days })), ...extras.map(({ name, days }) => ({ key: `extra-${name}`, name, days }))];
  return (
    <section className={styles.page}>
      <header className={styles.sectionHead}><h2>{text.packing}</h2></header>
      {items.length ? (
        <ul className={styles.packing}>
          {items.map(({ key, name, days }) => (
            <li key={key}><span className={styles.checkbox} aria-hidden="true" /><strong>{name}</strong>
              <span className={styles.muted}>{days.map((day) => dayLabel(day, locale)).join(locale === "zh" ? "、" : ", ")}</span>
            </li>
          ))}
        </ul>
      ) : <p>{text.noPacking}</p>}
      <section className={styles.notes}>
        <h3>{text.notes}</h3>
        {forecastProviders(plan.spots).length ? <WeatherCredit locale={locale} providers={forecastProviders(plan.spots)} /> : null}
        {plan.draft.stays?.some(({ status }) => status === "found") ? <p>{text.rollinggo}</p> : null}
        <p>{text.checkOpening}</p>
        <p>{text.independent}</p>
      </section>
    </section>
  );
}

export function PlanHandbook({ version, locale, stale }: { readonly version: PlanVersion; readonly locale: Locale; readonly stale: boolean }) {
  const text = copy[locale];
  const { plan, tripState } = version;
  const { draft } = plan;
  const cards = new Map(plan.spots.map((card) => [card.id, card]));
  const transport = tripState.transportPreference.state === "known" ? tripState.transportPreference.value : null;
  return (
    <main className={styles.handbook} lang={htmlLang(locale)}>
      <Cover version={version} locale={locale} stale={stale} />
      <Overview plan={plan} locale={locale} />
      {draft.days.map((day) => <HandbookDay key={day.day} day={day} plan={plan} cards={cards} locale={locale} transport={transport} />)}
      {draft.route.cities.map((city, index) => (
        <HandbookCity key={`${city.province}-${city.city}-${index}`} city={city} stays={draft.stays ?? []} food={draft.food ?? []}
          tips={plan.cities.find(({ province, city: name }) => province === city.province && name === city.city)?.tips ?? []}
          access={plan.cities.find(({ province, city: name }) => province === city.province && name === city.city)?.access ?? []} locale={locale} />
      ))}
      <section className={styles.page} id="meri-travel">
        <header className={styles.sectionHead}><h2>{text.travel}</h2></header>
        {draft.transfers?.length ? draft.transfers.map((leg, index) => (
          <div key={`${leg.kind}-${leg.day}-${index}`} className={styles.ticket}>
            <PlanTransferCard leg={leg} legDate={draft.days.find(({ day }) => day === leg.day)?.date ?? null}
              transport={transport} travelChoice={plan.travelChoice ?? null} locale={locale} />
          </div>
        )) : <p>{text.noTransfers}</p>}
      </section>
      <Packing plan={plan} locale={locale} />
    </main>
  );
}
