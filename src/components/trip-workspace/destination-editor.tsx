"use client";

import { Check, CircleHelp, MapPin, Pencil, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/animated-popover";
import type { LocationSuggestion } from "@/domain/location/location-suggestion";
import type { TripState } from "@/domain/trip-state/trip-state";

import { createSelectedDestinationPatch, normalizeSuggestionQuery, parseSuggestionResponse } from "./destination-editor-model";
import { requestTripStateUpdate } from "./trip-state-persistence-model";
import styles from "./trip-workspace.module.css";

type SearchStatus = "idle" | "searching" | "results" | "empty" | "error";

export function DestinationEditor({
  onTripStateChange,
  tripId,
  tripState,
}: {
  readonly onTripStateChange: (state: TripState) => void;
  readonly tripId: string;
  readonly tripState: TripState;
}) {
  const destination = tripState.destination;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<readonly LocationSuggestion[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const listId = useId();

  function changeOpen(next: boolean) {
    if (savingRef.current) return;
    if (next) {
      setQuery(destination.state === "missing" ? "" : destination.value);
      setSuggestions([]);
      setActiveIndex(-1);
      setStatus("idle");
      setSaveError(null);
    } else {
      setSuggestions([]);
      setActiveIndex(-1);
      setSaveError(null);
    }
    setOpen(next);
  }

  function changeQuery(value: string) {
    setQuery(value);
    setSuggestions([]);
    setActiveIndex(-1);
    setSaveError(null);
    setStatus(normalizeSuggestionQuery(value) ? "searching" : "idle");
  }

  useEffect(() => {
    const searchQuery = normalizeSuggestionQuery(query);
    if (!open || searchQuery === null) return;

    const controller = new AbortController();
    let stale = false;
    const timer = window.setTimeout(async () => {
      setStatus("searching");
      try {
        const response = await fetch(`/api/locations/suggestions?q=${encodeURIComponent(searchQuery)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Location suggestions failed.");
        const results = parseSuggestionResponse(await response.json());
        if (stale) return;
        setSuggestions(results);
        setActiveIndex(-1);
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
  }, [open, query]);

  async function selectSuggestion(suggestion: LocationSuggestion) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const state = await requestTripStateUpdate(tripId, createSelectedDestinationPatch(suggestion));
      onTripStateChange(state);
      savingRef.current = false;
      setSaving(false);
      changeOpen(false);
    } catch {
      setSaveError("目的地暂时没能保存，请重试选择。");
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      changeOpen(false);
    } else if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setActiveIndex((index) => index <= 0 ? suggestions.length - 1 : index - 1);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault();
      void selectSuggestion(suggestions[activeIndex]);
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <div className={styles.stateField} data-certainty={destination.state} onClick={() => { if (!open) changeOpen(true); }}>
        <dt>
          <span className={styles.fieldLabel}>
            {destination.state === "known" ? <Check size={14} aria-hidden="true" /> : <CircleHelp size={16} aria-hidden="true" />}
            目的地
          </span>
          <span className={styles.fieldCertainty}>
            {destination.state === "known" ? "已理解" : destination.state === "missing" ? "暂未确定" : destination.state === "approximate" ? "大致范围" : "需要确认"}
          </span>
        </dt>
        <dd>
          <PopoverTrigger asChild>
            <button aria-label="编辑目的地" type="button">
              <span>{destination.state === "missing" ? "—" : destination.value}</span>
              <Pencil aria-hidden="true" size={13} />
            </button>
          </PopoverTrigger>
        </dd>
      </div>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={7}
        collisionPadding={12}
        className={styles.destinationPopover}
        aria-label="搜索并选择目的地"
      >
        <div className={styles.destinationPopoverHeading}>
          <MapPin size={16} aria-hidden="true" />
          <span>选择目的地</span>
        </div>
        <div className={styles.destinationSearch}>
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="搜索目的地"
            aria-autocomplete="list"
            aria-controls={suggestions.length > 0 ? listId : undefined}
            aria-expanded={suggestions.length > 0}
            aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            autoComplete="off"
            autoFocus
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索城市、景点或车站"
            role="combobox"
            value={query}
          />
        </div>
        {status === "idle" ? <p className={styles.destinationMessage}>输入至少 2 个字，选择一个具体地点。</p> : null}
        {status === "searching" ? <p className={styles.destinationMessage} role="status">正在寻找地点…</p> : null}
        {status === "empty" ? <p className={styles.destinationMessage} role="status">没有找到匹配的地点，试试更具体的名称。</p> : null}
        {status === "error" ? <p className={styles.destinationError} role="alert">地点搜索暂时不可用，请稍后重试。</p> : null}
        {suggestions.length > 0 ? (
          <div className={styles.destinationSuggestions} id={listId} role="listbox" aria-label="地点建议">
            {suggestions.map((suggestion, index) => (
              <button
                aria-selected={index === activeIndex}
                className={styles.destinationSuggestion}
                data-active={index === activeIndex ? "true" : "false"}
                disabled={saving}
                id={`${listId}-${index}`}
                key={`${suggestion.provider}-${suggestion.providerId ?? "no-id"}-${index}`}
                onClick={() => void selectSuggestion(suggestion)}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                type="button"
              >
                <strong>{suggestion.name}</strong>
                {suggestion.region ? <span>{suggestion.region}</span> : null}
                {suggestion.address ? <small>{suggestion.address}</small> : null}
              </button>
            ))}
          </div>
        ) : null}
        {saving ? <p className={styles.destinationMessage} role="status">正在保存目的地…</p> : null}
        {saveError ? <p className={styles.destinationError} role="alert">{saveError}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
