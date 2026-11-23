import type { Locale } from "@/domain/locale/locale";
import type { CityFood, FoodEvidence, Restaurant } from "@/domain/plan/food";
import type { RouteCity } from "@/domain/plan/plan-draft";
import type { CityStay, StayPick } from "@/domain/plan/stays";

import { HotelPhoto, sourceLink } from "./handbook-photos";
import styles from "./handbook.module.css";

const copy = {
  zh: {
    city: "城市指南",
    stay: "住哪里",
    food: "吃什么",
    checkIn: (date: string, nights: number) => `${date} 入住 · ${nights} 晚`,
    tiers: { budget: "经济", comfort: "舒适", luxury: "高档" },
    pick: "Meri 推荐",
    star: (value: number) => `${value} 星`,
    price: (value: string) => `参考价 ${value} / 晚`,
    noPrice: "暂无参考价",
    distance: (distance: string, near: string) => `离${near} ${distance}`,
    address: "地址",
    phone: "电话",
    noStays: "此计划没有保存这座城市的住宿建议。",
    noHotels: "这附近没有查到酒店。",
    unavailableHotels: "住宿暂时查不到。",
    noFood: "此计划没有保存这座城市的餐饮信息。",
    foodUnavailable: "餐饮信息暂时查不到。",
    dishes: "当地菜",
    restaurants: "餐厅",
    mentioned: "文章里提到的 · 未核实",
    unverified: "地址待核实",
  },
  en: {
    city: "City guide",
    stay: "Where to stay",
    food: "What to eat",
    checkIn: (date: string, nights: number) => `Check in ${date} · ${nights} ${nights === 1 ? "night" : "nights"}`,
    tiers: { budget: "Budget", comfort: "Comfort", luxury: "Luxury" },
    pick: "Meri's pick",
    star: (value: number) => `${value}-star`,
    price: (value: string) => `Reference price ${value} / night`,
    noPrice: "No reference price",
    distance: (distance: string, near: string) => `${distance} from ${near}`,
    address: "Address",
    phone: "Phone",
    noStays: "This plan has no saved stays for this city.",
    noHotels: "No hotels came up near here.",
    unavailableHotels: "Hotels couldn't be looked up just now.",
    noFood: "This plan has no saved food information for this city.",
    foodUnavailable: "Food information couldn't be looked up just now.",
    dishes: "Local dishes",
    restaurants: "Restaurants",
    mentioned: "Mentioned in articles · Unverified",
    unverified: "Address to check",
  },
} as const;

function distanceLabel(metres: number): string {
  return metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;
}

function Hotel({ pick, label, stay, locale, reason }: {
  readonly pick: StayPick;
  readonly label: string;
  readonly stay: CityStay;
  readonly locale: Locale;
  readonly reason?: string;
}) {
  const { hotel, detail } = pick;
  const text = copy[locale];
  const price = hotel.pricePerNight;
  const rate = price ? `${price.currency === "CNY" ? "¥" : `${price.currency} `}${price.amount}` : null;
  return (
    <li className={styles.cityEntry}>
      <HotelPhoto urls={[hotel.image, ...(detail?.images ?? [])]} />
      <h4><span className={styles.tier}>{label}</span> {hotel.name}</h4>
      <p>{hotel.star === null ? null : `${text.star(hotel.star)} · `}{rate ? text.price(rate) : text.noPrice}</p>
      {reason ? <p>{reason}</p> : null}
      {hotel.address ? <p><strong>{text.address}</strong> · {hotel.address}</p> : null}
      {detail?.phone ? <p><strong>{text.phone}</strong> · {detail.phone}</p> : null}
      {hotel.distanceM !== null ? <p className={styles.muted}>{text.distance(distanceLabel(hotel.distanceM), stay.near.name)}</p> : null}
    </li>
  );
}

