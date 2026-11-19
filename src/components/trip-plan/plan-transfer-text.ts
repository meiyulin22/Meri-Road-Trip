import type { Locale } from "@/domain/locale/locale";
import {
  type FlightOption, type LegFlights, type LegTrains, longDriveMinutes, type TrainOption, type TransferKind, type TransferLeg, type TravelChoice,
} from "@/domain/plan/transfer-legs";
import type { TransportPreference } from "@/domain/trip-draft/trip-draft";

const kindLabel = {
  zh: { outbound: "启程", between: "转场", return: "回程" },
  en: { outbound: "Setting off", between: "Changing city", return: "Heading home" },
} as const satisfies Record<Locale, Record<TransferKind, string>>;

export function transferLabel(kind: TransferKind, locale: Locale): string {
  return kindLabel[locale][kind];
}

/** The two ends of a leg, with a word for an origin not written yet. */
export function transferEnds(leg: TransferLeg, locale: Locale): { readonly from: string; readonly to: string } {
  const home = locale === "zh" ? "出发地" : "Home";
  return { from: leg.from ?? home, to: leg.to ?? home };
}

/**
 * A drive's length as people say it: minutes under an hour, otherwise hours and the minutes
 * rounded to ten, since it is a rough estimate (2 小时 40 分钟, 2 h 40 min).
 */
export function driveDuration(minutes: number, locale: Locale): string {
  if (minutes < 60) return locale === "zh" ? `${minutes} 分钟` : `${minutes} min`;
  const rounded = Math.round(minutes / 10) * 10;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (locale === "zh") return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * What a leg card says (1.2106): a rough drive between the two places, worded for a self-driver
 * or as "by road" otherwise, with a word that a long one may suit a train or flight; or, when
 * there is no time, why, in plain words. It never names a train or a flight it has not found.
 */
export function transferText(
  leg: TransferLeg, transport: TransportPreference | null, locale: Locale, travelChoice: TravelChoice | null = null,
): string {
  const zh = locale === "zh";
  const { estimate } = leg;
  // What happened to a train or flight the traveller wanted, said first, with the drive as a reference (1.2107–1.2108).
  const missing = leg.trainsMissing === "none" ? (zh ? "这段没查到合适的直达车次（可能要中转）" : "No suitable direct train for this leg (a change may be needed)")
    : leg.trainsMissing === "no_station" ? (zh ? "这段有一头没有火车站" : "One end of this leg has no railway station")
      : leg.trainsMissing === "unavailable" ? (zh ? "车次暂时查不到" : "Trains couldn't be looked up just now")
        : leg.trainsMissing === "off" ? (zh ? "没有开启火车查询" : "Train search isn't switched on")
        : leg.flightsMissing === "off" ? (zh ? "没有开启航班查询" : "Flight search isn't switched on")
        : leg.flightsMissing === "none" ? (zh ? "这段没查到航班" : "No flight found for this leg")
          : leg.flightsMissing === "unavailable" ? (zh ? "航班暂时查不到" : "Flights couldn't be looked up just now")
            : travelChoice === "flight" ? (zh ? "你选了飞机，航班暂时查不到" : "You chose to fly; flights can't be looked up just now")
              : null;
  const chosen = missing ? (zh ? `${missing}；先给开车参考：` : `${missing}. For reference: `) : "";
  switch (estimate.status) {
    case "estimated": {
      const time = driveDuration(estimate.durationMinutes, locale);
      const base = zh
        ? `${transport === "self_drive" ? "开车" : "车程"}约 ${time} · ${estimate.distanceKm} 公里（估算）`
        : `About ${time} ${transport === "self_drive" ? "by car" : "by road"} · ${estimate.distanceKm} km (estimate)`;
      if (chosen || estimate.durationMinutes <= longDriveMinutes) return chosen + base;
      return zh ? `${base}，路程较远，可以考虑火车或飞机` : `${base}; a long way, so a train or flight may suit better`;
    }
    case "origin_missing":
      return leg.kind === "return"
        ? (zh ? "出发地还没写，在上面的启程卡里填写后一起估算" : "No starting point yet; fill it in on the setting-off card above")
        : (zh ? "出发地还没写，这段暂不估算" : "No starting point yet, so this leg isn't estimated");
    case "origin_uncertain":
      return zh ? `出发地还不确定（${leg.kind === "return" ? leg.to : leg.from}），这段暂不估算`
        : `The starting point is only roughly known (${leg.kind === "return" ? leg.to : leg.from}), so this leg isn't estimated`;
    case "same_city":
      return zh ? "就在同一座城，不用转场" : "Same city, no transfer needed";
    case "not_found":
      return zh ? `地图上没找到「${estimate.place}」，这段暂不估算` : `“${estimate.place}” isn't on the map, so this leg isn't estimated`;
    case "no_route":
      return zh ? "地图上找不到开车的路" : "No road between them on the map";
    case "not_looked_up":
      return zh ? "车程还没查到" : "Drive time not looked up yet";
  }
}

/** A timetable's duration, exact to the minute: 2 小时 22 分, 2 h 22 min. */
function trainDuration(minutes: number, zh: boolean): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return zh ? `${rest} 分` : `${rest} min`;
  if (rest === 0) return zh ? `${hours} 小时` : `${hours} h`;
  return zh ? `${hours} 小时 ${rest} 分` : `${hours} h ${rest} min`;
}

