"use client";

import { Car, Check, LoaderCircle, MapPin, Plane, Search, Sparkles, TrainFront, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { normalizeSuggestionQuery, parseSuggestionResponse } from "@/components/trip-workspace/location-editor-model";
import type { Locale } from "@/domain/locale/locale";
import type { LocationSuggestion } from "@/domain/location/location-suggestion";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";
import type { PlanHandoff } from "@/domain/plan/plan-handoff";
import { travelChoices, type TravelChoice } from "@/domain/plan/transfer-legs";

import { GettingThereRequestError, type GettingThereFailure, pickableSuggestion, requestGettingThere } from "./plan-getting-there-model";
import draftStyles from "./plan-draft.module.css";

const copy = {
  zh: {
    label: "从哪里出发？",
    placeholder: "输入城市或地点，比如 上海",
    searching: "正在查找…",
    empty: "地图上没有找到，换个写法试试",
    error: "地点建议暂时打不开，稍后再试",
    change: "换一个",
    how: "怎么去？",
    choices: { drive: "自驾", train: "高铁", flight: "飞机", auto: "让 Meri 判断" } satisfies Record<TravelChoice, string>,
    confirm: "确认",
    saving: "正在估算…",
    locked: "确认后出发地会锁定，不能再改。",
    lockedChoice: "确认后交通方式会锁定，不能再改。",
    chosenSaving: "正在查找…",
    failures: {
      already_filled: "已经填过了，刷新页面看看。",
      plan_stale: "这趟旅程在计划生成后改过，这份计划已经过期。",
      no_plan: "还没有可以补填的计划。",
      failed: "没有保存成功，再点一次确认试试。",
    } satisfies Record<GettingThereFailure, string>,
  },
  en: {
    label: "Where are you setting off from?",
    placeholder: "A city or place, such as Shanghai",
    searching: "Looking…",
    empty: "Not on the map — try another spelling",
    error: "Place suggestions aren't available right now",
    change: "Change",
    how: "How would you like to travel?",
    choices: { drive: "Drive", train: "Train", flight: "Fly", auto: "Let Meri decide" } satisfies Record<TravelChoice, string>,
    confirm: "Confirm",
    saving: "Estimating…",
    locked: "Once confirmed, the starting point is locked.",
    lockedChoice: "Once confirmed, the way of travelling is locked.",
    chosenSaving: "Looking it up…",
    failures: {
      already_filled: "This is already set — reload the page.",
      plan_stale: "The journey changed after this plan was made, so the plan is out of date.",
      no_plan: "There's no finished plan to fill in yet.",
      failed: "That didn't save. Try confirming again.",
    } satisfies Record<GettingThereFailure, string>,
  },
} as const;

const choiceIcon = { drive: Car, train: TrainFront, flight: Plane, auto: Sparkles } satisfies Record<TravelChoice, typeof Car>;

type SearchStatus = "idle" | "searching" | "results" | "empty" | "error";

/**
 * Filling in where the traveller starts, inside the setting-off card (1.2107): a place picked
 * from Tianditu's suggestions, as in the Workspace, so it is always on the map; and, when the
 * trip did not say, how to travel. Confirming sends both once and shows the new estimate. Since
 * 1.2115 a trip that has its origin but no way of travelling gets the choices alone: the traveller
 * cannot go back to the Workspace to set it.
 */
export function PlanOriginPicker({ tripId, locale, askOrigin = true, askChoice, onFilled }: {
  readonly tripId: string;
  readonly locale: Locale;
  /** The plan has no origin yet, so the place search is shown; false offers only the choices. */
  readonly askOrigin?: boolean;
  /** The trip did not say how to travel, so the four choices are offered. */
  readonly askChoice: boolean;
  readonly onFilled: (filled: { readonly handoff: PlanHandoff; readonly plan: ReadyPlan }) => void;
}) {
  const text = copy[locale];
  const listId = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<readonly LocationSuggestion[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [picked, setPicked] = useState<LocationSuggestion | null>(null);
  const [choice, setChoice] = useState<TravelChoice>("auto");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<GettingThereFailure | null>(null);

  // The same suggestions as the Workspace's origin field, a quarter second after typing stops.
  useEffect(() => {
    const searchQuery = normalizeSuggestionQuery(query);
    if (picked || searchQuery === null) return;
    const controller = new AbortController();
    let stale = false;
    const timer = window.setTimeout(async () => {
      setStatus("searching");
      try {
        const response = await fetch(`/api/locations/suggestions?q=${encodeURIComponent(searchQuery)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Location suggestions failed.");
        const results = parseSuggestionResponse(await response.json()).filter(pickableSuggestion);
        if (stale) return;
        setSuggestions(results);
        setStatus(results.length ? "results" : "empty");
      } catch {
        if (stale || controller.signal.aborted) return;
        setSuggestions([]);
        setStatus("error");
      }
    }, 250);
    return () => {
      stale = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [picked, query]);

  const ready = askOrigin ? picked !== null : askChoice;
  const confirm = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setFailure(null);
    try {
      onFilled(await requestGettingThere(tripId, askOrigin ? picked : null, askChoice ? choice : null));
    } catch (error) {
      setFailure(error instanceof GettingThereRequestError ? error.reason : "failed");
      setSaving(false);
    }
  };

  return (
    <div className={draftStyles.originPicker}>
      {askOrigin ? <span className={draftStyles.originLabel}>{text.label}</span> : null}
      {!askOrigin ? null : picked ? (
        <span className={draftStyles.originPicked}>
          <MapPin aria-hidden="true" size={13} />
          <strong>{picked.name}</strong>
          {picked.region ? <small>{picked.region}</small> : null}
          <button type="button" onClick={() => { setPicked(null); setQuery(""); setStatus("idle"); }} disabled={saving} aria-label={text.change}>
            <X aria-hidden="true" size={13} />
          </button>
        </span>
      ) : (
        <div className={draftStyles.originSearch}>
          <Search aria-hidden="true" size={14} />
          <input value={query} placeholder={text.placeholder} aria-label={text.label} role="combobox"
            aria-expanded={status === "results"} aria-controls={listId} aria-autocomplete="list"
            onChange={(event) => { setQuery(event.target.value); if (!normalizeSuggestionQuery(event.target.value)) setStatus("idle"); }} />
          {status === "results" ? (
            <ul id={listId} role="listbox" className={draftStyles.originList}>
              {suggestions.map((suggestion, index) => (
                <li key={`${suggestion.name}-${suggestion.region ?? ""}-${index}`} role="option" aria-selected={false}>
                  <button type="button" onClick={() => { setPicked(suggestion); setSuggestions([]); setStatus("idle"); }}>
                    <strong>{suggestion.name}</strong>{suggestion.region ? <small>{suggestion.region}</small> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {status === "searching" || status === "empty" || status === "error" ? (
            <span className={draftStyles.originStatus} role="status">{text[status]}</span>
          ) : null}
        </div>
      )}
      {askChoice ? (
        <div className={draftStyles.choiceRow} role="group" aria-label={text.how}>
          <span className={draftStyles.originLabel}>{text.how}</span>
          {travelChoices.map((option) => {
            const Icon = choiceIcon[option];
            return (
              <button type="button" key={option} className={draftStyles.choiceChip} aria-pressed={choice === option}
                disabled={saving} onClick={() => setChoice(option)}>
                <Icon aria-hidden="true" size={13} />{text.choices[option]}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className={draftStyles.originActions}>
        <button type="button" className={draftStyles.originConfirm} disabled={!ready || saving} onClick={() => void confirm()}>
          {saving ? <LoaderCircle aria-hidden="true" size={14} className={draftStyles.spin} /> : <Check aria-hidden="true" size={14} />}
          {saving ? (askOrigin ? text.saving : text.chosenSaving) : text.confirm}
        </button>
        <small>{askOrigin ? text.locked : text.lockedChoice}</small>
      </div>
      {failure ? <p className={draftStyles.originError} role="alert">{text.failures[failure]}</p> : null}
    </div>
  );
}
