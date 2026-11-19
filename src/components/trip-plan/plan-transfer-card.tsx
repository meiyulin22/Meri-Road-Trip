import { Car, ChevronDown, Home, MapPinned, Plane, Route, Sparkles, TrainFront } from "lucide-react";
import type { ReactNode } from "react";

import type { Locale } from "@/domain/locale/locale";
import type { FlightOption, TrainOption, TransferLeg, TravelChoice } from "@/domain/plan/transfer-legs";
import type { TransportPreference } from "@/domain/trip-draft/trip-draft";

import {
  changeCaption,
  changeSeats,
  changeTrains,
  changeWarning,
  driveSummary,
  flightCaption,
  flightChangeWarning,
  flightCharges,
  flightChecked,
  flightSeat,
  legDayLabel,
  otherWay,
  trainChecked,
  trainClock,
  trainReferenceNote,
  trainSeat,
  transferEnds,
  transferLabel,
  transferNote,
  transferText,
} from "./plan-transfer-text";
import styles from "./plan-transfer-card.module.css";

/**
 * One leg to, between or back from the trip's cities, as a ticket stub (1.2106, redrawn 1.2109):
 * the stub names the leg and its day; the body reads like a ticket, departure on the left and
 * arrival on the right with the way between them. A picked train shows its times and seat; a
 * drive its rough duration; a leg without either says why. Setting off and heading home are
 * full tickets; a change of city is a slimmer one tucked between two days. Nothing here books.
 */
export function PlanTransferCard({ leg, legDate = null, transport, travelChoice = null, locale, children = null }: {
  readonly leg: TransferLeg;
  /** The leg's own day, for the stub and for saying which day a reference timetable stands in for. */
  readonly legDate?: string | null;
  /** The traveller's choice on the plan page, for what a leg without trains says (1.2107). */
  readonly travelChoice?: TravelChoice | null;
  /** The origin picker, inside the setting-off ticket while the origin is missing (1.2107). */
  readonly children?: ReactNode;
  readonly transport: TransportPreference | null;
  readonly locale: Locale;
}) {
  const { from, to } = transferEnds(leg, locale);
  const label = transferLabel(leg.kind, locale);
  const trains = leg.trains && leg.recommendation ? leg.trains : null;
  const picked = leg.recommendation?.mode === "train" ? trains?.options.find(({ code }) => code === leg.recommendation?.trainCode) ?? null : null;
  const flight = leg.recommendation?.mode === "flight"
    ? leg.flights?.options.find(({ flightNo }) => flightNo === leg.recommendation?.flightNo) ?? null : null;
  const drive = driveSummary(leg, transport, locale);
  const mode = flight ? "flight" : picked ? "train" : drive ? "drive" : "none";
  const found = Boolean(leg.recommendation && (leg.trains || leg.flights));
  const KindIcon = leg.kind === "between" ? MapPinned : Home;
  return (
    <section className={styles.ticket} data-kind={leg.kind} data-mode={mode} aria-label={`${label}: ${from} → ${to}`}>
      <div className={styles.stub}>
        <span className={styles.kind}><KindIcon aria-hidden="true" size={13} />{label}</span>
        {legDate ? <span className={styles.day}>{legDayLabel(legDate, locale)}</span> : null}
      </div>
      <div className={styles.body}>
        <div className={styles.way}>
          {flight ? (
            <>
              <End place={from} missing={false} time={flight.departs} station={flight.fromAirport} />
              <Between leg={leg} picked={null} flight={flight} drive={drive} locale={locale} />
              <End place={to} missing={false} time={flight.arrives} nextDay={flight.arriveDayOffset > 0 ? (locale === "zh" ? "次日" : "+1d") : null}
                station={flight.toAirport} alignEnd />
            </>
          ) : (
            <>
              <End place={from} missing={leg.from === null} time={picked?.departs ?? null} station={picked ? ownStation(picked.from, from) : null} />
              <Between leg={leg} picked={picked} flight={null} drive={drive} locale={locale} />
              <End place={to} missing={leg.to === null} time={picked ? trainClock(picked, locale).arrives : null}
                nextDay={picked ? trainClock(picked, locale).nextDay : null} station={picked ? ownStation(picked.to, to) : null} alignEnd />
            </>
          )}
        </div>
        {children ?? (!found ? <DriveDetails leg={leg} drive={drive} transport={transport} travelChoice={travelChoice} locale={locale} />
          : flight || !trains ? <FlightDetails leg={leg} picked={flight} drive={drive} locale={locale} />
            : <TrainDetails leg={leg} picked={picked} legDate={legDate} drive={drive} locale={locale} />)}
      </div>
    </section>
  );
}

