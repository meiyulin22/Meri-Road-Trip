"use client";

import { CalendarDays, Car } from "lucide-react";
import { useRef, useState } from "react";

import { useLocale, useMessages } from "@/components/i18n/locale-context";
import { transportPreferences, type TransportPreference } from "@/domain/trip-draft/trip-draft";
import type { TripState } from "@/domain/trip-state/trip-state";

import { missingTripFields, type MissingTripField } from "./missing-fields-model";
import { TripDatesField } from "./trip-dates-editor";
import { createDirectTripStatePatch, requestTripStateUpdate } from "./trip-state-persistence-model";
import styles from "./trip-workspace.module.css";

const copy = {
  zh: { lead: "还可以告诉 Meri：", dates: "什么时候出发、玩几天", transport: "怎么去", saveFailed: "没能保存，请再试一次。" },
  en: { lead: "You can also tell Meri:", dates: "When and how long", transport: "How you travel", saveFailed: "Couldn't save that. Try again." },
} as const;

type Missing = MissingTripField;

/**
 * Buttons under Meri's newest plain reply for what the trip still lacks (merlin, 2026-11-22). They add
 * to the reply and never change it: Meri's words stay the model's, cards are left alone (the chat shows
 * these only under a reply without cards), and each button opens the same editor as the Journey panel.
 */
export function MissingFieldChips({ tripId, tripState, onTripStateChange }: {
  readonly tripId: string;
  readonly tripState: TripState;
  readonly onTripStateChange: (state: TripState) => void;
}) {
  const locale = useLocale();
  const words = useMessages();
  const text = copy[locale];
  const [open, setOpen] = useState<Missing | null>(null);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const missing = missingTripFields(tripState);
  if (missing.length === 0) return null;

  async function chooseTransport(value: TransportPreference): Promise<void> {
    if (saving.current) return;
    saving.current = true;
    try {
      onTripStateChange(await requestTripStateUpdate(tripId, createDirectTripStatePatch(tripState, "transportPreference", value)));
      setFailed(false);
      setOpen(null);
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
    }
  }

  return (
    <div className={styles.missingFields} data-region="missing-fields">
      <div className={styles.missingFieldChips}>
        <span>{text.lead}</span>
        {missing.map((field) => (
          <button key={field} type="button" aria-expanded={open === field} onClick={() => setOpen(open === field ? null : field)}>
            {field === "dates" ? <CalendarDays aria-hidden="true" size={14} /> : <Car aria-hidden="true" size={14} />}
            {field === "dates" ? text.dates : text.transport}
          </button>
        ))}
      </div>
      {open === "dates" ? (
        <div className={styles.missingFieldEditor}>
          <TripDatesField label={words.brief.fields.dates} tripId={tripId} tripState={tripState} onTripStateChange={onTripStateChange} />
        </div>
      ) : null}
      {open === "transport" ? (
        <div className={styles.missingFieldEditor}>
          <div className={styles.missingFieldOptions}>
            {transportPreferences.map((value) => (
              <button key={value} type="button" onClick={() => void chooseTransport(value)}>{words.brief.transport[value]}</button>
            ))}
          </div>
          {failed ? <p role="alert">{text.saveFailed}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
