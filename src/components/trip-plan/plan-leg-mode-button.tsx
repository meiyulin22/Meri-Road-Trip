"use client";

import { LoaderCircle, Plane, TrainFront } from "lucide-react";
import { useState } from "react";

import type { Locale } from "@/domain/locale/locale";
import type { LegMode } from "@/domain/plan/leg-mode";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";

import { requestLegMode } from "./plan-getting-there-model";
import draftStyles from "./plan-draft.module.css";

const copy = {
  zh: {
    flight: "改坐飞机", train: "改坐火车", saving: "正在更改…",
    note: "只改这份计划里的这一段，用已经查到的车次和航班，不再重新查。",
    failed: "没有改成功，刷新页面再试试。",
  },
  en: {
    flight: "Fly instead", train: "Take the train instead", saving: "Changing…",
    note: "Changes only this leg of this plan, from the trains and flights already found; nothing is looked up again.",
    failed: "That didn't change. Reload the page and try again.",
  },
} as const;

/**
 * The plan page's side of the 1.2112 question (1.2115): on setting off or heading home, when both a
 * train over 12 hours and a flight were found, the traveller switches between them here. The trip's
 * way of travelling stays as it was locked; only this plan changes, and nothing is looked up again.
 */
export function PlanLegModeButton({ tripId, leg, mode, locale, onSwitched }: {
  readonly tripId: string;
  readonly leg: "outbound" | "return";
  readonly mode: LegMode;
  readonly locale: Locale;
  readonly onSwitched: (plan: ReadyPlan) => void;
}) {
  const text = copy[locale];
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const Icon = mode === "flight" ? Plane : TrainFront;
  const switchMode = async () => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try {
      onSwitched(await requestLegMode(tripId, leg, mode));
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={draftStyles.originActions}>
      <button type="button" className={draftStyles.originConfirm} disabled={saving} onClick={() => void switchMode()}>
        {saving ? <LoaderCircle aria-hidden="true" size={14} className={draftStyles.spin} /> : <Icon aria-hidden="true" size={14} />}
        {saving ? text.saving : text[mode]}
      </button>
      <small>{text.note}</small>
      {failed ? <p className={draftStyles.originError} role="alert">{text.failed}</p> : null}
    </div>
  );
}