/** A train's station worth naming under the city: 上海虹桥 under 上海市, but not 丽江 under 丽江市. */
function ownStation(station: string, place: string): string | null {
  return place.startsWith(station) ? null : station;
}

function End({ place, missing, time, nextDay = null, station, alignEnd = false }: {
  readonly place: string;
  readonly missing: boolean;
  readonly time: string | null;
  readonly nextDay?: string | null;
  /** The train's own station, when it is not just the city's name: 上海虹桥. */
  readonly station: string | null;
  readonly alignEnd?: boolean;
}) {
  return (
    <div className={styles.end} data-align={alignEnd ? "end" : "start"}>
      {time ? <span className={styles.time}>{time}{nextDay ? <sup>{nextDay}</sup> : null}</span> : null}
      <span className={styles.place} data-missing={missing}>{place}</span>
      {station ? <span className={styles.station}>{station}</span> : null}
    </div>
  );
}

/** The middle of the ticket: the line between the ends, and what travels it. */
function Between({ leg, picked, flight, drive, locale }: {
  readonly leg: TransferLeg;
  readonly picked: TrainOption | null;
  readonly flight: FlightOption | null;
  readonly drive: ReturnType<typeof driveSummary>;
  readonly locale: Locale;
}) {
  const Icon = flight ? Plane : picked ? TrainFront : drive ? Car : Route;
  // A flight names its number and time; a journey with a change the city and both trains; a direct train its number and time.
  const flown = flight ? flightCaption(flight, locale) : null;
  const caption = flown ? flown.caption
    : picked ? changeCaption(picked, locale) ?? `${picked.code} · ${trainClock(picked, locale).duration}` : drive ? drive.headline : null;
  const subcaption = flown ? flown.note
    : picked ? changeTrains(picked, locale) : leg.estimate.status === "estimated" ? drive?.detail ?? null : null;
  return (
    <div className={styles.between} data-known={Boolean(flight || picked || drive)} data-change={Boolean(picked?.change || flight?.change)}>
      <span className={styles.line} aria-hidden="true"><Icon size={15} /></span>
      {caption ? <span className={styles.caption}>{caption}</span> : null}
      {subcaption ? <span className={styles.subcaption}>{subcaption}</span> : null}
    </div>
  );
}

/**
 * Trains found for a leg (1.2108): the seat and Meri's reason for the pick, the others folded in a
 * small timetable, the drive as a reference, and where the times came from. A reference timetable
 * is flagged before anything else, since its times are not yet on sale.
 */
