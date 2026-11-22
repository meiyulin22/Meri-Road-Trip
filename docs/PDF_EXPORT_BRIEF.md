# PDF export brief

> Written 2026-11-22 for the agent that builds Meri's PDF export. merlin and the Claude session that built the
> planner agreed every decision below; that session reviews your branch afterwards. If something here is
> impossible or clearly wrong, stop and say so to merlin instead of working around it.

## 1. Read first

`CLAUDE.md` (and the Next.js note in it: read `node_modules/next/dist/docs/` before writing route or page code),
`docs/CODING_PRINCIPLES.md`, `docs/CODEBASE_GUIDE.md` §1–5, `src/agents/README.md` (What to wear, Where to stay,
What to eat, Weather), and the plan page: `src/components/trip-plan/plan-draft-section.tsx` and its neighbours.

## 2. What to build

One export: an **「导出 PDF」** button on the plan page that downloads a PDF travel handbook of the newest saved
plan. Nothing else: no Markdown, no PPT, no stored files.

- **No LLM.** Every word and number comes from the saved plan version (`ReadyPlan`, schema in
  `src/domain/plan/plan-draft-response.ts`; read through the same repository / `GET /api/trips/{id}/plan` the page
  uses, see `readLatestPlan` in `src/components/trip-plan/plan-draft-model.ts`). Nothing is looked up or generated.
- **Generated on click, never stored.** No table, no file on disk, no Docker volume: deleting a journey must leave
  nothing behind. The PDF exists only in memory for the one request.
- **How:** Playwright (headless Chromium) opens a dedicated print page of this app and prints it to PDF. The print
  page reuses the plan's React components and data shaping where it can (weather lines, outfit wording, stay and
  food cards, transfer text, photo credits) rather than rewriting them.

## 3. Layout (A4 portrait, readable on a phone without zooming, a few MB at most)

1. **Cover:** journey name, dates, cities, the pixel red panda (`src/components/trip-plan/outfit-art.ts`).
2. **Overview:** the route (city order, days each), each day's weather icon and range, bookings to make, a contents
   list whose entries link to the day pages (PDF internal links).
3. **One page per day:** date and weather; what to wear (the day's outfit, its reasons as on the page); morning /
   afternoon / evening stops with time anchors; opening and booking notes; the day's legs and transfers.
4. **One page per city:** where to stay (Meri's pick and the three tiers: name, stars, reference price, address,
   phone, distance) and what to eat (dishes; restaurants with address; "from articles" ones marked as unverified).
5. **Getting there and back:** setting-off, between-city and return legs with the chosen train/flight or drive, and
   the coloured "you chose the train: …" line when the chosen way was not found (`missedChoice`).
6. **Packing list:** everything from the outfits, with empty tick boxes to tick on paper.
7. **Sources and notes:** "Weather data by Open-Meteo.com" and/or "Weather data by MET Norway (CC BY 4.0)" as the
   plan used them; 「天气为预报，出发前请再查看」; hotel details and photos from RollingGo, reference prices only, no
   booking, no commission; personal non-commercial project. Same facts as the page, never stronger claims.

Both languages: follow the plan's locale (`handoff.locale`), as the page does. Chinese text needs a CJK font that
Chromium has (Noto Sans CJK / Noto Sans SC); state in the deploy notes that the server image must install it.

**Images:** only ones the page already shows with rights: catalog day photos with their credit line, RollingGo
hotel photos credited to RollingGo, our pixel art and icons. **No Tianditu map tiles** (print use and map-approval
terms): draw a simple self-made city-to-city route sketch (SVG) instead. No other web images.

## 4. Files (new folder for print-only code)

- `src/app/trips/[id]/plan/print/page.tsx`: the print page. Server-rendered, owner-only exactly like the plan page
  (same guest check, same not-found for anyone else). Not linked from the UI.
- `src/components/trip-plan/print/`: print-only components and CSS (`@page` size A4, margins, `break-before: page`
  per day/city page, header/footer with journey name and page numbers if Chromium allows).
- `src/app/api/trips/[id]/plan/pdf/route.ts`: owner check (guest cookie `meri_guest_id`, see
  `src/platform/identity/guest-identity.ts`), then Playwright: a fresh browser context given the same guest cookie
  for this app's own origin, open the print page, wait for fonts and images, `page.pdf({ format: "A4",
  printBackground: true })`.
- `src/capabilities/planning/plan-pdf.ts` (and tests): the orchestration, with the browser behind an interface so
  tests need no Chromium.
- Add `playwright` as a dependency (pin the version, as the repo pins Mastra); Chromium is installed with
  `npx playwright install chromium`. Check whether Next needs `serverExternalPackages` for it in `next.config.ts`.

## 5. Progress bar (real steps only)

Meri shows real progress, never a timer. Make the PDF route answer as a stream of NDJSON lines: real steps as they
happen (reading the plan, opening the print page, laying out N pages (N = page count once known), writing the PDF),
then a last line carrying the PDF (base64) and its file name. The button shows a progress bar from these lines and
saves the file with a Blob download. Nothing is kept on the server. On failure the bar stops and says why in plain
words (zh/en), with a retry.

## 6. Limits and safety

- One PDF at a time per server process (queue the rest), and a per-visitor limit using the existing
  `src/platform/http/rate-limiter.ts` (e.g. 10 an hour). A timeout (e.g. 60 s) that closes the browser.
- Always close the browser/context in `finally`. Never leave Chromium processes behind.
- The print page must not start a plan run or call any paid provider. It only reads the saved plan.
- No secrets in logs. Log `plan.pdf.started/completed/failed` with tripId and durationMs via the shared logger.

## 7. Done means

- Lint, typecheck, `npm test` and `npm run build` pass; unit tests for the orchestration (fake browser), the NDJSON
  progress, the owner check and limits.
- A real PDF generated locally from one of merlin's planned journeys and looked at: Chinese renders, pages break per
  day/city, images and credits show, file size noted.
- Docs updated: `docs/CODEBASE_GUIDE.md` file inventory, `docs/USER_FLOW_CURRENT.md` (new operation row),
  `docs/ARCHITECTURE.md` tech table (Playwright), `docs/DEPLOY_BRIEF.md` (Chromium + CJK font in the image).
- **Work on a branch named `pdf-export`; commit there, push the branch, do not merge into `main`.** The planner
  session reviews it next week and merlin decides whether it is merged or redone.
