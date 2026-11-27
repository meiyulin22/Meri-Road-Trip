# Brief: small photos for Meri's catalog spots and dishes (B1)

For an agent working on branch `codex`. Agreed with merlin 2026-11-27. Read this whole file first, then
`CLAUDE.md`, `docs/CODING_PRINCIPLES.md`, and the files named below. When a rule here is unclear, **skip the
photo** rather than guess: a missing photo is fine, a wrong one is not.

## Goal

A small photo for as many catalog spots and dishes as can be found **correctly** on Wikimedia, saved in the repo,
so the plan page can show them later without reaching Wikimedia at run time (it is blocked from China servers).
Wiring the photos into the page is **not** your job; another agent does it after review.

## Where things are

- Catalog: table `catalog_entries` in the local Postgres (`DATABASE_URL` in `.env.local`, read only). Use rows with
  `kind` `spot` (1349) and `dish` (316): `id`, `name`, `aliases`, `province`, `prefecture`, `county`, `summary`.
  Schema: `docs/DATABASE_SCHEMA.md` section 3.7.
- Wikimedia code to **reuse, not rewrite**:
  - `src/platform/place-photos/wikimedia-client.ts`: User-Agent (no personal data), timeouts, rate limit
    (2 at a time, 40 requests a minute). Do not raise these.
  - `src/platform/place-photos/wikimedia-photo-finder.ts`: `landmarkQuery` (Wikidata items named like the place,
    with an image P18, **located in the right 市 by the P131 chain**, so 西湖 in 惠州 is not 西湖 in 杭州) and the
    licence rules (`freeLicence`, `openLicence`, the rejection reasons). Accept exactly what it accepts: CC BY, CC BY-SA
    (any version), CC0, public domain. Anything else, or no author for a non-public-domain file: skip.
- `sharp` is installed and writes AVIF.

## What to build

1. `scripts/fetch-catalog-photos.ts`, run as
   `node --env-file=.env.local --import tsx scripts/fetch-catalog-photos.ts [--city 云南省/大理白族自治州 ...] [--dry-run]`.
   Keep pure logic (choosing a candidate, building the manifest entry, file names) in
   `scripts/fetch-catalog-photos-pick.ts` with a test file next to it (`*.test.ts`, run by `npm test`).
2. For each **spot**: the Wikidata route of `landmarkQuery` with the spot's name and aliases, its 市 and province.
   Take the first P18 image whose licence passes. No Wikidata match: skip (do not fall back to a free-text
   Commons search; that is where wrong photos come from).
3. For each **dish**: Wikidata items whose Chinese label or alias equals the dish name **exactly** and that are an
   instance of food or dish (P31 = Q2095 food, Q746549 dish, or a subclass). The dish must not be tied to another
   country. No such item: skip. Expect few dishes; that is fine.
4. Download the image, resize with `sharp`: spots **320 px wide**, dishes **200 px wide**, AVIF quality about 50,
   metadata stripped. Aim at 8–15 KB a file. Save as `public/photos/catalog/<catalog id>.avif`.
5. Manifest `src/platform/place-photos/catalog-entry-photos.json`, one entry per saved photo, keyed by catalog id:
   `{ "file": "/photos/catalog/<id>.avif", "width", "height", "title" (Commons file title), "author" (plain text),
   "license" (short name), "licenseUrl", "sourceUrl" (the Commons file page), "wikidata" (Q id), "fetchedAt" }`.
   Sorted by id so diffs stay small. Never a photo without author, licence and source.
6. Rejections go to `.cache/catalog-photos/rejected.ndjson` (git-ignored), one line each with id, name and reason
   (`no_wikidata`, `licence`, `no_author`, `too_small`, `review`), so the hit rate can be explained.
7. A contact sheet `.cache/catalog-photos/review.html` (git-ignored): every saved photo with the entry's name, city,
   summary and the Commons title, for a person to look over.

## What makes a photo wrong (skip it; mark `review` in the rejections)

Look at every saved photo. If you cannot view images, say so in your report and leave the review to merlin.

- Not this place: another city's namesake, a different temple or lake, a map, a diagram, a logo, a ticket, a sign.
- For spots: indoor shots, close-ups of a detail (a carving, a door), people as the subject, old paintings,
  heavy watermarks, very dark or blurred photos. An outside view that clearly shows the place is what we want.
- For dishes: not that dish, packaging, a menu, a shop front, raw ingredients only.
- Smaller than the target width before resizing: skip (`too_small`).

## Order of work

1. **Pilot only**: `--city 云南省/大理白族自治州 --city 云南省/迪庆藏族自治州` (27 spots, 17 dishes). Then **stop** and report:
   how many found, how many skipped by reason, how many you judged wrong, total size, time taken. Commit and push the
   pilot on `codex`. Wait for merlin's go before the full run.
2. Full run, all cities, only after the go. Expect a few hours because of the rate limit; it may be resumed
   (skip ids already in the manifest).

## Rules

- Branch `codex`, started from `main` at `5bc7fec` or later. Commit and push to `origin codex` only. **Never merge into
  main**; the other agent reviews and merges.
- Touch only: the two scripts and their test, `public/photos/catalog/`, the manifest JSON, this file (to note results
  at the end). Do **not** edit `src/components/`, other docs, `docs/CODEBASE_GUIDE.md` (the merging agent updates the
  inventory), the database, or the private repo `meri-catalog-cn`.
- Wikimedia only. No Pixabay, no search-result images, no images from the guide PDFs. Never put personal data in
  requests. One failure that says the client is refused (403) or rate limited: stop and report, do not retry in a loop.
- Before each commit: `npm run lint`, `npm run typecheck`, `npm test`. Report what you ran.
- The repo is public: never commit `.env.local`, catalog data files or anything from `meri-catalog-cn`.
