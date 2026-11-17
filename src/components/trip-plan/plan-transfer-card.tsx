import { Car, Home, MapPinned, Route } from "lucide-react";
import type { ReactNode } from "react";

import type { Locale } from "@/domain/locale/locale";
import type { TransferLeg, TravelChoice } from "@/domain/plan/transfer-legs";
import type { TransportPreference } from "@/domain/trip-draft/trip-draft";

import { transferEnds, transferLabel, transferText } from "./plan-transfer-text";
import draftStyles from "./plan-draft.module.css";

/**
 * One leg to, between or back from the trip's cities (1.2106): setting off before day 1 and
 * heading home after the last day as cards, a change of city as a slimmer strip between two days.
 * Both read as a ticket stub: the two places, the way between them, and the rough drive.
 */
export function PlanTransferCard({ leg, transport, travelChoice = null, locale, children = null }: {
  readonly leg: TransferLeg;
  /** The traveller's choice on the plan page, for the wording while trains and flights are not looked up (1.2107). */
  readonly travelChoice?: TravelChoice | null;
  /** The origin picker, inside the setting-off card while the origin is missing (1.2107). */
  readonly children?: ReactNode;
  readonly transport: TransportPreference | null;
  readonly locale: Locale;
}) {
  const { from, to } = transferEnds(leg, locale);
  const known = leg.estimate.status === "estimated";
  const Icon = known ? Car : Route;
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
      {children ?? <p className={draftStyles.transferText}>{transferText(leg, transport, locale, travelChoice)}</p>}
    </section>
  );
}
