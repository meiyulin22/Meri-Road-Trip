"use client";

import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, ExternalLink, Snowflake, Sun, TriangleAlert } from "lucide-react";

import type { Locale } from "@/domain/locale/locale";
import type { WeatherSky } from "@/domain/plan/weather";

import type { DayWeatherView, WeatherLine } from "./plan-weather-view";
import draftStyles from "./plan-draft.module.css";
import styles from "./trip-plan.module.css";

const skyIcon: Record<WeatherSky, typeof Sun> = {
  clear: Sun, cloudy: CloudSun, overcast: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: Snowflake, thunderstorm: CloudLightning,
};

/** A sky's icon, for other parts of the plan that show the day's weather (1.2117 outfit). */
export function SkyIcon({ sky, size }: { readonly sky: WeatherSky; readonly size: number }) {
  const Icon = skyIcon[sky];
  return <Icon aria-hidden="true" size={size} />;
}

type Reason = WeatherLine["reasons"][number];

const copy = {
  en: {
    sky: { clear: "Clear", cloudy: "Partly cloudy", overcast: "Overcast", fog: "Fog", drizzle: "Drizzle", rain: "Rain", snow: "Snow", thunderstorm: "Thunderstorm" } satisfies Record<WeatherSky, string>,
    reasons: { thunderstorm: "thunderstorms", heavy_rain: "heavy rain", heavy_snow: "heavy snow", gale: "gale-force gusts" } satisfies Record<Reason, string>,
    forecast: "Forecast",
    rain: (mm: number) => `${mm} mm rain`,
    beyond: "Too far ahead for a forecast: check again before you go.",
    stopForecast: "Here that day",
    poor: (reasons: string) => `Not good for being outdoors: ${reasons}.`,
    disclaimer: "Weather is a forecast; check again before you set off.",
  },
  zh: {
    sky: { clear: "晴", cloudy: "多云", overcast: "阴", fog: "雾", drizzle: "小雨", rain: "雨", snow: "雪", thunderstorm: "雷阵雨" } satisfies Record<WeatherSky, string>,
    reasons: { thunderstorm: "雷暴", heavy_rain: "大雨", heavy_snow: "大雪", gale: "8 级以上阵风" } satisfies Record<Reason, string>,
    forecast: "预报",
    rain: (mm: number) => `降水 ${mm} mm`,
    beyond: "日期太远，还没有预报，出发前再看预报。",
    stopForecast: "该处当天",
    poor: (reasons: string) => `不宜户外：${reasons}。`,
    disclaimer: "天气为预报，出发前请再查看。",
  },
} as const;

function joined(locale: Locale, items: readonly string[]): string {
  return items.join(locale === "zh" ? "、" : ", ");
}

/** The sky, the temperatures and any rain worth saying, in one run of text. */
function lineText(line: WeatherLine, locale: Locale): string {
  const text = copy[locale];
  return [text.sky[line.sky], `${line.low}°–${line.high}°`, ...(line.rainMm >= 1 ? [text.rain(line.rainMm)] : [])].join(" · ");
}

/** The day's weather on its collapsed header: an icon and the day's range. */
export function DayWeatherBadge({ view, locale }: { readonly view: DayWeatherView; readonly locale: Locale }) {
  if (view?.kind !== "forecast") return null;
  const Icon = skyIcon[view.line.sky];
  return (
    <span className={styles.weatherBadge} title={lineText(view.line, locale)}>
      <Icon aria-label={copy[locale].sky[view.line.sky]} size={15} />
      {view.line.low}°–{view.line.high}°
    </span>
  );
}

/** The day's weather at the top of the open card, or "look again before you go" past the forecast. */
export function DayWeatherLine({ view, locale }: { readonly view: DayWeatherView; readonly locale: Locale }) {
  if (view === null) return null;
  const text = copy[locale];
  if (view.kind === "beyond") return <p className={draftStyles.weatherLine} data-kind="beyond">{text.beyond}</p>;
  const Icon = skyIcon[view.line.sky];
  return (
    <p className={draftStyles.weatherLine} data-outdoor={view.line.outdoor}>
      <Icon aria-hidden="true" size={15} />
      <span>{text.forecast} · {lineText(view.line, locale)}</span>
      {view.line.outdoor === "poor" ? <span className={draftStyles.weatherPoor}>{text.poor(joined(locale, view.line.reasons.map((reason) => text.reasons[reason])))}</span> : null}
    </p>
  );
}

/** An outdoor stop's own forecast, when it differs from the day's or is poor. */
export function StopWeatherLine({ line, locale }: { readonly line: WeatherLine | null; readonly locale: Locale }) {
  if (line === null) return null;
  const text = copy[locale];
  const Icon = line.outdoor === "poor" ? TriangleAlert : skyIcon[line.sky];
  return (
    <p className={draftStyles.stopWeather} data-outdoor={line.outdoor}>
      <Icon aria-hidden="true" size={12} />
      {text.stopForecast} · {lineText(line, locale)}
      {line.outdoor === "poor" ? ` · ${joined(locale, line.reasons.map((reason) => text.reasons[reason]))}` : ""}
    </p>
  );
}

/** Open-Meteo's required credit and the forecast's caveat, wherever the plan shows weather (agreed 2026-11-20). */
export function WeatherCredit({ locale }: { readonly locale: Locale }) {
  return (
    <p className={draftStyles.weatherCredit}>
      <span>{copy[locale].disclaimer}</span>
      <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
        Weather data by Open-Meteo.com<ExternalLink aria-hidden="true" size={11} />
      </a>
    </p>
  );
}
