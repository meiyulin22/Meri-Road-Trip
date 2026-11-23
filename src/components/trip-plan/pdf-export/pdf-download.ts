import {
  planPdfErrorCodeSchema,
  planPdfEventSchema,
  type PlanPdfErrorCode,
  type PlanPdfEvent,
  type PlanPdfStage,
} from "@/capabilities/planning/pdf-export/protocol";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type PlanPdfDownload = Extract<PlanPdfEvent, { type: "pdf" }>;

export class PlanPdfDownloadError extends Error {
  constructor(readonly code: PlanPdfErrorCode) {
    super(`PDF export failed: ${code}`);
    this.name = "PlanPdfDownloadError";
  }
}

/** A chunk may cut a JSON line or a UTF-8 character in two, including the last PDF line. */
async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      const lines = decoder.decode(chunk.value, { stream: !chunk.done }).split("\n");
      lines[0] = pending + lines[0];
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) yield line;
      }
      if (chunk.done) {
        if (pending.trim()) yield pending;
        return;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Forwards actual server milestones and only resolves once the stream has supplied a PDF. */
export async function requestPlanPdf(
  tripId: string,
  signal: AbortSignal,
  onStage: (stage: PlanPdfStage) => void,
  fetcher: Fetcher = fetch,
): Promise<PlanPdfDownload> {
  const response = await fetcher(`/api/trips/${encodeURIComponent(tripId)}/plan/pdf`, {
    method: "POST",
    cache: "no-store",
    signal,
  });

  if (!response.ok && !response.headers.get("Content-Type")?.includes("ndjson")) {
    const body: { error?: { code?: unknown }; code?: unknown } | null = await response.json().catch(() => null);
    const code = planPdfErrorCodeSchema.safeParse(body?.error?.code ?? body?.code);
    throw new PlanPdfDownloadError(code.success ? code.data : "failed");
  }

  if (!response.body) throw new PlanPdfDownloadError("failed");
  for await (const line of readLines(response.body)) {
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      throw new PlanPdfDownloadError("failed");
    }
    const event = planPdfEventSchema.safeParse(data);
    if (!event.success) throw new PlanPdfDownloadError("failed");
    if (event.data.type === "error") throw new PlanPdfDownloadError(event.data.code);
    if (event.data.type === "stage") onStage(event.data.stage);
    if (event.data.type === "pdf" && response.ok) return event.data;
  }
  throw new PlanPdfDownloadError("failed");
}

export function savePlanPdf({ filename, base64 }: PlanPdfDownload): void {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // The browser may consume the Blob on a later task after handling the click.
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