/** How many seats are left, in 12306's own terms: 有 is plenty, 无 none, a number the count. */
function seatsLeft(left: string, zh: boolean): string | null {
  if (left === "有") return zh ? "有票" : "available";
  if (left === "无") return zh ? "无票" : "sold out";
  if (/^\d+$/u.test(left)) return zh ? `剩 ${left} 张` : `${left} left`;
  return null;
}

/**
 * One train as a line (1.2108): number, times and stations, duration, and the cheapest seat with
 * its price and, for a real day, what is left. A reference train has no seats to speak of yet.
 */
export function trainLine(train: TrainOption, reference: boolean, locale: Locale): string {
  const zh = locale === "zh";
  const nextDay = train.arriveDayOffset > 0 ? (zh ? `（+${train.arriveDayOffset} 天）` : ` (+${train.arriveDayOffset}d)`) : "";
  const times = `${train.departs} ${train.from} → ${train.arrives}${nextDay} ${train.to}`;
  const seat = [...train.seats].filter(({ price }) => price !== null).sort((left, right) => (left.price ?? 0) - (right.price ?? 0))[0];
  const left = seat && !reference ? seatsLeft(seat.left, zh) : null;
  const price = seat ? `${seat.name} ¥${seat.price}${left ? ` ${left}` : ""}` : null;
  return [train.code, times, trainDuration(train.durationMinutes, zh), price]
    .filter(Boolean).join(" · ");
}

const shortDate = (date: string, locale: Locale) => new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
  month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC",
}).format(new Date(`${date}T00:00:00Z`));

/** Where the trains came from and when; a reference day says it is only the timetable (1.2108). */
export function trainSource(trains: LegTrains, legDate: string | null, locale: Locale): string {
  const zh = locale === "zh";
  const checked = new Intl.DateTimeFormat(zh ? "zh-CN" : "en", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai",
  }).format(new Date(trains.checkedAt));
  const source = zh ? `来自 12306 · ${checked} 查询` : `From 12306 · checked ${checked}`;
  if (!trains.reference) return source;
  const asked = shortDate(trains.queriedDate, locale);
  const day = legDate ? shortDate(legDate, locale) : null;
  return zh
    ? `参考车次：${day ?? "出行日"}还没开售，这是 ${asked} 的时刻表，开售后再确认 · ${source}`
    : `Reference only: ${day ?? "the day"} isn't on sale yet, so this is ${asked}'s timetable; check again once it is · ${source}`;
}

