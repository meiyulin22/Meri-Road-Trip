import { z } from "zod";

import type { GeneratePlanReadiness } from "@/domain/trip-state/planning-readiness";

const readinessSchema = z.discriminatedUnion("canProceed", [
  z.object({ canProceed: z.literal(true), destination: z.enum(["selected", "resolved"]) }),
  z.object({
    canProceed: z.literal(false),
    reason: z.enum([
      "destination_missing",
      "destination_ambiguous",
      "destination_unresolved",
      "provider_error",
    ]),
  }),
]);

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function requestPlanningReadiness(
  tripId: string,
  fetcher: Fetcher = fetch,
): Promise<GeneratePlanReadiness> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/planning-readiness`, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Planning readiness request failed.");
  return readinessSchema.parse(await response.json());
}

export function planningReadinessMessage(readiness: GeneratePlanReadiness): string {
  if (readiness.canProceed) {
    return readiness.destination === "selected"
      ? "目的地已选定，通过地点检查。规划功能尚未开放。"
      : "目的地可识别，通过地点检查；尚未作为你的确认地点保存。规划功能尚未开放。";
  }

  switch (readiness.reason) {
    case "destination_missing":
      return "请先在上方添加目的地。";
    case "destination_ambiguous":
      return "找到了多个可能的目的地，请在上方选择或说明具体地点。";
    case "destination_unresolved":
      return "暂时无法识别这个目的地，请选择更具体的地点。";
    case "provider_error":
      return "地点查询暂时不可用，请稍后重试。";
  }
}

export function shouldHighlightMissingDestination(
  readiness: { readonly destinationKey: string; readonly result: GeneratePlanReadiness } | null,
  currentDestinationKey: string,
): boolean {
  return readiness?.destinationKey === currentDestinationKey &&
    !readiness.result.canProceed &&
    readiness.result.reason === "destination_missing";
}
