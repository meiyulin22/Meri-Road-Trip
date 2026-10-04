"use client";

import { Check, MapPin, Minus, Plus, Search, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { destinationContains, type DestinationRemoval } from "@/domain/trip-state/destination-areas";
import { validateTripState, type TripState } from "@/domain/trip-state/trip-state";

import { useMessages } from "@/components/i18n/locale-context";

import { FieldStatusIcon } from "./field-certainty";
import styles from "./trip-workspace.module.css";

type SearchChoice = { readonly id: string; readonly name: string; readonly province: string;
  readonly city: string | null; readonly spot: string | null; readonly detail: string | null };
const searchResponseSchema = z.object({ choices: z.array(z.object({
  id: z.string().min(1), name: z.string().min(1), province: z.string().min(1),
  city: z.string().min(1).nullable(), spot: z.string().min(1).nullable(), detail: z.string().nullable(),
}).refine((choice) => choice.spot === null || choice.city !== null)) });

export function DestinationEditor({ tripId, tripState, onTripStateChange, initiallyOpen = false }: {
  readonly tripId: string; readonly tripState: TripState;
  readonly onTripStateChange: (state: TripState) => void;
  readonly initiallyOpen?: boolean;
}) {
  const text = useMessages().destinationEditor;
  const [open, setOpen] = useState(initiallyOpen);
  const reduceMotion = useReducedMotion();
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
      setError(text.saveFailed);
    } finally { inFlight.current = false; setBusy(null); }
  }

  function remove(removal: DestinationRemoval) {
    void mutate("DELETE", removal, `${removal.province}|${removal.place ?? ""}|${removal.spot ?? ""}`);
  }

  return <div className={`${styles.stateField} ${styles.destinationEditor}`} data-certainty={tripState.destination.state}>
    <dt><span className={styles.fieldLabel}>
      <FieldStatusIcon state={tripState.destination.state} />
      {text.label}
    </span></dt>
    <dd className={styles.destinationAddCell}>
      <motion.button className={styles.destinationAddToggle} type="button" aria-expanded={open}
        aria-label={open ? text.collapseSearch : text.add}
        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        onClick={() => { setOpen((value) => !value); setChoices([]); setSearchState("idle"); }}>
        {open ? <Minus size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
        <span>{open ? text.collapseShort : text.addShort}</span>
      </motion.button>
    </dd>
    <dd className={styles.destinationBody}>
    {tripState.destination.state === "known" && tripState.destination.legacyText ?
      <div className={styles.destinationLegacy}>{text.legacy(tripState.destination.legacyText)}
        <button type="button" disabled={busy !== null} onClick={() => void mutate("DELETE", { legacy: true }, "legacy")}>{text.clearLegacy}</button>
      </div> : null}
    {areas.length === 0 && !(tripState.destination.state === "known" && tripState.destination.legacyText)
      ? <p className={styles.destinationEmpty}>{text.empty}</p> :
      <div className={styles.destinationAreaList}>{areas.map((area) => <section key={area.province}>
        <div className={styles.destinationAreaHeading}>
          <strong>{area.province}</strong>
          <button type="button" className={styles.destinationProvinceRemove} disabled={busy !== null} aria-label={text.remove(area.province)}
            onClick={() => remove({ province: area.province, place: null, spot: null })}><X size={14} aria-hidden="true" /></button>
        </div>
        {/* A province with no city is a whole-province destination, not an unfinished one. */}
        {area.places.length === 0 ? <p className={styles.destinationWholeProvince}>
          <span className={styles.destinationChip} data-kind="province">{text.wholeProvince}</span>
          <small>{text.wholeProvinceNote}</small>
        </p> :
          <ul className={styles.destinationChips}>{area.places.map((place) => <li key={place.name}>
            <span className={styles.destinationChip} data-kind="city">
              {place.name === area.province ? text.cityItself : place.name}
              <button type="button" disabled={busy !== null} aria-label={text.remove(`${area.province}${place.name}`)}
                onClick={() => remove({ province: area.province, place: place.name, spot: null })}><X size={12} aria-hidden="true" /></button>
            </span>
            {/* One line per city, its spots beside it: wrapped into one shared row, a
                spot on the second line read as belonging to whichever city sat above it. */}
            {place.spots.length > 0 ? <span className={styles.destinationSpots}>
              {place.spots.map((spot) => <span className={styles.destinationChip} data-kind="spot" key={spot} title={text.wantToGo(spot)}>
                <MapPin size={11} aria-hidden="true" />{spot}
                <button type="button" disabled={busy !== null} aria-label={text.removeSpot(spot)}
                  onClick={() => remove({ province: area.province, place: place.name, spot })}><X size={11} aria-hidden="true" /></button>
              </span>)}
            </span> : null}
          </li>)}</ul>}
      </section>)}</div>}
    {error ? <p className={styles.destinationEditorError} role="alert">{error}</p> : null}
    </dd>
    {open ? <dd className={styles.destinationEditorSearch}>
      <label><Search size={15} aria-hidden="true" />
        <input aria-label={text.search} autoComplete="off" autoFocus={initiallyOpen} placeholder={text.searchPlaceholder}
          value={query} onChange={(event) => { setQuery(event.target.value); setChoices([]);
            setSearchState(event.target.value.trim().length < 2 ? "idle" : "loading"); setError(null); }} />
      </label>
      {searchState === "loading" ? <p role="status">{text.searching}</p> : null}
      {searchState === "empty" ? <p role="status">{text.noResults}</p> : null}
      {searchState === "error" ? <p role="alert">{text.searchUnavailable}</p> : null}
      {choices.length ? <ul>{choices.map((choice) => {
        const selected = destinationContains(areas, { province: choice.province, place: choice.city, spot: choice.spot });
        const indistinguishable = choices.filter((item) => item.name === choice.name &&
          item.province === choice.province && item.city === choice.city && item.detail === choice.detail).length > 1;
        return <li key={choice.id}>
          <span><strong>{choice.name}</strong><small>{choice.province}{choice.city ? ` · ${choice.city}` : ""}</small>
            {choice.detail ? <small>{choice.detail}</small> : null}</span>
          <button type="button" disabled={busy !== null || selected || indistinguishable} onClick={() => void mutate("POST", { query, id: choice.id }, choice.id)}>
            {indistinguishable ? text.refine : selected ? <><Check size={13} />{text.added}</> : busy === choice.id ? text.adding : text.addOne}
          </button>
        </li>;
      })}</ul> : null}
    </dd> : null}
  </div>;
}