/*
 * The pieces a ticket-stub card lays out on its own (1.2109): the same facts as the lines above,
 * split so times, durations and prices can sit where a reader looks for them.
 */

/** A leg's day as the stub prints it: 12/21 周一, Mon 12/21. */
export function legDayLabel(date: string, locale: Locale): string {
  return shortDate(date, locale);
}

/** A train's clock: departure, arrival with a next-day mark, and the exact duration. */
export function trainClock(train: TrainOption, locale: Locale): {
  readonly departs: string; readonly arrives: string; readonly nextDay: string | null; readonly duration: string;
} {
  const zh = locale === "zh";
  return {
    departs: train.departs,
    arrives: train.arrives,
    nextDay: train.arriveDayOffset === 0 ? null
      : zh ? (train.arriveDayOffset === 1 ? "次日" : `+${train.arriveDayOffset}天`) : `+${train.arriveDayOffset}d`,
    duration: trainDuration(train.durationMinutes, zh),
  };
}

/** The cheapest seat with its price, and, for a real day, what is left: 二等座 ¥80 · 有票. */
export function trainSeat(train: TrainOption, reference: boolean, locale: Locale): string | null {
  const zh = locale === "zh";
  const seat = [...train.seats].filter(({ price }) => price !== null).sort((left, right) => (left.price ?? 0) - (right.price ?? 0))[0];
  if (!seat) return null;
  const left = reference ? null : seatsLeft(seat.left, zh);
  return `${seat.name} ¥${seat.price}${left ? ` · ${left}` : ""}`;
}

/** A rough drive as a headline and its detail: 约 2 小时 40 分钟 / 186 公里 · 估算. Null when there is no time. */
export function driveSummary(leg: TransferLeg, transport: TransportPreference | null, locale: Locale): {
  readonly headline: string; readonly detail: string;
} | null {
  if (leg.estimate.status !== "estimated") return null;
  const zh = locale === "zh";
  const time = driveDuration(leg.estimate.durationMinutes, locale);
  const by = transport === "self_drive" ? (zh ? "开车" : "by car") : (zh ? "车程" : "by road");
  return zh
    ? { headline: `${by}约 ${time}`, detail: `${leg.estimate.distanceKm} 公里 · 估算` }
    : { headline: `About ${time} ${by}`, detail: `${leg.estimate.distanceKm} km · estimate` };
}

/**
 * The one sentence a leg without trains needs besides its drive: what happened to the train or
 * flight that was wanted, or, for a long drive, that a train or flight may suit better.
 */
export function transferNote(leg: TransferLeg, travelChoice: TravelChoice | null, locale: Locale): string | null {
  const zh = locale === "zh";
  if (leg.trainsMissing === "none") return zh ? "这段没查到合适的直达车次，可能要中转" : "No suitable direct train for this leg; a change may be needed";
  if (leg.trainsMissing === "no_station") return zh ? "这段有一头没有火车站" : "One end of this leg has no railway station";
  if (leg.trainsMissing === "unavailable") return zh ? "车次暂时查不到" : "Trains couldn't be looked up just now";
  if (leg.trainsMissing === "off") return zh ? "没有开启火车查询" : "Train search isn't switched on";
  if (leg.flightsMissing === "off") return zh ? "没有开启航班查询" : "Flight search isn't switched on";
  if (leg.flightsMissing === "none") return zh ? "这段没查到航班" : "No flight found for this leg";
  if (leg.flightsMissing === "unavailable") return zh ? "航班暂时查不到" : "Flights couldn't be looked up just now";
  if (travelChoice === "flight") return zh ? "你选了飞机，航班暂时查不到" : "You chose to fly; flights can't be looked up just now";
  if (leg.estimate.status === "estimated" && leg.estimate.durationMinutes > longDriveMinutes) {
    return zh ? "路程较远，可以考虑火车或飞机" : "A long way: a train or flight may suit better";
  }
  return null;
}

