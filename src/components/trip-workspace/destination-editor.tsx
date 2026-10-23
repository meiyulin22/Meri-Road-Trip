"use client";

import { Check, LoaderCircle, MapPin, Minus, Plus, Search, X } from "lucide-react";
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
type Suggestion = { readonly name: string; readonly region: string | null };
const searchResponseSchema = z.object({ choices: z.array(z.object({
  id: z.string().min(1), name: z.string().min(1), province: z.string().min(1),
  city: z.string().min(1).nullable(), spot: z.string().min(1).nullable(), detail: z.string().nullable(),
}).refine((choice) => choice.spot === null || choice.city !== null)) });
// Input tips are selected by full name and area; the server verifies their identity.
const suggestionResponseSchema = z.object({ suggestions: z.array(z.object({
  name: z.string().min(1), region: z.string().min(1).nullable(),
})) });

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
  const [suggestions, setSuggestions] = useState<readonly Suggestion[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "empty" | "error" | "results">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const searchRevision = useRef(0);
  const areas = tripState.destination.state === "known" ? tripState.destination.areas : [];

  useEffect(() => {
    const normalized = query.trim();
    if (!open || normalized.length < 1) return;
    const suggestionOnly = normalized.length === 1;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      try {
        if (suggestionOnly) {
          // A single character is too wide to search: 大 matches a crowd of places, and the
          // classification pages behind a search would answer with shops named after a city.
          // The suggestion list costs one small request; selecting one verifies its full name.
          const response = await fetch(`/api/locations/suggestions?q=${encodeURIComponent(normalized)}`,
            { signal: controller.signal });
          if (!response.ok) throw new Error("suggestion_failed");
          const parsed = suggestionResponseSchema.parse(await response.json());
          if (controller.signal.aborted) return;
          setSuggestions(parsed.suggestions);
          setChoices([]);
          setSearchState(parsed.suggestions.length ? "results" : "empty");
          return;
        }
        const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/destinations?q=${encodeURIComponent(normalized)}`,
          { signal: controller.signal });
        if (!response.ok) throw new Error("search_failed");
        const body: unknown = await response.json();
        const parsed = searchResponseSchema.parse(body);
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setChoices(parsed.choices);
        setSearchState(parsed.choices.length ? "results" : "empty");
      } catch {
        if (!controller.signal.aborted) { setChoices([]); setSuggestions([]); setSearchState("error"); }
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, query, tripId]);

  async function mutate(method: "POST" | "DELETE", payload: unknown, key: string, conflictMessage = text.saveFailed) {
    if (inFlight.current) return;
    const submittedSearchRevision = searchRevision.current;
    inFlight.current = true; setBusy(key); setError(null);
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/destinations`, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setError(response.status === 409 ? conflictMessage : text.saveFailed);
        return;
      }
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || !("tripState" in body)) throw new Error("invalid_response");
      onTripStateChange(validateTripState(body.tripState));
      // Only clear the search that produced this addition, not a newer query typed while saving.
      if (method === "POST" && searchRevision.current === submittedSearchRevision) {
        setQuery(""); setChoices([]); setSuggestions([]); setSearchState("idle");
      }
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
        onClick={() => { setOpen((value) => !value); setChoices([]); setSuggestions([]); setSearchState("idle"); }}>
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
          value={query} onChange={(event) => { searchRevision.current += 1; setQuery(event.target.value); setChoices([]); setSuggestions([]);
            setSearchState(event.target.value.trim().length < 1 ? "idle" : "loading"); setError(null); }} />
      </label>
      {searchState === "loading" ? <ul className={styles.destinationSearchSkeleton} aria-hidden="true"><li /><li /></ul>
        : null}
      {searchState === "loading" ? <p role="status" className={styles.destinationSearchCount}>{text.searching}</p> : null}
      {searchState === "empty" ? <p role="status">{text.noResults}</p> : null}
      {searchState === "error" ? <p role="alert">{text.searchUnavailable}</p> : null}
      {suggestions.length ? <>
        <p className={styles.destinationSearchCount} role="status">{text.resultCount(suggestions.length)}</p>
        <ul className={styles.destinationSearchResults}>{suggestions.map((suggestion) => {
        const key = `suggestion:${suggestion.name}|${suggestion.region ?? ""}`;
        const selected = areas.some((area) => suggestion.region?.includes(area.province) &&
          (suggestion.name === area.province || area.places.some((place) => suggestion.region?.includes(place.name) &&
            (suggestion.name === place.name || place.spots.includes(suggestion.name)))));
        return <li key={key} className={styles.destinationSearchResult}>
          <span className={styles.destinationSearchName}>
            <strong>{suggestion.name}</strong>
            {suggestion.region ? <small>{suggestion.region}</small> : null}</span>
          <button type="button" className={styles.destinationSearchAdd}
            disabled={busy !== null || selected || suggestion.name.trim().length < 2}
            aria-label={selected ? text.addedPlace(suggestion.name) : text.addPlace(suggestion.name)}
            aria-busy={busy === key}
            onClick={() => void mutate("POST", { query: suggestion.name, region: suggestion.region }, key, text.suggestionUnverified)}>
            {selected ? <><Check size={14} aria-hidden="true" />{text.added}</>
              : busy === key ? <><LoaderCircle size={14} className={styles.loadingIcon} aria-hidden="true" />{text.adding}</>
              : <><Plus size={14} aria-hidden="true" />{text.addOne}</>}
          </button>
        </li>;
      })}</ul></> : null}
      {choices.length ? <>
        <p className={styles.destinationSearchCount} role="status">{text.resultCount(choices.length)}</p>
        <ul className={styles.destinationSearchResults}>{choices.map((choice) => {
        const selected = destinationContains(areas, { province: choice.province, place: choice.city, spot: choice.spot });
        const indistinguishable = choices.filter((item) => item.name === choice.name &&
          item.province === choice.province && item.city === choice.city && item.detail === choice.detail).length > 1;
        return <li key={choice.id} className={styles.destinationSearchResult}>
          <span className={styles.destinationSearchName}>
            <strong>{choice.name}</strong>
            <small>{choice.province}{choice.city ? ` · ${choice.city}` : ""}</small>
            {choice.detail ? <small>{choice.detail}</small> : null}</span>
          <button type="button" className={styles.destinationSearchAdd}
            disabled={busy !== null || selected || indistinguishable}
            aria-label={selected ? text.addedPlace(choice.name) : text.addPlace(choice.name)}
            aria-busy={busy === choice.id}
            onClick={() => void mutate("POST", { query, id: choice.id }, choice.id)}>
            {indistinguishable ? text.refine : selected ? <><Check size={14} aria-hidden="true" />{text.added}</>
              : busy === choice.id ? <><LoaderCircle size={14} className={styles.loadingIcon} aria-hidden="true" />{text.adding}</>
              : <><Plus size={14} aria-hidden="true" />{text.addOne}</>}
          </button>
        </li>;
        })}</ul>
      </> : null}
      {/* Tianditu asks to be credited wherever its place data appears. */}
      <p className={styles.destinationSearchCredit}>{text.dataCredit}</p>
    </dd> : null}
  </div>;
}
