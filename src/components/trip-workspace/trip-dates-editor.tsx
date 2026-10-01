"use client";

import { CalendarDays, Minus, Pencil, Plus } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { zhCN } from "react-day-picker/locale";
import "react-day-picker/style.css";

import { parseExactDays } from "@/domain/trip-state/trip-dates";
import type { TripState, TripStatePatch } from "@/domain/trip-state/trip-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/animated-popover";

import { CertaintyTag, certaintyLabels, FieldStatusIcon } from "./field-certainty";
import { clearedTripDatesPatch, createTripDatesPatch, toCalendarDate, tripDatesSummary } from "./trip-dates-model";
import { requestTripStateUpdate } from "./trip-state-persistence-model";
import styles from "./trip-workspace.module.css";

const wideQuery = "(min-width: 900px)";
const maxDays = 366;

function subscribeToWidth(onChange: () => void): () => void {
  const media = window.matchMedia(wideQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * 何时: start, end and length in one row, edited with a range calendar and a day count.
 * The first click on the calendar marks the start and the second the end; only then is
 * anything saved, and the server fills in whichever of the three the user did not set.
 */
export function TripDatesField({
  label,
  onTripStateChange,
  tripId,
  tripState,
}: {
  readonly label: string;
  readonly onTripStateChange: (state: TripState) => void;
  readonly tripId: string;
  readonly tripState: TripState;
}) {
  const [open, setOpen] = useState(false);
  // A start picked on the calendar whose end has not been picked yet.
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [daysInput, setDaysInput] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const wide = useSyncExternalStore(subscribeToWidth, () => window.matchMedia(wideQuery).matches, () => false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const savedStart = toCalendarDate(tripState.startDate);
  const savedEnd = toCalendarDate(tripState.endDate);
  const savedDays = parseExactDays(tripState.duration);
  const summary = tripDatesSummary(tripState, today);
  // Whatever Meri wrote down that the calendar cannot show — 「十月底」, 「大概一周」 —
  // stays visible here until an exact choice replaces it.
  const roughWords = [
    savedStart === undefined && tripState.startDate.state !== "missing" ? tripState.startDate.value : null,
    savedEnd === undefined && tripState.endDate.state !== "missing" ? tripState.endDate.value : null,
    savedDays === null && tripState.duration.state !== "missing" ? tripState.duration.value : null,
  ].filter((word): word is string => word !== null);
  const selected: DateRange | undefined = draftStart
    ? { from: draftStart, to: undefined }
    : savedStart ? { from: savedStart, to: savedEnd } : undefined;

  async function save(patch: TripStatePatch): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      onTripStateChange(await requestTripStateUpdate(tripId, patch));
    } catch {
      setError("日期暂时没能保存，请重试。");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function pickDay(day: Date): void {
    if (saving) return;
    if (draftStart === null || day < draftStart) {
      setDraftStart(day);
      return;
    }
    setDraftStart(null);
    void save(createTripDatesPatch({ startDate: draftStart, endDate: day }));
  }

  function commitDays(days: number): void {
    setDaysInput(null);
    if (!Number.isInteger(days) || days < 1 || days > maxDays || saving) return;
    if (days === savedDays && draftStart === null) return;
    // A start picked without an end goes with the new length, so 「10月1日出发，玩5天」
    // can be said as two taps.
    const start = draftStart ?? undefined;
    setDraftStart(null);
    void save(createTripDatesPatch({ startDate: start, days }));
  }

  function changeOpen(next: boolean): void {
    // Closing with only a start picked still keeps that start.
    if (!next && draftStart !== null) {
      void save(createTripDatesPatch({ startDate: draftStart }));
      setDraftStart(null);
    }
    if (!next) setDaysInput(null);
    setOpen(next);
  }

  const shownDays = daysInput ?? (savedDays === null ? "" : String(savedDays));

  return (
    <Popover onOpenChange={changeOpen} open={open}>
      <div className={styles.stateField} data-certainty={summary.certainty}>
        <dt>
          <span className={styles.fieldLabel}>
            <FieldStatusIcon state={summary.certainty} />
            {label}
          </span>
          <span className={styles.fieldCertainty}>{certaintyLabels[summary.certainty]}</span>
        </dt>
        <dd>
          <PopoverTrigger asChild>
            <button aria-label={`编辑${label}`} className={styles.fieldEditTrigger} title={`编辑${label}`} type="button">
              <span>
                {summary.text}
                <CertaintyTag state={summary.certainty} />
              </span>
              <span aria-hidden="true" className={styles.fieldEditAffordance}><Pencil size={15} /></span>
            </button>
          </PopoverTrigger>
        </dd>
      </div>
      <PopoverContent
        align="end"
        aria-label="选择旅行日期"
        className={styles.datesPopover}
        collisionPadding={12}
        side="bottom"
        sideOffset={7}
      >
        <div className={styles.destinationPopoverHeading}>
          <CalendarDays aria-hidden="true" size={16} />
          <span>选择旅行日期</span>
        </div>
        <p className={styles.datesHint} role="status">
          {draftStart
            ? `开始：${draftStart.getMonth() + 1}月${draftStart.getDate()}日。再点结束日期，或在下方填天数。`
            : "先点开始日期，再点结束日期，天数会自动算好。"}
        </p>
        <DayPicker
          className={styles.datesCalendar}
          defaultMonth={draftStart ?? savedStart ?? today}
          disabled={{ before: today }}
          locale={zhCN}
          mode="range"
          numberOfMonths={wide ? 2 : 1}
          onSelect={(_range, triggerDate) => pickDay(triggerDate)}
          selected={selected}
        />
        <div className={styles.datesLength}>
          <label htmlFor="trip-days">行程时长</label>
          <div className={styles.datesStepper}>
            <button
              aria-label="少一天"
              disabled={saving || savedDays === null || savedDays <= 1}
              onClick={() => commitDays((savedDays ?? 2) - 1)}
              type="button"
            >
              <Minus aria-hidden="true" size={14} />
            </button>
            <input
              id="trip-days"
              inputMode="numeric"
              max={maxDays}
              min={1}
              onBlur={() => { if (daysInput !== null) commitDays(Number(daysInput)); }}
              onChange={(event) => setDaysInput(event.target.value.replace(/\D/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); commitDays(Number(shownDays)); }
              }}
              placeholder="—"
              type="text"
              value={shownDays}
            />
            <span>天</span>
            <button
              aria-label="多一天"
              disabled={saving || (savedDays ?? 0) >= maxDays}
              onClick={() => commitDays((savedDays ?? 0) + 1)}
              type="button"
            >
              <Plus aria-hidden="true" size={14} />
            </button>
          </div>
        </div>
        {roughWords.length > 0 ? (
          <p className={styles.datesNote}>Meri 记下：{roughWords.join(" · ")}。选好具体日期后会替换。</p>
        ) : null}
        <div className={styles.datesFooter}>
          <button
            disabled={saving || summary.certainty === "missing"}
            onClick={() => { setDraftStart(null); void save(clearedTripDatesPatch); }}
            type="button"
          >
            清除日期
          </button>
          {saving ? <span role="status">正在保存…</span> : null}
          {error ? <span className={styles.destinationError} role="alert">{error}</span> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
