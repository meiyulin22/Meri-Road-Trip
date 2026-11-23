import type { Page } from "playwright";

import { guestIdCookieName } from "@/platform/identity/guest-identity";

import type { RenderPlanPdf } from "./plan-pdf";

function printOrigin(): string {
  // The browser carries the owner cookie. Its destination is server configuration,
  // independent of any Host, Origin or forwarding header supplied on the request.
  const origin = new URL(process.env.MERI_PDF_PRINT_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.href !== `${origin.origin}/`) {
    throw new Error("MERI_PDF_PRINT_ORIGIN must be an HTTP origin");
  }
  return origin.origin;
}

async function preparePrintAssets(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>("[data-plan-pdf] img"));
    for (const image of images) image.loading = "eager";

    // Give optional photos time to load without making an unavailable provider a PDF failure.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled(images.map((image) => image.decode())),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 6_000); }),
    ]);
    clearTimeout(timer);
    for (const image of images) {
      if (image.complete && image.naturalWidth > 0) continue;
      const photo = image.closest<HTMLElement>("[data-plan-pdf-photo]") ?? image;
      photo.style.display = "none";
    }
    await document.fonts.ready;
  });
}

function pdfFilename(title: string, version: number, stale: boolean): string {
  const name = Array.from(title.normalize("NFC").replace(/[^\p{L}\p{M}\p{N} _-]/gu, " ").replace(/\s+/gu, " ").trim())
    .slice(0, 64).join("").trim();
  return `Meri-${name ? `${name}-` : ""}v${version}${stale ? "-outdated" : ""}.pdf`;
}

export const renderPlanPdf: RenderPlanPdf = async ({ tripId, guestId, signal, reportStage }) => {
  const origin = printOrigin();
  reportStage("opening");
  const { chromium } = await import("playwright");
  signal.throwIfAborted();
  const browser = await chromium.launch({ headless: true, timeout: 15_000 });
  let closing: Promise<void> | undefined;
  const closeBrowser = () => closing ??= browser.close();
  const cancel = () => { void closeBrowser().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });

  try {
    signal.throwIfAborted();
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      await context.addCookies([{ name: guestIdCookieName, value: guestId, url: origin, httpOnly: true, sameSite: "Lax" }]);
      // All print assets are local or served by Next's allowlisted image optimizer.
      await context.route("**/*", (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        // Keep JPEG photos in their original format so Chromium can embed them compactly.
        if (url.pathname === "/_next/image" && request.resourceType() === "image") {
          return route.continue({ headers: { ...request.headers(), accept: "image/jpeg" } });
        }
        return route.continue();
      });

      const page = await context.newPage();
      await page.emulateMedia({ media: "print" });
      reportStage("reading");
      const url = `${origin}/trips/${tripId}/plan/print`;
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (response?.status() === 404) return { type: "error", code: "not_found" };
      if (!response?.ok() || page.url() !== url) throw new Error("The print page could not be opened");

      const preview = page.locator("[data-plan-pdf]");
      await preview.waitFor({ state: "attached", timeout: 10_000 });
      const metadata = await preview.evaluate((element) => ({
        status: element.getAttribute("data-plan-pdf"),
        title: element.getAttribute("data-plan-title") ?? "",
        version: Number(element.getAttribute("data-plan-version")),
        stale: element.getAttribute("data-plan-stale") === "true",
      }));
      if (metadata.status === "no_plan" || metadata.status === "incomplete") return { type: "error", code: metadata.status };
      if (metadata.status !== "ready" || !Number.isSafeInteger(metadata.version) || metadata.version < 1) {
        throw new Error("The print page did not render a saved plan");
      }

      reportStage("preparing");
      const filename = pdfFilename(metadata.title, metadata.version, metadata.stale);
      await page.evaluate((name) => { document.title = name; }, filename.slice(0, -4));
      if (metadata.title) {
        const title = Array.from(metadata.title).slice(0, 36).map((char) => `\\${char.codePointAt(0)?.toString(16)} `).join("");
        await page.addStyleTag({ content: `@page meri-handbook { @bottom-left { content: "Meri · ${title}"; } }` });
      }
      await preparePrintAssets(page);
      signal.throwIfAborted();
      reportStage("printing");
      const bytes = await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true, tagged: true });
      return { type: "pdf", bytes, filename, version: metadata.version, stale: metadata.stale };
    } finally {
      if (!signal.aborted) await context.close();
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    await closeBrowser();
  }
};