function TrainDetails({ leg, picked, legDate, drive, locale }: {
  readonly leg: TransferLeg;
  readonly picked: TrainOption | null;
  readonly legDate: string | null;
  readonly drive: ReturnType<typeof driveSummary>;
  readonly locale: Locale;
}) {
  const zh = locale === "zh";
  const trains = leg.trains;
  const recommendation = leg.recommendation;
  if (!trains || !recommendation) return null;
  const others = trains.options.filter((train) => train !== picked);
  const reference = trainReferenceNote(trains, legDate, locale);
  const seat = picked ? changeSeats(picked, trains.reference, locale) ?? trainSeat(picked, trains.reference, locale) : null;
  const crossTown = picked ? changeWarning(picked, locale) : null;
  return (
    <div className={styles.details}>
      {reference ? <p className={styles.reference}>{zh ? "参考车次" : "Reference"}<span>{reference}</span></p> : null}
      {crossTown ? <p className={styles.reference}>{zh ? "跨站换乘" : "Change of station"}<span>{crossTown}</span></p> : null}
      <div className={styles.facts}>
        {seat ? <span className={styles.seat}>{seat}</span> : null}
        {!picked ? <span className={styles.seat} data-drive="true"><Car aria-hidden="true" size={12} />{zh ? "这段建议开车" : "Driving suits this leg"}</span> : null}
        {recommendation.reason ? (
          <span className={styles.reason}>
            {recommendation.by === "agent" ? <Sparkles aria-hidden="true" size={12} /> : null}{recommendation.reason}
          </span>
        ) : null}
      </div>
      {others.length > 0 ? (
        <details className={styles.others}>
          <summary><ChevronDown aria-hidden="true" size={13} />{zh ? `其他 ${others.length} 趟` : `${others.length} more ${others.length === 1 ? "train" : "trains"}`}</summary>
          <table>
            <tbody>
              {others.map((train) => {
                const clock = trainClock(train, locale);
                return (
                  <tr key={train.code}>
                    <th scope="row">{train.code}</th>
                    <td>{clock.departs} → {clock.arrives}{clock.nextDay ? <sup>{clock.nextDay}</sup> : null}</td>
                    <td>{clock.duration}</td>
                    <td>{train.change ? changeTrains(train, locale) : trainSeat(train, trains.reference, locale) ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      ) : null}
      <p className={styles.meta}>
        {otherWay(leg, "train", locale) ? <span><Plane aria-hidden="true" size={11} />{otherWay(leg, "train", locale)}</span> : null}
        {drive && picked ? <span><Car aria-hidden="true" size={11} />{drive.headline} · {drive.detail}</span> : null}
        <span>{trainChecked(trains, locale)}</span>
      </p>
    </div>
  );
}

/**
 * Flights found for a leg (1.2111): the cheapest cabin with its fare and seats, the airport and fuel
 * charges said apart, Meri's reason, the other flights folded, trains and the drive as references,
 * and where the fares came from. When Meri suggests driving instead, the flights stay listed.
 */
function FlightDetails({ leg, picked, drive, locale }: {
  readonly leg: TransferLeg;
  readonly picked: FlightOption | null;
  readonly drive: ReturnType<typeof driveSummary>;
  readonly locale: Locale;
}) {
  const zh = locale === "zh";
  const flights = leg.flights;
  const recommendation = leg.recommendation;
  if (!flights || !recommendation) return null;
  const others = flights.options.filter((flight) => flight !== picked);
  const charges = picked ? flightCharges(picked, locale) : null;
  const other = otherWay(leg, "flight", locale);
  const otherAirport = picked ? flightChangeWarning(picked, locale) : null;
  return (
    <div className={styles.details}>
      {otherAirport ? <p className={styles.reference}>{zh ? "换机场转机" : "Change of airport"}<span>{otherAirport}</span></p> : null}
      <div className={styles.facts}>
        {picked ? <span className={styles.seat}>{flightSeat(picked, locale)}</span> : (
          <span className={styles.seat} data-drive="true"><Car aria-hidden="true" size={12} />{zh ? "这段建议开车" : "Driving suits this leg"}</span>
        )}
        {charges ? <span className={styles.charges}>{charges}</span> : null}
        {recommendation.reason ? (
          <span className={styles.reason}>
            {recommendation.by === "agent" ? <Sparkles aria-hidden="true" size={12} /> : null}{recommendation.reason}
          </span>
        ) : null}
      </div>
      {others.length > 0 ? (
        <details className={styles.others}>
          <summary><ChevronDown aria-hidden="true" size={13} />{zh ? `其他 ${others.length} 班` : `${others.length} more ${others.length === 1 ? "flight" : "flights"}`}</summary>
          <table>
            <tbody>
              {others.map((flight) => (
                <tr key={flight.flightNo}>
                  <th scope="row">{flight.flightNo}</th>
                  <td>{flight.departs} → {flight.arrives}{flight.arriveDayOffset > 0 ? <sup>{zh ? "次日" : "+1d"}</sup> : null}</td>
                  <td>{flightCaption(flight, locale).caption.split(" · ")[1]}</td>
                  <td>{flightSeat(flight, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
      <p className={styles.meta}>
        {other ? <span><TrainFront aria-hidden="true" size={11} />{other}</span> : null}
        {drive ? <span><Car aria-hidden="true" size={11} />{drive.headline} · {drive.detail}</span> : null}
        <span>{flightChecked(flights, locale)}</span>
      </p>
    </div>
  );
}

/** A leg without trains: its rough drive's detail and one note, or why there is no time at all. */
function DriveDetails({ leg, drive, transport, travelChoice, locale }: {
  readonly leg: TransferLeg;
  readonly drive: ReturnType<typeof driveSummary>;
  readonly transport: TransportPreference | null;
  readonly travelChoice: TravelChoice | null;
  readonly locale: Locale;
}) {
  const note = transferNote(leg, travelChoice, locale);
  if (drive) return note ? <div className={styles.details}><p className={styles.note}>{note}</p></div> : null;
  return <div className={styles.details}><p className={styles.note} data-tone="muted">{transferText(leg, transport, locale, travelChoice)}</p></div>;
}
