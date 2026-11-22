"use client";

import { CalendarDays, TriangleAlert, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { type DateRange, DayPicker } from "react-day-picker";
import { enUS, zhCN } from "react-day-picker/locale";
import "react-day-picker/style.css";

import type { Locale } from "@/domain/locale/locale";
import { type PlanHandoff, planHandoffSchema } from "@/domain/plan/plan-handoff";

import styles from "./plan-dates-picker.module.css";

const copy = {
  zh: {
    open: "补填出发日期",
    title: "补填日期",
    pickStart: (days: number) => `选出发那天，共 ${days} 天，结束日期自动算出。`,
    pickRange: "选出发和结束的日期。",
    warning: "填好后会按新日期重新生成整份计划，大约 2–4 分钟；日期填好后就锁定，不能再改。",
    confirm: "确认并重新生成",
    cancel: "取消",
    saving: "正在保存…",
    errors: {
      past: "出发日期不能早于今天。",
      too_far: "出发日期不能超过一年以后。",
      end_before_start: "结束日期不能早于出发日期。",
      end_required: "请选结束日期。",
      end_mismatch: "日期和已定的天数对不上。",
      too_long: "行程不能超过 60 天。",
      already_filled: "日期已经填过了，请刷新页面。",
      failed: "没能保存日期，请稍后再试。",
    },
  },
  en: {
    open: "Add travel dates",
    title: "Add your dates",
    pickStart: (days: number) => `Pick the day you leave; the trip is ${days} days, so the end follows.`,
    pickRange: "Pick the day you leave and the day you come back.",
    warning: "The whole plan is made again for these dates, in about 2–4 minutes. Once set, the dates are locked.",
    confirm: "Confirm and make the plan again",
    cancel: "Cancel",
    saving: "Saving…",
    errors: {
      past: "The start can't be before today.",
      too_far: "The start can't be more than a year away.",
      end_before_start: "The end can't be before the start.",
      end_required: "Pick the end date too.",
      end_mismatch: "These dates don't match the trip's length.",
      too_long: "A trip can't be longer than 60 days.",
      already_filled: "The dates are already set; reload the page.",
      failed: "The dates couldn't be saved. Try again in a moment.",
    },
  },
} as const;

type ErrorKey = keyof (typeof copy)["zh"]["errors"];
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const wideQuery = "(min-width: 760px)";
function subscribeToWidth(onChange: () => void): () => void {
  const media = window.matchMedia(wideQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Where the dates can be added from (2026-11-22): the facts, the dressing room and the stay card. */
export function AddDatesButton({ locale, onClick, solid = false }: {
  readonly locale: Locale;
  readonly onClick: () => void;
  readonly solid?: boolean;
}) {
  return (
    <button type="button" className={solid ? styles.cta : styles.open} onClick={onClick}>
      <CalendarDays aria-hidden="true" size={14} />{copy[locale].open}
    </button>
  );
}

/**
 * Filling in the dates once on the plan page (2026-11-21), for a plan made without them, in a dialog
 * that the facts, the dressing room and the stay card all open (2026-11-22). The calendar is a range,
 * as in the Workspace's 「何时」: with a known length, the day picked starts the range and the end
 * follows. On success the page makes the whole plan again from the handoff the server returns.
 */
export function PlanDatesPicker({ tripId, days, locale, open, onClose, onFilled }: {
  readonly tripId: string;
  /** The trip's known length in days, or null when it is not known. */
  readonly days: number | null;
  readonly locale: Locale;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onFilled: (handoff: PlanHandoff) => void;
}) {
  const text = copy[locale];
  const [range, setRange] = useState<DateRange | undefined>();
  const wide = useSyncExternalStore(subscribeToWidth, () => window.matchMedia(wideQuery).matches, () => false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = range?.from;
  const end = days !== null ? null : range?.to ?? null;
  const ready = start !== undefined && (days !== null || end !== null);

  async function submit() {
    if (!start || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/plan/dates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: iso(start), endDate: end ? iso(end) : null }),
      });
      const body = (await response.json()) as { handoff?: unknown; error?: { code?: string; reason?: string } };
      if (!response.ok) {
        const key = (body.error?.reason ?? body.error?.code) as ErrorKey | undefined;
        setError(key && key in text.errors ? key : "failed");
        return;
      }
      const handoff = planHandoffSchema.safeParse(body.handoff);
      if (!handoff.success) {
        setError("failed");
        return;
      }
      onClose();
      onFilled(handoff.data);
    } catch {
      setError("failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  // With a known length the day picked is the start and the range runs on from it.
  const pick = (next: DateRange | undefined, picked: Date) => {
    if (days === null) return setRange(next);
    const last = new Date(picked);
    last.setDate(last.getDate() + days - 1);
    setRange({ from: picked, to: last });
  };
  return (
    <div className={styles.backdrop} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label={text.title}>
        <div className={styles.panelHeader}>
          <h3>{text.title}</h3>
          <button type="button" className={styles.close} aria-label={text.cancel} onClick={onClose}><X aria-hidden="true" size={16} /></button>
        </div>
        <p className={styles.hint}>{days !== null ? text.pickStart(days) : text.pickRange}</p>
        <div className={styles.calendar}>
          <DayPicker mode="range" selected={range} onSelect={pick} disabled={{ before: today }} numberOfMonths={wide ? 2 : 1}
            locale={locale === "zh" ? zhCN : enUS} />
        </div>
        <p className={styles.warning}><TriangleAlert aria-hidden="true" size={14} />{text.warning}</p>
        {error ? <p className={styles.error} role="alert">{text.errors[error]}</p> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.confirm} disabled={!ready || saving} onClick={() => void submit()}>
            {saving ? text.saving : text.confirm}
          </button>
          <button type="button" className={styles.cancel} onClick={() => { onClose(); setError(null); }}>{text.cancel}</button>
        </div>
      </div>
    </div>
  );
}
