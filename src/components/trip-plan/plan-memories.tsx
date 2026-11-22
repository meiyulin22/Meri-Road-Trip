"use client";

import { Info, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { useLocale, useMessages } from "@/components/i18n/locale-context";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import { maxPreferenceQuoteLength, type PlanPreference } from "@/domain/plan/trip-preference";

import { addPreference, kindOfSuggestion, listPreferences, removePreference } from "./plan-preferences-model";
import memoryStyles from "./plan-memories.module.css";

const copy = {
  en: {
    unavailable: "Meri couldn’t read your preferences from the conversation. You can add them here.",
    empty: "Nothing yet. Tell Meri your pace, how much walking suits you, who’s coming along, or anything to avoid.",
    pending: "New preferences don’t change the days below. Meri will use them the next time you adjust the plan.",
    saving: "Saving…",
    failed: "Couldn’t save that. Try again.",
    inputLabel: "Something for Meri to remember",
    remember: "Remember",
  },
  zh: {
    unavailable: "这次没能从对话里提取偏好，可以在这里自己添加。",
    empty: "还没有记下偏好。可以告诉 Meri 你的节奏、能走多少路、和谁同行，或者不想去什么地方。",
    pending: "新加的偏好不会改动下面的行程，下次调整行程时 Meri 会用上。",
    saving: "保存中…",
    failed: "没能保存，请再试一次。",
    inputLabel: "想让 Meri 记住的事",
    remember: "记下",
  },
} as const;

/**
 * What Meri remembers for this trip. Each preference shows a short label; hovering shows
 * the traveller's own words, which are what the planner reads. Preferences are saved
 * with the trip. Ones added after the handoff wait for the next change to the plan and
 * never re-plan the current days on their own.
 */
export function PlanMemories({ tripId, handoff, refreshKey = 0 }: {
  readonly tripId: string;
  readonly handoff: PlanHandoff;
  /** Changes when the plan saved a preference itself, such as an answer to its question. */
  readonly refreshKey?: number;
}) {
  const locale = useLocale();
  const words = useMessages();
  const text = copy[locale];
  const [preferences, setPreferences] = useState<readonly PlanPreference[]>(handoff.preferences);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "failed">("idle");
  // An answer to the plan's own question shaped the plan too, though it came after the handoff.
  const usedByPlan = new Set([
    ...handoff.preferences.map(({ id }) => id),
    ...preferences.filter(({ source }) => source === "question").map(({ id }) => id),
  ]);

  // The saved list can be newer than the handoff: preferences added before a refresh.
  useEffect(() => {
    let active = true;
    listPreferences(tripId).then((saved) => { if (active) setPreferences(saved); }).catch(() => {});
    return () => { active = false; };
  }, [refreshKey, tripId]);

  async function add(texts: readonly string[]) {
    setStatus("saving");
    try {
      const added: PlanPreference[] = [];
      for (const value of texts) {
        added.push(await addPreference(tripId, value, kindOfSuggestion(value, words.plan.preferenceSuggestions)));
      }
      setPreferences((current) => [...current, ...added.filter(({ id }) => !current.some((item) => item.id === id))]);
      setDraft("");
      setStatus("idle");
    } catch {
      setStatus("failed");
    }
  }

  async function remove(id: string) {
    const before = preferences;
    setPreferences(before.filter((preference) => preference.id !== id));
    try {
      await removePreference(tripId, id);
    } catch {
      setPreferences(before);
      setStatus("failed");
    }
  }

  const waiting = preferences.some(({ id }) => !usedByPlan.has(id));
  return (
    <section className={memoryStyles.memories} aria-labelledby="plan-preferences-heading">
      <div className={memoryStyles.header}>
        <h2 id="plan-preferences-heading">{words.plan.memoriesTitle}</h2>
      </div>

      {preferences.length === 0 ? (
        <p className={memoryStyles.hint}>{handoff.preferenceStatus === "unavailable" ? text.unavailable : text.empty}</p>
      ) : (
        <ul className={memoryStyles.chips}>
          {preferences.map((preference) => (
            <li key={preference.id} data-added={preference.source === "plan_page"}
              title={preference.source === "plan_page" ? words.plan.addedByYou : words.plan.youSaid(preference.quote)}>
              {preference.label}
              <button type="button" aria-label={words.plan.forget(preference.label)} onClick={() => void remove(preference.id)}>
                <X aria-hidden="true" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === "failed" ? <p className={memoryStyles.pending} role="alert">{text.failed}</p> : null}
      {waiting ? <p className={memoryStyles.pending}><Info aria-hidden="true" size={13} />{text.pending}</p> : null}

      {/* Only what the traveller types (merlin, 2026-11-22): preset chips looked like things Meri already remembered. */}
      <form className={memoryStyles.inputRow} onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (draft.trim() && status !== "saving") void add([draft.trim()]);
      }}>
        <input aria-label={text.inputLabel} value={draft} maxLength={maxPreferenceQuoteLength}
          placeholder={words.plan.preferencePlaceholder} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit" disabled={!draft.trim() || status === "saving"}>{status === "saving" ? text.saving : text.remember}</button>
      </form>
    </section>
  );
}
