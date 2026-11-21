"use client";

import { CalendarDays, TriangleAlert } from "lucide-react";
import { useState } from "react";
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

/**
 * Filling in the dates once on the plan page (2026-11-21), for a plan made without them: a start
 * when the trip's length is known, otherwise a start and an end. On success the page makes the
 * whole plan again from the handoff the server returns.
 */
export function PlanDatesPicker({ tripId, days, locale, onFilled }: {
  readonly tripId: string;
  /** The trip's known length in days, or null when it is not known. */
  readonly days: number | null;
  readonly locale: Locale;
  readonly onFilled: (handoff: PlanHandoff) => void;
}) {
  const text = copy[locale];
  const [open, setOpen] = useState(false);
  const [single, setSingle] = useState<Date | undefined>();
  const [range, setRange] = useState<DateRange | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = days !== null ? single : range?.from;
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
      setOpen(false);
      onFilled(handoff.data);
    } catch {
      setError("failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={styles.open} onClick={() => setOpen(true)}>
        <CalendarDays aria-hidden="true" size={14} />{text.open}
      </button>
    );
  }
  return (
    <div className={styles.panel} role="dialog" aria-label={text.title}>
      <p className={styles.hint}>{days !== null ? text.pickStart(days) : text.pickRange}</p>
      <div className={styles.calendar}>
        {days !== null ? (
          <DayPicker mode="single" selected={single} onSelect={setSingle} disabled={{ before: today }} locale={locale === "zh" ? zhCN : enUS} />
        ) : (
          <DayPicker mode="range" selected={range} onSelect={setRange} disabled={{ before: today }} locale={locale === "zh" ? zhCN : enUS} />
        )}
      </div>
      <p className={styles.warning}><TriangleAlert aria-hidden="true" size={14} />{text.warning}</p>
      {error ? <p className={styles.error} role="alert">{text.errors[error]}</p> : null}
      <div className={styles.actions}>
        <button type="button" className={styles.confirm} disabled={!ready || saving} onClick={() => void submit()}>
          {saving ? text.saving : text.confirm}
        </button>
        <button type="button" className={styles.cancel} onClick={() => { setOpen(false); setError(null); }}>{text.cancel}</button>
      </div>
    </div>
  );
}
