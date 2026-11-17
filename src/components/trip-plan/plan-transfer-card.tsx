import { Car, Home, MapPinned, Route, TrainFront } from "lucide-react";
import type { ReactNode } from "react";

import type { Locale } from "@/domain/locale/locale";
import type { TransferLeg, TravelChoice } from "@/domain/plan/transfer-legs";
import type { TransportPreference } from "@/domain/trip-draft/trip-draft";

import { trainLine, trainSource, transferEnds, transferLabel, transferText } from "./plan-transfer-text";
import draftStyles from "./plan-draft.module.css";

/**
 * One leg to, between or back from the trip's cities (1.2106): setting off before day 1 and
 * heading home after the last day as cards, a change of city as a slimmer strip between two days.
 * Both read as a ticket stub: the two places, the way between them, and the rough drive.
 */
export function PlanTransferCard({ leg, legDate = null, transport, travelChoice = null, locale, children = null }: {
  readonly leg: TransferLeg;
  /** The leg's own day, for saying which day a reference timetable stands in for. */
  readonly legDate?: string | null;
  /** The traveller's choice on the plan page, for the wording while trains and flights are not looked up (1.2107). */
  readonly travelChoice?: TravelChoice | null;
  /** The origin picker, inside the setting-off card while the origin is missing (1.2107). */
  readonly children?: ReactNode;
  readonly transport: TransportPreference | null;
  readonly locale: Locale;
}) {
  const { from, to } = transferEnds(leg, locale);
  const known = leg.estimate.status === "estimated";
  const byTrain = leg.recommendation?.mode === "train";
  const Icon = byTrain ? TrainFront : known ? Car : Route;
  const label = transferLabel(leg.kind, locale);
  return (
    <section className={draftStyles.transfer} data-kind={leg.kind} data-known={known} aria-label={`${label}: ${from} → ${to}`}>
      <span className={draftStyles.transferLabel}>
        {leg.kind === "between" ? <MapPinned aria-hidden="true" size={13} /> : <Home aria-hidden="true" size={13} />}
        {label}
      </span>
      <div className={draftStyles.transferWay}>
        <span className={draftStyles.transferPlace} data-missing={leg.from === null}>{from}</span>
        <span className={draftStyles.transferLine} aria-hidden="true"><Icon size={14} /></span>
        <span className={draftStyles.transferPlace} data-missing={leg.to === null}>{to}</span>
      </div>
      {children ?? (leg.trains && leg.recommendation ? (
        <TrainChoice leg={leg} legDate={legDate} transport={transport} locale={locale} />
      ) : <p className={draftStyles.transferText}>{transferText(leg, transport, locale, travelChoice)}</p>)}
    </section>
  );
}

/**
 * The trains found for a leg (1.2108): the pick first with its reason, the others a click away,
 * the drive as a reference, and where the times came from. Information only: nothing here books.
 */
function TrainChoice({ leg, legDate, transport, locale }: {
  readonly leg: TransferLeg;
  readonly legDate: string | null;
  readonly transport: TransportPreference | null;
  readonly locale: Locale;
}) {
  const zh = locale === "zh";
  const trains = leg.trains;
  const recommendation = leg.recommendation;
  if (!trains || !recommendation) return null;
  const picked = trains.options.find(({ code }) => code === recommendation.trainCode) ?? null;
  const others = trains.options.filter((train) => train !== picked);
  return (
    <div className={draftStyles.trainChoice}>
      {picked ? (
        <p className={draftStyles.trainPick}><TrainFront aria-hidden="true" size={13} />{trainLine(picked, trains.reference, locale)}</p>
      ) : (
        <p className={draftStyles.trainPick}><Car aria-hidden="true" size={13} />{zh ? "建议开车" : "Driving suits this leg"}</p>
      )}
      {recommendation.reason ? <p className={draftStyles.trainReason}>{recommendation.reason}</p> : null}
      {others.length > 0 ? (
        <details className={draftStyles.trainOthers}>
          <summary>{zh ? `其他 ${others.length} 趟` : `${others.length} more`}</summary>
          <ul>{others.map((train) => <li key={train.code}>{trainLine(train, trains.reference, locale)}</li>)}</ul>
        </details>
      ) : null}
      {leg.estimate.status === "estimated" ? (
        <p className={draftStyles.trainMeta}>{zh ? "开车参考：" : "By road: "}{transferText({ ...leg, kind: "between" }, transport, locale)}</p>
      ) : null}
      <p className={draftStyles.trainMeta} data-reference={trains.reference}>{trainSource(trains, legDate, locale)}</p>
    </div>
  );
}