/** When and where the trains were looked up: 12306 · 11/17 21:30. */
export function trainChecked(trains: LegTrains, locale: Locale): string {
  const zh = locale === "zh";
  const checked = new Intl.DateTimeFormat(zh ? "zh-CN" : "en", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai",
  }).format(new Date(trains.checkedAt));
  return zh ? `12306 · ${checked} 查询` : `12306 · checked ${checked}`;
}

/** A reference timetable said plainly: which day it stands in for, and that it must be checked again. */
export function trainReferenceNote(trains: LegTrains, legDate: string | null, locale: Locale): string | null {
  if (!trains.reference) return null;
  const zh = locale === "zh";
  const asked = shortDate(trains.queriedDate, locale);
  const day = legDate ? shortDate(legDate, locale) : null;
  return zh ? `${day ?? "出行日"}还没开售，这是 ${asked} 的时刻表，开售后再确认`
    : `${day ?? "The day"} isn't on sale yet; this is ${asked}'s timetable, so check again once it is`;
}

/*
 * A journey with one change (1.2110): where, how long the wait, each train's seat, and a word when
 * the change means crossing the city to another station.
 */

/** The middle of the ticket: 在昆明换乘 · 共 30 小时 10 分 / Change at 昆明 · 30 h 10 min in all. */
export function changeCaption(train: TrainOption, locale: Locale): string | null {
  if (!train.change) return null;
  const zh = locale === "zh";
  const total = trainDuration(train.durationMinutes, zh);
  return zh ? `在${train.change.city}换乘 · 共 ${total}` : `Change at ${train.change.city} · ${total} in all`;
}

/** The two trains and the wait between them: Z162 → D8761 · 等 1 小时 30 分. */
export function changeTrains(train: TrainOption, locale: Locale): string | null {
  if (!train.change) return null;
  const zh = locale === "zh";
  const wait = trainDuration(train.change.waitMinutes, zh);
  return `${train.change.first.code} → ${train.change.second.code} · ${zh ? `等 ${wait}` : `${wait} wait`}`;
}

