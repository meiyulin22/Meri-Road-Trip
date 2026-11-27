"use client";

import { BedDouble, Check, ChevronDown, Copy, ExternalLink, MapPin, Phone, Sparkles } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import type { Locale } from "@/domain/locale/locale";
import type { CityStay, HotelOption, StayPick, StayTier } from "@/domain/plan/stays";
import { hotelPreviewUrl } from "@/platform/hotel/hotel-photos";

import { AddDatesButton } from "./plan-dates-picker";
import styles from "./plan-stay-card.module.css";

const copy = {
  zh: {
    title: "住哪里",
    nights: (nights: number) => `${nights} 晚`,
    checkIn: (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日入住`,
    near: (name: string, kind: "spot" | "city") => (kind === "spot" ? `在${name}附近 3 km 内` : `在${name}`),
    areaNote: (area: string, features: readonly string[]) =>
      `Meri 的整理：${area}一带适合住${features.length ? `，多是${features.slice(0, 3).join("、")}` : ""}`,
    otherAreas: (areas: string) => `也可以住：${areas}`,
    tiers: { budget: "经济", comfort: "舒适", luxury: "高档" } satisfies Record<StayTier, string>,
    recommended: "Meri 推荐",
    perNight: (amount: number) => `¥${amount}/晚`,
    total: (amount: number, nights: number) => `${nights} 晚约 ¥${amount}`,
    noPrice: "暂无参考价",
    distance: (metres: number, name: string) => (metres < 1000 ? `离${name} ${metres} m` : `离${name} ${(metres / 1000).toFixed(1)} km`),
    copy: "复制酒店名",
    copied: "已复制",
    map: "在地图上看",
    details: "详情",
    phone: "电话",
    times: (checkIn: string | null, checkOut: string | null) => [checkIn ? `${checkIn} 后入住` : null, checkOut ? `${checkOut} 前退房` : null].filter(Boolean).join(" · "),
    none: "这附近没有查到酒店。出发前在常用的订房平台搜一下附近的住处。",
    unavailable: "住宿暂时查不到。出发前在常用的订房平台搜一下附近的住处。",
    preview: "在 RollingGo 查看（第三方页面）",
    photo: (index: number, total: number) => `第 ${index} 张，共 ${total} 张`,
    howToBook: "也可以在你常用的订房平台搜酒店名。",
    disclaimer: "Meri 是个人作品，不收费、不卖广告。酒店链接是第三方页面，Meri 不收佣金，也不代订。价格是参考价，以预订页面为准。酒店信息和图片来自 RollingGo。",
  },
  en: {
    title: "Where to stay",
    nights: (nights: number) => `${nights} ${nights === 1 ? "night" : "nights"}`,
    checkIn: (date: string) => `check in ${date.slice(5)}`,
    near: (name: string, kind: "spot" | "city") => (kind === "spot" ? `within 3 km of ${name}` : `in ${name}`),
    areaNote: (area: string) => `Meri's notes: ${area} is a good area to stay`,
    otherAreas: (areas: string) => `Also good to stay: ${areas}`,
    tiers: { budget: "Budget", comfort: "Comfort", luxury: "Luxury" } satisfies Record<StayTier, string>,
    recommended: "Meri's pick",
    perNight: (amount: number) => `¥${amount}/night`,
    total: (amount: number, nights: number) => `about ¥${amount} for ${nights} ${nights === 1 ? "night" : "nights"}`,
    noPrice: "No reference price",
    distance: (metres: number, name: string) => (metres < 1000 ? `${metres} m from ${name}` : `${(metres / 1000).toFixed(1)} km from ${name}`),
    copy: "Copy name",
    copied: "Copied",
    map: "Show on map",
    details: "Details",
    phone: "Phone",
    times: (checkIn: string | null, checkOut: string | null) => [checkIn ? `check in from ${checkIn}` : null, checkOut ? `out by ${checkOut}` : null].filter(Boolean).join(" · "),
    none: "No hotels came up near here. Look on your usual booking site before you go.",
    unavailable: "Hotels couldn't be looked up just now. Look on your usual booking site before you go.",
    preview: "View on RollingGo (third-party page)",
    photo: (index: number, total: number) => `Photo ${index} of ${total}`,
    howToBook: "You can also search the hotel's name on your usual booking site.",
    disclaimer: "Meri is a personal project: free, with no ads. Hotel links go to a third-party page; Meri takes no commission and makes no bookings. Prices are reference rates; the booking page's price stands. Hotel details and photos from RollingGo.",
  },
} as const;

type Copy = (typeof copy)[Locale];

function Stars({ star }: { readonly star: number | null }) {
  if (star === null) return null;
  return (
    <span className={styles.stars} aria-label={`${star}★`}>
      {Array.from({ length: 5 }, (_, index) => <i key={index} data-on={index < Math.round(star)} />)}
    </span>
  );
}

/** One hotel: photo, name, stars, reference price, distance, and what to do with it. */
/** Up to five photos to swipe through, the search's cover first, with a dot for each. */
function Gallery({ photos, label, kind, text }: {
  readonly photos: readonly string[];
  readonly label: string;
  readonly kind: "tier" | "pick";
  readonly text: Copy;
}) {
  const [shown, setShown] = useState(0);
  return (
    <div className={styles.photo}>
      {photos.length === 0 ? <BedDouble aria-hidden="true" size={26} /> : (
        <div className={styles.strip} tabIndex={0} aria-label={text.photo(shown + 1, photos.length)}
          onScroll={(event) => {
            const strip = event.currentTarget;
            setShown(Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth)));
          }}>
          {photos.map((url, index) => (
            <span key={url} className={styles.slide}>
              <Image src={url} alt="" fill sizes="(max-width: 900px) 160px, 320px" priority={false} loading={index === 0 ? "eager" : "lazy"} />
            </span>
          ))}
        </div>
      )}
      <span className={styles.tierChip} data-kind={kind}>{kind === "pick" ? <Sparkles aria-hidden="true" size={11} /> : null}{label}</span>
      {photos.length > 1 ? (
        <span className={styles.dots} aria-hidden="true">{photos.map((url, index) => <i key={url} data-on={index === shown} />)}</span>
      ) : null}
    </div>
  );
}

