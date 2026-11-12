"use client";

import { Info, Plus, X } from "lucide-react";
import { useState } from "react";

import { useLocale, useMessages } from "@/components/i18n/locale-context";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";

import { addPreferences, readAddedPreferences, saveAddedPreferences, type AddedPreference } from "./plan-memories-model";
import { PreferenceSheet } from "./plan-preferences";
import memoryStyles from "./plan-memories.module.css";
import styles from "./trip-plan.module.css";

const copy = {
  en: {
    unavailable: "Meri couldn’t read your preferences from the conversation. You can add them here.",
    empty: "Nothing yet. Tell Meri your pace, how much walking suits you, who’s coming along, or anything to avoid.",
    pending: "New preferences don’t change the days below. Meri will use them the next time you adjust the plan.",
  },
  zh: {
    unavailable: "这次没能从对话里提取偏好，可以在这里自己添加。",
    empty: "还没有记下偏好。可以告诉 Meri 你的节奏、能走多少路、和谁同行，或者不想去什么地方。",
    pending: "新加的偏好不会改动下面的行程，下次调整行程时 Meri 会用上。",
  },
} as const;

/**
 * What Meri remembers for this plan: the preferences found in the conversation at the
 * handoff, and those the traveller adds here. Added ones are kept apart and wait for the
 * next change to the plan; they never re-plan the current days on their own.
 */
export function PlanMemories({ tripId, handoff }: { readonly tripId: string; readonly handoff: PlanHandoff }) {
  const locale = useLocale();
  const words = useMessages();
  const text = copy[locale];
  const [added, setAdded] = useState<readonly AddedPreference[]>(() => readAddedPreferences(tripId));
  const [sheetOpen, setSheetOpen] = useState(false);
  const extracted = handoff.preferenceStatus === "ready" ? handoff.preferences : [];

  function update(next: readonly AddedPreference[]) {
    setAdded(next);
    saveAddedPreferences(tripId, next);
  }

  return (
    <section className={memoryStyles.memories} aria-labelledby="plan-preferences-heading">
      <div className={memoryStyles.header}>
        <h2 id="plan-preferences-heading">{words.plan.memoriesTitle}</h2>
        <button type="button" className={styles.addPreference} onClick={() => setSheetOpen(true)}>
          <Plus aria-hidden="true" size={13} />{words.plan.addPreference}
        </button>
      </div>

      {extracted.length + added.length === 0 ? (
        <p className={memoryStyles.hint}>{handoff.preferenceStatus === "unavailable" ? text.unavailable : text.empty}</p>
      ) : (
        <ul className={memoryStyles.chips}>
          {extracted.map(({ messageId, quote }) => (
            <li key={`${messageId}:${quote}`} title={words.plan.youSaid(quote)}>{quote}</li>
          ))}
          {added.map((preference) => (
            <li key={preference.id} data-added="true" title={words.plan.addedByYou}>
              {preference.text}
              <button type="button" aria-label={words.plan.forget(preference.text)}
                onClick={() => update(added.filter(({ id }) => id !== preference.id))}>
                <X aria-hidden="true" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {added.length > 0 ? (
        <p className={memoryStyles.pending}><Info aria-hidden="true" size={13} />{text.pending}</p>
      ) : null}

      <PreferenceSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSave={(texts) => {
        update(addPreferences(added, texts, extracted.map(({ quote }) => quote), new Date(), () => crypto.randomUUID()));
        setSheetOpen(false);
      }} />
    </section>
  );
}