/** Each train's cheapest seat: Z162 硬卧 ¥568 · D8761 二等座 ¥80. */
export function changeSeats(train: TrainOption, reference: boolean, locale: Locale): string | null {
  if (!train.change) return null;
  const parts = [train.change.first, train.change.second].flatMap((part) => {
    const seat = trainSeat(part, reference, locale);
    return seat ? [`${part.code} ${seat}`] : [];
  });
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** A change across the city, said plainly, since the ride between stations is not in the times. */
export function changeWarning(train: TrainOption, locale: Locale): string | null {
  if (!train.change || train.change.sameStation) return null;
  const { city, first, second, waitMinutes } = train.change;
  const zh = locale === "zh";
  const wait = trainDuration(waitMinutes, zh);
  return zh ? `要在${city}从${first.to}站换到${second.from}站，市内交通另算，换乘时间共 ${wait}`
    : `In ${city} the change is from ${first.to} to ${second.from} station; the ride across town is not included (${wait} to change)`;
}

/*
 * Flights (1.2111): the same ticket, with airports under the cities, the cheapest cabin and its
 * fare, the airport and fuel charges said apart, and VariFlight as the source.
 */

/**
 * The middle of a plane ticket: 9C6733 · 4 小时 15 分, and a stop or codeshare when there is one. A change
 * of plane (1.2113) reads like a change of train: 在成都转机 · 共 6 小时 30 分, then MU9181 → MU5780 · 等 1 小时 50 分.
 */
export function flightCaption(flight: FlightOption, locale: Locale): { readonly caption: string; readonly note: string | null } {
  const zh = locale === "zh";
  if (flight.change) {
    const { city, first, second, waitMinutes } = flight.change;
    const total = trainDuration(flight.durationMinutes, zh);
    const wait = trainDuration(waitMinutes, zh);
    return {
      caption: zh ? `在${city}转机 · 共 ${total}` : `Change planes at ${city} · ${total} in all`,
      note: `${first.flightNo} → ${second.flightNo} · ${zh ? `等 ${wait}` : `${wait} wait`}`,
    };
  }
  const notes = [
    flight.stopCity ? (zh ? `经停${flight.stopCity}` : `stops at ${flight.stopCity}`) : null,
    flight.codeshare ? (zh ? "代码共享" : "codeshare") : null,
  ].filter(Boolean);
  return { caption: `${flight.flightNo} · ${trainDuration(flight.durationMinutes, zh)}`, note: notes.length > 0 ? notes.join(" · ") : null };
}

/**
 * The cheapest cabin, its fare and seats left: 经济舱 ¥460 · 剩 9 张. A change of plane is two tickets,
 * so it says so rather than passing the sum off as one fare: 两段分开买 ¥1130 · 剩 4 张.
 */
export function flightSeat(flight: FlightOption, locale: Locale): string {
  const zh = locale === "zh";
  const left = flight.seatsLeft === null ? null : zh ? `剩 ${flight.seatsLeft} 张` : `${flight.seatsLeft} left`;
  const fare = flight.change ? (zh ? `两段分开买 ¥${flight.price}` : `two tickets, ¥${flight.price}`) : `${flight.cabin} ¥${flight.price}`;
  return `${fare}${left ? ` · ${left}` : ""}`;
}

/** A change to the city's other airport, said plainly, since the ride between them is not in the times. */
export function flightChangeWarning(flight: FlightOption, locale: Locale): string | null {
  if (!flight.change || flight.change.sameAirport) return null;
  const { first, second, waitMinutes } = flight.change;
  const zh = locale === "zh";
  const wait = trainDuration(waitMinutes, zh);
  return zh ? `${first.toAirport}落地，${second.fromAirport}起飞，要换机场，市内交通另算，换乘时间共 ${wait}`
    : `Lands at ${first.toAirport}, leaves from ${second.fromAirport}: a change of airport, the ride across town not included (${wait} to change)`;
}

/** Airport and fuel charges on top of the fare, said apart so the fare is not mistaken for the total. */
export function flightCharges(flight: FlightOption, locale: Locale): string | null {
  if (flight.charges === null) return null;
  return locale === "zh" ? `另付机建燃油约 ¥${flight.charges}` : `plus about ¥${flight.charges} airport and fuel charges`;
}

/** When and where the fares were looked up: 飞常准 · 11/18 14:30 查询. */
export function flightChecked(flights: LegFlights, locale: Locale): string {
  const zh = locale === "zh";
  const checked = new Intl.DateTimeFormat(zh ? "zh-CN" : "en", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai",
  }).format(new Date(flights.checkedAt));
  return zh ? `飞常准 · ${checked} 查询` : `VariFlight · checked ${checked}`;
}

/** The other way, in one line, so a train and a flight can be compared: 也有航班：最快 4 小时 15 分，¥460 起. */
export function otherWay(leg: TransferLeg, shown: "train" | "flight", locale: Locale): string | null {
  const zh = locale === "zh";
  if (shown === "train" && leg.flights && leg.flights.options.length > 0) {
    const quickest = Math.min(...leg.flights.options.map(({ durationMinutes }) => durationMinutes));
    const cheapest = Math.min(...leg.flights.options.map(({ price }) => price));
    return zh ? `也有航班：最快 ${trainDuration(quickest, zh)}，¥${cheapest} 起` : `Flights too: from ${trainDuration(quickest, zh)}, from ¥${cheapest}`;
  }
  if (shown === "flight" && leg.trains && leg.trains.options.length > 0) {
    const quickest = Math.min(...leg.trains.options.map(({ durationMinutes }) => durationMinutes));
    return zh ? `火车参考：最快 ${trainDuration(quickest, zh)}` : `By train: from ${trainDuration(quickest, zh)}`;
  }
  return null;
}
