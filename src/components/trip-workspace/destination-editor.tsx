"use client";

import { Check, CircleHelp, Pencil, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { destinationContains, type DestinationRemoval } from "@/domain/trip-state/destination-areas";
import { validateTripState, type TripState } from "@/domain/trip-state/trip-state";

import styles from "./trip-workspace.module.css";

type SearchChoice = { readonly id: string; readonly name: string; readonly province: string;
  readonly city: string | null; readonly spot: string | null; readonly detail: string | null };
const searchResponseSchema = z.object({ choices: z.array(z.object({
  id: z.string().min(1), name: z.string().min(1), province: z.string().min(1),
  city: z.string().min(1).nullable(), spot: z.string().min(1).nullable(), detail: z.string().nullable(),
}).refine((choice) => choice.spot === null || choice.city !== null)) });

export function DestinationEditor({ tripId, tripState, onTripStateChange, initiallyOpen = false, highlightMissing = false }: {
  readonly tripId: string; readonly tripState: TripState;
  readonly onTripStateChange: (state: TripState) => void;
  readonly initiallyOpen?: boolean; readonly highlightMissing?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<readonly SearchChoice[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "empty" | "error" | "results">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const areas = tripState.destination.state === "known" ? tripState.destination.areas : [];

  useEffect(() => {
    const normalized = query.trim();
    if (!open || normalized.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      try {
        const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/destinations?q=${encodeURIComponent(normalized)}`,
          { signal: controller.signal });
        if (!response.ok) throw new Error("search_failed");
        const body: unknown = await response.json();
        const parsed = searchResponseSchema.parse(body);
        if (controller.signal.aborted) return;
        setChoices(parsed.choices);
        setSearchState(parsed.choices.length ? "results" : "empty");
      } catch {
        if (!controller.signal.aborted) { setChoices([]); setSearchState("error"); }
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, query, tripId]);

  async function mutate(method: "POST" | "DELETE", payload: unknown, key: string) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(key); setError(null);
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/destinations`, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("save_failed");
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || !("tripState" in body)) throw new Error("invalid_response");
      onTripStateChange(validateTripState(body.tripState));
    } catch {
      setError("目的地暂时没能保存，请重试。");
    } finally { inFlight.current = false; setBusy(null); }
  }

  function remove(removal: DestinationRemoval) {
    void mutate("DELETE", removal, `${removal.province}|${removal.place ?? ""}|${removal.spot ?? ""}`);
  }

  return <div className={`${styles.stateField} ${styles.destinationEditor}`} data-certainty={tripState.destination.state}
    data-readiness-missing={highlightMissing ? "true" : undefined}>
    <dt><span className={styles.fieldLabel}>
      {tripState.destination.state === "known" ? <Check size={14} aria-hidden="true" /> : <CircleHelp size={16} aria-hidden="true" />}
      目的地
    </span></dt>
    <dd>
      <button className={styles.destinationEditToggle} type="button" aria-label="编辑目的地"
        onClick={() => { setOpen((value) => !value); setChoices([]); setSearchState("idle"); }} aria-expanded={open}>
        <Pencil size={13} aria-hidden="true" />
      </button>
    {tripState.destination.state === "known" && tripState.destination.legacyText ?
      <div className={styles.destinationLegacy}>旧旅程记录：{tripState.destination.legacyText}。这些地点尚需重新确认，添加新地点不会删除这段记录。
        <button type="button" disabled={busy !== null} onClick={() => void mutate("DELETE", { legacy: true }, "legacy")}>清除旧记录</button>
      </div> : null}
    {areas.length === 0 && !(tripState.destination.state === "known" && tripState.destination.legacyText)
      ? <p className={styles.destinationEmpty}>—</p> :
      <div className={styles.destinationAreaList}>{areas.map((area) => <section key={area.province}>
        <div className={styles.destinationAreaHeading}>
          <strong>{area.province}</strong>
          <button type="button" disabled={busy !== null} aria-label={`删除${area.province}`}
            onClick={() => remove({ province: area.province, place: null, spot: null })}><X size={14} /></button>
        </div>
        {area.places.length === 0 ? <p className={styles.destinationEmptyCity}>尚未选择城市</p> :
          <ul>{area.places.map((place) => <li key={place.name}>
            <div className={styles.destinationCityRow}>
              <span>{place.name === area.province ? "市内" : place.name}</span>
              <button type="button" disabled={busy !== null} aria-label={`删除${area.province}${place.name}`}
                onClick={() => remove({ province: area.province, place: place.name, spot: null })}><X size={14} /></button>
            </div>
            {place.spots.length ? <div className={styles.destinationSpotList}>{place.spots.map((spot) =>
              <span key={spot}>想去：{spot}<button type="button" disabled={busy !== null}
                aria-label={`删除景点${spot}`} onClick={() => remove({ province: area.province, place: place.name, spot })}><X size={12} /></button></span>)}</div> : null}
          </li>)}</ul>}
      </section>)}</div>}
    {error ? <p className={styles.destinationEditorError} role="alert">{error}</p> : null}
    </dd>
    {open ? <dd className={styles.destinationEditorSearch}>
      <label><Search size={15} aria-hidden="true" />
        <input aria-label="搜索目的地" autoComplete="off" placeholder="搜索城市或具体景点"
          value={query} onChange={(event) => { setQuery(event.target.value); setChoices([]);
            setSearchState(event.target.value.trim().length < 2 ? "idle" : "loading"); setError(null); }} />
      </label>
      {searchState === "loading" ? <p role="status">正在查找地点…</p> : null}
      {searchState === "empty" ? <p role="status">没有找到匹配地点，请换个名称。</p> : null}
      {searchState === "error" ? <p role="alert">地点搜索暂时不可用。</p> : null}
      {choices.length ? <ul>{choices.map((choice) => {
        const selected = destinationContains(areas, { province: choice.province, place: choice.city, spot: choice.spot });
        const indistinguishable = choices.filter((item) => item.name === choice.name &&
          item.province === choice.province && item.city === choice.city && item.detail === choice.detail).length > 1;
        return <li key={choice.id}>
          <span><strong>{choice.name}</strong><small>{choice.province}{choice.city ? ` · ${choice.city}` : ""}</small>
            {choice.detail ? <small>{choice.detail}</small> : null}</span>
          <button type="button" disabled={busy !== null || selected || indistinguishable} onClick={() => void mutate("POST", { query, id: choice.id }, choice.id)}>
            {indistinguishable ? "请细化搜索" : selected ? <><Check size={13} />已添加</> : busy === choice.id ? "添加中…" : "添加"}
          </button>
        </li>;
      })}</ul> : null}
    </dd> : null}
  </div>;
}
