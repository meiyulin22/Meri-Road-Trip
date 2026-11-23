import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";

import { loadPlanPdfSnapshot } from "@/capabilities/planning/pdf-export/plan-pdf";
import { PlanHandbook } from "@/components/trip-plan/pdf-export/print/handbook";
import { htmlLang } from "@/domain/locale/locale";
import { readGuestId } from "@/platform/identity/guest-identity";
import { requestLocale } from "@/platform/locale/request-locale";

export const metadata: Metadata = { title: "Meri | Travel handbook", robots: { index: false, follow: false } };

export default async function PrintPlanPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = readGuestId(await cookies());
  if (!owner || !z.uuid().safeParse(id).success) notFound();

  const [{ journeyService }, { planRunRepository }] = await Promise.all([
    import("@/capabilities/journey/journey-service-instance"),
    import("@/capabilities/planning/plan-run-repository-instance"),
  ]);
  const result = await loadPlanPdfSnapshot(id, owner, {
    loadJourney: (tripId, guestId) => journeyService.loadJourney(tripId, guestId),
    repository: planRunRepository,
  });
  if (result.status === "not_found") notFound();
  if (result.status !== "ready") {
    return <p data-plan-pdf={result.status}>{await requestLocale() === "zh"
      ? "完整行程生成后即可导出 PDF。"
      : "You can export a PDF after the full itinerary is saved."}</p>;
  }

  const { locale, stale, version } = result;
  const name = version.tripState.name;
  return (
    <div lang={htmlLang(locale)} data-plan-pdf="ready" data-plan-version={version.version}
      data-plan-stale={stale} data-plan-title={name.state === "known" ? name.value : undefined}>
      <PlanHandbook version={version} locale={locale} stale={stale} />
    </div>
  );
}
