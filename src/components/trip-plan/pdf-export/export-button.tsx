"use client";

import { Download } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { PlanPdfErrorCode, PlanPdfStage } from "@/capabilities/planning/pdf-export/protocol";
import type { Locale } from "@/domain/locale/locale";
import type { ReadyPlan } from "@/domain/plan/plan-draft-response";

import { readLatestPlan } from "../plan-draft-model";
import styles from "./export-button.module.css";
import { PlanPdfDownloadError, requestPlanPdf, savePlanPdf } from "./pdf-download";

const copy = {
  en: {
    export: "Export PDF",
    retry: "Retry PDF export",
    checking: "Checking for a saved itinerary…",
    disabled: "The PDF is available once the full itinerary is saved.",
    version: (version: number) => `Plan v${version}`,
    stale: "Outdated",
    staleHint: "Your journey changed. Regenerate the plan to get an updated PDF.",
    starting: "Starting export…",
    downloaded: "Download started.",
    stages: {
      queued: "Waiting for another export to finish…",
      opening: "Opening the print page…",
      reading: "Reading the saved plan…",
      preparing: "Preparing fonts and photos…",
      printing: "Generating the PDF…",
    } satisfies Record<PlanPdfStage, string>,
    errors: {
      no_plan: "This journey has no saved plan yet.",
      incomplete: "The full itinerary needs to be saved before it can be exported.",
      not_found: "Meri couldn’t open this journey. Reload the plan and try again.",
      limited: "You’ve reached the export limit. Please try again later.",
      busy: "The PDF exporter is busy. Try again in a moment.",
      timeout: "The export took too long. Try again.",
      failed: "Meri couldn’t create the PDF. Try again.",
    } satisfies Record<PlanPdfErrorCode, string>,
  },
  zh: {
    export: "导出 PDF",
    retry: "重试导出 PDF",
    checking: "正在检查是否有已保存的行程…",
    disabled: "完整行程生成后即可导出 PDF。",
    version: (version: number) => `计划 v${version}`,
    stale: "已过期",
    staleHint: "旅程已变更，重新生成计划后可导出最新版。",
    starting: "正在开始导出…",
    downloaded: "已开始下载。",
    stages: {
      queued: "正在等待前面的导出完成…",
      opening: "正在打开打印页…",
      reading: "正在读取保存的行程…",
      preparing: "正在准备字体和照片…",
      printing: "正在生成 PDF…",
    } satisfies Record<PlanPdfStage, string>,
    errors: {
      no_plan: "这趟旅程还没有已保存的计划。",
      incomplete: "保存完整行程后才能导出 PDF。",
      not_found: "Meri 无法打开这趟旅程，请刷新计划页后重试。",
      limited: "已达到导出次数上限，请稍后再试。",
      busy: "PDF 导出暂时繁忙，请稍后重试。",
      timeout: "导出用时过长，请重试。",
      failed: "Meri 未能生成 PDF，请重试。",
    } satisfies Record<PlanPdfErrorCode, string>,
  },
} as const;

const milestones = { queued: 0, opening: 1, reading: 2, preparing: 3, printing: 4 } satisfies Record<PlanPdfStage, number>;

type ExportStatus = { kind: "idle" } | { kind: "working"; stage: PlanPdfStage | null }
  | { kind: "error"; code: PlanPdfErrorCode } | { kind: "done" };
type VersionInfo = { readonly version: number; readonly stale: boolean };

export function PlanPdfExportHeading({ title, tripId, plan, locale }: {
  readonly title: string;
  readonly tripId: string;
  readonly plan: ReadyPlan | null;
  readonly locale: Locale;
}) {
  const text = copy[locale];
  const hintId = useId();
  const request = useRef<AbortController | null>(null);
  const metadataRequest = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<ExportStatus>({ kind: "idle" });
  const [observed, setObserved] = useState<{ tripId: string; info: VersionInfo | null } | null>(null);
  const knownVersion = observed?.tripId === tripId ? observed.info : undefined;
  const displayedFullPlan = plan?.draft.mode === "full" && plan.draft.days.length > 0;
  const available = knownVersion === undefined ? displayedFullPlan : Boolean(knownVersion);
  const working = status.kind === "working";

  useEffect(() => {
    // The latest saved plan can still be exported while a replacement is being planned.
    const controller = new AbortController();
    metadataRequest.current = controller;
    void readLatestPlan(tripId, controller.signal).then(({ version }) => {
      if (controller.signal.aborted) return;
      const info = version?.plan.draft.mode === "full" && version.plan.draft.days.length > 0
        ? { version: version.version, stale: version.stale } : null;
      setObserved({ tripId, info });
    }).catch(() => {}); // A displayed full plan can still be verified by the export route.
    return () => controller.abort();
  }, [plan, tripId]);

  useEffect(() => () => request.current?.abort(), [tripId]);

  async function exportPdf() {
    if (!available || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setStatus({ kind: "working", stage: null });
    try {
      const pdf = await requestPlanPdf(tripId, controller.signal, (stage) => {
        if (!controller.signal.aborted) setStatus({ kind: "working", stage });
      });
      if (controller.signal.aborted) return;
      savePlanPdf(pdf);
      metadataRequest.current?.abort();
      setObserved({ tripId, info: { version: pdf.version, stale: pdf.stale } });
      setStatus({ kind: "done" });
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = error instanceof PlanPdfDownloadError ? error.code : "failed";
      if (code === "no_plan" || code === "incomplete" || code === "not_found") {
        metadataRequest.current?.abort();
        setObserved({ tripId, info: null });
      }
      setStatus({ kind: "error", code });
    } finally {
      request.current = null;
    }
  }

  return (
    <header className={styles.heading}>
      <h2 id="plan-itinerary-heading">{title}</h2>
      <div className={styles.export}>
        <div className={styles.controls}>
          {knownVersion ? (
            <span className={styles.version} data-outdated={knownVersion.stale || undefined}>
              {text.version(knownVersion.version)}{knownVersion.stale ? ` · ${text.stale}` : ""}
            </span>
          ) : null}
          <div className={styles.control}>
            <button type="button" className={styles.button} aria-disabled={!available || working} aria-busy={working}
              aria-describedby={!available ? hintId : undefined} onClick={exportPdf}>
              <Download aria-hidden="true" size={16} />
              {available && status.kind === "error" ? text.retry : text.export}
            </button>
            {!available ? <p id={hintId} className={styles.hint}>{knownVersion === undefined ? text.checking : text.disabled}</p> : null}
          </div>
        </div>
        {knownVersion?.stale ? <p className={styles.staleHint}>{text.staleHint}</p> : null}
        {status.kind === "working" ? (
          <div className={styles.progress} role="status">
            <p>{status.stage ? text.stages[status.stage] : text.starting}</p>
            <progress max={5} value={status.stage ? milestones[status.stage] : undefined} aria-label={text.export} />
          </div>
        ) : null}
        {status.kind === "error" ? <p className={styles.error} role="alert">{text.errors[status.code]}</p> : null}
        {status.kind === "done" ? <p className={styles.done} role="status">{text.downloaded}</p> : null}
      </div>
    </header>
  );
}
