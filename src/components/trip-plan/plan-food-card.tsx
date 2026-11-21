"use client";

import { Check, ChevronDown, Copy, ExternalLink, MapPin, Soup, Utensils } from "lucide-react";
import { useState } from "react";

import type { Locale } from "@/domain/locale/locale";
import type { CityFood, Dish, FoodEvidence, Restaurant } from "@/domain/plan/food";

import styles from "./plan-food-card.module.css";

const copy = {
  zh: {
    title: "吃什么",
    dishes: "当地特色",
    restaurants: "推荐餐厅",
    mentioned: "文章里提到的",
    mentionedNote: "两个以上网站都推荐，但地图上没找到这家，地址待查。",
    order: (dish: string) => `招牌：${dish}`,
    distance: (metres: number, near: string) => (metres < 1000 ? `离${near} ${metres} m` : `离${near} ${(metres / 1000).toFixed(1)} km`),
    addressUnknown: "地址待查",
    copy: "复制店名",
    copied: "已复制",
    map: "在地图上看",
    sources: (count: number) => `${count} 个出处`,
    none: "这次没查到当地美食的可靠出处。",
    unavailable: "当地美食暂时查不到。",
    disclaimer: "来自公开网页搜索，Meri 不收商家任何费用，已尽量排除推广内容。口味因人而异，营业时间出发前请再确认。",
  },
  en: {
    title: "What to eat",
    dishes: "Local dishes",
    restaurants: "Restaurants",
    mentioned: "Mentioned in articles",
    mentionedNote: "Recommended by two or more sites, but not found on the map; address to check.",
    order: (dish: string) => `Order: ${dish}`,
    distance: (metres: number, near: string) => (metres < 1000 ? `${metres} m from ${near}` : `${(metres / 1000).toFixed(1)} km from ${near}`),
    addressUnknown: "Address to check",
    copy: "Copy name",
    copied: "Copied",
    map: "Show on map",
    sources: (count: number) => `${count} ${count === 1 ? "source" : "sources"}`,
    none: "No reliable sources about local food came up this time.",
    unavailable: "Local food couldn't be looked up just now.",
    disclaimer: "From public web search. Meri takes no payment from any business and filters out promotion as far as it can. Tastes differ; check opening hours before you go.",
  },
} as const;

type Copy = (typeof copy)[Locale];

function Sources({ evidence, text }: { readonly evidence: readonly FoodEvidence[]; readonly text: Copy }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.sources}>
      <button type="button" className={styles.sourceToggle} aria-expanded={open} onClick={() => setOpen(!open)}>
        {text.sources(evidence.length)}<ChevronDown aria-hidden="true" size={12} data-open={open} />
      </button>
      {open ? (
        <ul>
          {evidence.map((item) => (
            <li key={item.url}>
              <q>{item.quote}</q>
              <a href={item.url} target="_blank" rel="noopener noreferrer">{item.site}<ExternalLink aria-hidden="true" size={11} /></a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DishItem({ dish, text }: { readonly dish: Dish; readonly text: Copy }) {
  return (
    <li className={styles.dish}>
      <span className={styles.dishName}>{dish.name}</span>
      <span className={styles.dishNote}>{dish.note}</span>
      <Sources evidence={[dish.evidence]} text={text} />
    </li>
  );
}

function RestaurantItem({ restaurant, text, onShowOnMap }: {
  readonly restaurant: Restaurant;
  readonly text: Copy;
  readonly onShowOnMap: (restaurant: Restaurant) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(restaurant.name);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // The name stays on the page to copy by hand.
    }
  };
  const { place } = restaurant;
  return (
    <li className={styles.restaurant} data-placed={place !== null}>
      <div className={styles.restaurantHead}>
        <span className={styles.restaurantName}>{restaurant.name}</span>
        {restaurant.dish ? <span className={styles.order}>{text.order(restaurant.dish)}</span> : null}
      </div>
      {place ? (
        <p className={styles.line}><MapPin aria-hidden="true" size={12} />{place.address ?? ""}{place.address ? " · " : ""}{text.distance(place.distanceM, place.near)}</p>
      ) : <p className={styles.line} data-unknown="true"><MapPin aria-hidden="true" size={12} />{text.addressUnknown}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={() => void copyName()}>
          {copied ? <Check aria-hidden="true" size={12} /> : <Copy aria-hidden="true" size={12} />}{copied ? text.copied : text.copy}
        </button>
        {place ? (
          <button type="button" className={styles.action} onClick={() => onShowOnMap(restaurant)}><MapPin aria-hidden="true" size={12} />{text.map}</button>
        ) : null}
        <Sources evidence={restaurant.evidence} text={text} />
      </div>
    </li>
  );
}

/**
 * What to eat in one city (1.2117 food), after its last day: local dishes with their source,
 * restaurants found on the map near the stops, and below them restaurants two sites recommend that
 * the map did not find, marked "address to check". A city with nothing reliable shows nothing.
 */
export function PlanFoodCard({ food, locale, onShowOnMap }: {
  readonly food: CityFood;
  readonly locale: Locale;
  readonly onShowOnMap: (restaurant: Restaurant) => void;
}) {
  const text = copy[locale];
  if (food.status !== "found") return null;
  return (
    <section className={styles.card} aria-label={`${text.title} · ${food.city}`}>
      <header className={styles.header}>
        <span className={styles.icon}><Utensils aria-hidden="true" size={16} /></span>
        <h3>{text.title} · {food.city}</h3>
      </header>
      {food.dishes.length > 0 ? (
        <div className={styles.block}>
          <h4><Soup aria-hidden="true" size={13} />{text.dishes}</h4>
          <ul className={styles.dishes}>{food.dishes.map((dish) => <DishItem key={dish.name} dish={dish} text={text} />)}</ul>
        </div>
      ) : null}
      {food.restaurants.length > 0 ? (
        <div className={styles.block}>
          <h4><Utensils aria-hidden="true" size={13} />{text.restaurants}</h4>
          <ul className={styles.restaurants}>
            {food.restaurants.map((restaurant) => <RestaurantItem key={restaurant.name} restaurant={restaurant} text={text} onShowOnMap={onShowOnMap} />)}
          </ul>
        </div>
      ) : null}
      {food.mentioned.length > 0 ? (
        <div className={styles.block} data-kind="mentioned">
          <h4>{text.mentioned}</h4>
          <p className={styles.note}>{text.mentionedNote}</p>
          <ul className={styles.restaurants}>
            {food.mentioned.map((restaurant) => <RestaurantItem key={restaurant.name} restaurant={restaurant} text={text} onShowOnMap={onShowOnMap} />)}
          </ul>
        </div>
      ) : null}
      <p className={styles.footnote}>{text.disclaimer}</p>
    </section>
  );
}
