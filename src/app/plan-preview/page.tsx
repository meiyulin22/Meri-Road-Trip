import type { Metadata } from "next";

import { messages } from "@/components/i18n/messages";
import { PlanPreview } from "@/components/trip-plan/plan-preview";
import { requestLocale } from "@/platform/locale/request-locale";

export async function generateMetadata(): Promise<Metadata> {
  const text = messages[await requestLocale()].plan;
  return { title: text.pageTitle, description: text.sampleNote, robots: { index: false } };
}

/** The plan page's design preview (1.1000), on sample data; not linked from any journey yet. */
export default function PlanPreviewPage() {
  return <PlanPreview />;
}