function Stay({ stay, locale }: { readonly stay: CityStay; readonly locale: Locale }) {
  const text = copy[locale];
  return (
    <div className={styles.cityGroup}>
      <p className={styles.muted}>{text.checkIn(stay.checkIn, stay.nights)}</p>
      {stay.status === "found" ? (
        <ul>
          {stay.recommended ? <Hotel pick={stay.recommended} label={text.pick} stay={stay} locale={locale} reason={stay.recommended.reason} /> : null}
          {stay.tiers.map((pick) => <Hotel key={pick.tier} pick={pick} label={text.tiers[pick.tier]} stay={stay} locale={locale} />)}
        </ul>
      ) : <p>{stay.status === "none" ? text.noHotels : text.unavailableHotels}</p>}
    </div>
  );
}

function FoodSources({ sources }: { readonly sources: readonly FoodEvidence[] }) {
  return <p className={styles.sourceLinks}>{sources.map((source, index) => (
    <a key={`${source.url}-${index}`} className={styles.source} href={sourceLink(source.url)}>{source.site}</a>
  ))}</p>;
}

function RestaurantList({ restaurants, heading, locale }: {
  readonly restaurants: readonly Restaurant[];
  readonly heading: string;
  readonly locale: Locale;
}) {
  if (restaurants.length === 0) return null;
  const text = copy[locale];
  return (
    <div className={styles.cityGroup}>
      <h4>{heading}</h4>
      <ul>{restaurants.map(({ name, dish, place, evidence }) => (
        <li key={name} className={styles.cityEntry}>
          <p><strong>{name}</strong>{dish ? ` · ${dish}` : ""}</p>
          {place ? <p>{place.address ? `${place.address} · ` : ""}{text.distance(distanceLabel(place.distanceM), place.near)}</p>
            : <p className={styles.muted}>{text.unverified}</p>}
          <FoodSources sources={evidence} />
        </li>
      ))}</ul>
    </div>
  );
}

function Food({ food, locale }: { readonly food: CityFood; readonly locale: Locale }) {
  const text = copy[locale];
  if (food.status !== "found") return <p>{food.status === "unavailable" ? text.foodUnavailable : text.noFood}</p>;
  return (
    <>
      {food.dishes.length ? (
        <div className={styles.cityGroup}>
          <h4>{text.dishes}</h4>
          <ul>{food.dishes.map(({ name, note, evidence }) => (
            <li key={name} className={styles.cityEntry}>
              <p><strong>{name}</strong> · {note}</p>
              <FoodSources sources={[evidence]} />
            </li>
          ))}</ul>
        </div>
      ) : null}
      <RestaurantList restaurants={food.restaurants} heading={text.restaurants} locale={locale} />
      <RestaurantList restaurants={food.mentioned} heading={text.mentioned} locale={locale} />
    </>
  );
}

export function HandbookCity({ city, stays, food, locale }: {
  readonly city: RouteCity;
  readonly stays: readonly CityStay[];
  readonly food: readonly CityFood[];
  readonly locale: Locale;
}) {
  const text = copy[locale];
  const staysHere = stays.filter((stay) => stay.city === city.city && stay.province === city.province);
  const foodHere = food.filter((result) => result.city === city.city && result.province === city.province);
  return (
    <section className={styles.page}>
      <header className={styles.sectionHead}>
        <p className={styles.kicker}>{text.city} · {city.province}</p>
        <h2>{city.city}</h2>
      </header>
      <section className={styles.citySection}>
        <h3>{text.stay}</h3>
        {staysHere.length ? staysHere.map((stay) => <Stay key={stay.firstDay} stay={stay} locale={locale} />) : <p>{text.noStays}</p>}
      </section>
      <section className={styles.citySection}>
        <h3>{text.food}</h3>
        {foodHere.length ? foodHere.map((result) => <Food key={result.lastDay} food={result} locale={locale} />) : <p>{text.noFood}</p>}
      </section>
    </section>
  );
}