function HotelTile({ pick, label, kind, nights, nearName, checkIn, text, onShowOnMap }: {
  readonly pick: StayPick;
  readonly checkIn: string;
  readonly label: string;
  readonly kind: "tier" | "pick";
  readonly nights: number;
  readonly nearName: string;
  readonly text: Copy;
  readonly onShowOnMap: (hotel: HotelOption) => void;
}) {
  const { hotel, detail } = pick;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(hotel.name);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // A browser that refuses the clipboard still shows the name to copy by hand.
    }
  };
  // The search's cover, then the hotel page's photos, without repeats (the page adds a size suffix).
  const photos = [...new Set([hotel.image, ...(detail?.images ?? [])].filter((url): url is string => url !== null))]
    .filter((url, index, all) => !all.some((other, at) => at < index && (other.startsWith(url) || url.startsWith(other))))
    .slice(0, 5);
  const times = detail ? text.times(detail.checkIn, detail.checkOut) : "";

  return (
    <article className={styles.tile} data-kind={kind}>
      <Gallery photos={photos} label={label} kind={kind} text={text} />
      <div className={styles.body}>
        <h4 className={styles.name}>{hotel.name}</h4>
        <div className={styles.meta}>
          <Stars star={hotel.star} />
          {hotel.pricePerNight ? (
            <span className={styles.price}>
              <b>{text.perNight(hotel.pricePerNight.amount)}</b>
              {nights > 1 ? <span>{text.total(hotel.pricePerNight.amount * nights, nights)}</span> : null}
            </span>
          ) : <span className={styles.noPrice}>{text.noPrice}</span>}
        </div>
        {hotel.distanceM !== null ? <p className={styles.line}><MapPin aria-hidden="true" size={12} />{text.distance(hotel.distanceM, nearName)}</p> : null}
        <p className={styles.address}>{hotel.address}</p>
        <div className={styles.actions}>
          <button type="button" onClick={() => void copyName()} className={styles.action}>
            {copied ? <Check aria-hidden="true" size={12} /> : <Copy aria-hidden="true" size={12} />}{copied ? text.copied : text.copy}
          </button>
          <button type="button" onClick={() => onShowOnMap(hotel)} className={styles.action}><MapPin aria-hidden="true" size={12} />{text.map}</button>
          <a className={styles.action} href={hotelPreviewUrl(hotel.id, checkIn, nights)} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" size={12} />{text.preview}
          </a>
          {detail ? (
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={styles.action}>
              {text.details}<ChevronDown aria-hidden="true" size={12} className={styles.chevron} data-open={open} />
            </button>
          ) : null}
        </div>
        {open && detail ? (
          <div className={styles.details}>
            {detail.phone ? <p className={styles.line}><Phone aria-hidden="true" size={12} />{text.phone} {detail.phone}</p> : null}
            {times ? <p className={styles.line}>{times}</p> : null}
            {detail.district ? <p className={styles.line}>{detail.district}</p> : null}
            {detail.facilities.length > 0 ? (
              <ul className={styles.facilities}>{detail.facilities.map((facility) => <li key={facility}>{facility}</li>)}</ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Where to stay, when the plan has no dates (1.2117 stays): hotels are searched for the stay's
 * nights, so without dates there is nothing to search; the card says what is missing.
 */
export function PlanStayHint({ locale, onAddDates }: { readonly locale: Locale; readonly onAddDates?: () => void }) {
  const zh = locale === "zh";
  return (
    <section className={styles.card} aria-label={copy[locale].title}>
      <header className={styles.header}>
        <span className={styles.icon}><BedDouble aria-hidden="true" size={16} /></span>
        <div>
          <h3>{copy[locale].title}</h3>
          <p>{zh ? "填了出发日期，才能按每晚的日期查酒店和参考价。" : "Add a start date to look up hotels and reference prices for each night."}</p>
          {onAddDates ? <AddDatesButton locale={locale} onClick={onAddDates} solid /> : null}
        </div>
      </header>
    </section>
  );
}

/**
 * Where to stay in one city (1.2117 stays), after its last day: three tiers picked by code, and
 * Meri's pick for the traveller's preferences when they bear on lodging. No booking link: the name
 * is there to copy, the place to see on the map, the price a reference.
 */
export function PlanStayCard({ stay, locale, onShowOnMap }: {
  readonly stay: CityStay;
  readonly locale: Locale;
  readonly onShowOnMap: (hotel: HotelOption) => void;
}) {
  const text = copy[locale];
  return (
    <section className={styles.card} aria-label={`${text.title} · ${stay.city}`}>
      <header className={styles.header}>
        <span className={styles.icon}><BedDouble aria-hidden="true" size={16} /></span>
        <div>
          <h3>{text.title} · {stay.city}</h3>
          <p>{text.nights(stay.nights)} · {text.checkIn(stay.checkIn)} · {text.near(stay.near.name, stay.near.kind)}</p>
        </div>
      </header>
      {/* Why here, and where else, from Meri's catalog (RAG step 5): Chinese notes, so Chinese plans only. */}
      {locale === "zh" && (stay.near.area || stay.otherAreas?.length) ? (
        <div className={styles.areas}>
          {stay.near.area ? <p>{text.areaNote(stay.near.area.name, stay.near.area.features)}</p> : null}
          {stay.otherAreas?.length ? (
            <p className={styles.otherAreas}>{text.otherAreas(stay.otherAreas.map(({ name, features }) =>
              features.length ? `${name}（${features.slice(0, 2).join("、")}）` : name).join("、"))}</p>
          ) : null}
        </div>
      ) : null}
      {stay.status !== "found" ? <p className={styles.empty}>{stay.status === "none" ? text.none : text.unavailable}</p> : (
        <>
          {stay.recommended ? (
            <div className={styles.pick}>
              <p className={styles.reason}><Sparkles aria-hidden="true" size={13} />{stay.recommended.reason}</p>
              <HotelTile pick={stay.recommended} label={text.recommended} kind="pick" nights={stay.nights} checkIn={stay.checkIn} nearName={stay.near.name} text={text} onShowOnMap={onShowOnMap} />
            </div>
          ) : null}
          <div className={styles.tiers}>
            {/* A tier that is also Meri's pick shows once, as the pick. */}
            {stay.tiers.filter((tier) => tier.hotel.id !== stay.recommended?.hotel.id).map((tier) => (
              <HotelTile key={tier.hotel.id} pick={tier} label={text.tiers[tier.tier]} kind="tier" nights={stay.nights} checkIn={stay.checkIn} nearName={stay.near.name} text={text} onShowOnMap={onShowOnMap} />
            ))}
          </div>
          <p className={styles.footnote}>{text.disclaimer} {text.howToBook}</p>
        </>
      )}
    </section>
  );
}
