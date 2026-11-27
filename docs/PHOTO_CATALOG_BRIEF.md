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

## Pilot result — 2026-11-27

The Dali and Diqing run read 27 spots and 17 dishes from local Postgres. It downloaded 11 spot candidates in
4 min 16 s. Visual review retained 9 (7 in Dali and 2 in Diqing), totaling 72,184 bytes. The Erhai satellite
image and the street scene attributed to Dukezong went to `review`: the first is not a visitor's view, and the
second could not be placed in the old town with confidence. No candidate was confirmed to show the wrong subject.

| Outcome | Count |
| --- | ---: |
| `no_wikidata` (no matching item with a P18 image) | 16 |
| `licence` | 0 |
| `no_author` | 0 |
| `too_small` | 0 |
| `review` | 2 |
| Dishes pending after the limit signal | 17 |

Fourteen dish queries failed transiently, one hit a Wikidata rate limit, and two remained unattempted. The run
stopped at the limit signal without retrying. The dish query was tightened to filter exact-name hits before
walking the food class hierarchy; the revised query has local test coverage and has yet to be run live.

The offline contact sheet at `.cache/catalog-photos/review.html` contains the nine retained images. To reject
a saved candidate offline, pass `--reject-review <catalog-id>` with the same city filters. Re-running the collector
later resumes using the manifest and local rejection log, so only pending entries are queried.

## National spot run — 2026-11-27

The approved nationwide run used `--kind spot`, which selected 1,349 spots and resumed with 1,322 pending.
The collector checkpoints each completed lookup and reports progress every 25 results. After several temporary
failures around Baoding, the Wikidata query was kept on the same name and P131 checks and given traversal
hints for WDQS v1. A previously timed-out lookup returned in 1.56 seconds with those hints.

The two passes took about 15 minutes of collection time. The second stopped immediately when Wikidata
returned HTTP 429. This run resolved 65 additional spots. Of those, 56 had no matching Wikidata image and
9 yielded candidates. Visual review kept 6 and rejected 3 (a flower close-up, an isolated gate and a sign).

The manifest now contains 15 reviewed spot photos totaling 148,015 bytes. Across the pilot and national
run, 72 spots have no matching Wikidata image, 5 are marked for visual rejection, and 1,257 are pending.
Of the pending spots, two received temporary or rate-limit failures. The saved manifest and local rejection
log are the checkpoints for a later run. The offline contact sheet contains all 15 retained images.

### National spot continuation — 2026-11-27

The resumed collector spaced requests three seconds apart and waited 65 seconds after a transient WDQS
failure before querying another subject. It recorded the server's `Retry-After` and stopped immediately on
HTTP 429 after 19 min 56 s. The server sent `Retry-After: 120`.

This run resolved 105 spots. It found 44 candidates and kept 33 after visual review. Eleven candidates
were rejected during review. Fifty-eight spots had no matching Wikidata image. One spot each was rejected
for licence, missing author and insufficient width. Eight queries failed transiently, and the rate-limited query was kept
pending. Across all runs, 197 spots have an outcome and 1,152 are pending. The manifest and contact sheet
now contain 48 reviewed photos totaling 436,643 bytes.

### National spot continuation checkpoint — 2026-11-27

The next authorized run resumed after the previous `Retry-After` had elapsed. After 19.6 seconds,
Wikidata returned HTTP 429 with `Retry-After: 120`. The collector stopped immediately. Four more
spots had an outcome. Three had no matching Wikidata image, and the Hunan Museum exterior passed
visual review. The manifest and contact sheet now contain 49 reviewed photos totaling 444,208 bytes.
Of the 1,349 spots, 201 have an outcome and 1,148 are pending.

### National spot continuation checkpoint 2 — 2026-11-27

This pass ran for 12 min 36 s and stopped immediately on Wikidata HTTP 429 with `Retry-After: 120`.
It resolved 70 additional spots. Forty-three had no matching Wikidata image and one was rejected
for licence. Of 26 candidates, 21 passed visual review and five were rejected. Five temporary
failures and the rate-limited lookup remain pending. The manifest and contact sheet now contain
70 reviewed photos totaling 667,110 bytes. Of the 1,349 spots, 271 have an outcome and 1,078 are pending.

### National spot continuation checkpoint 3 — 2026-11-27

This pass spaced requests four seconds apart. It ran for 13 min 6 s and stopped immediately on
Wikidata HTTP 429 with `Retry-After: 120`. It resolved 69 more spots. Fifty had no matching
Wikidata image. Of 19 candidates, 12 passed visual review and seven were rejected. Five
temporary failures and the rate-limited lookup remain pending. The manifest and contact sheet
now contain 82 reviewed photos totaling 793,340 bytes. Of the 1,349 spots, 340 have an outcome
and 1,009 are pending.

### National spot continuation checkpoint 4 — 2026-11-27

This pass kept the four-second request interval and stopped immediately on Wikidata HTTP 429 with
`Retry-After: 120` after 7 min 20 s. Of 26 additional resolved spots, 20 had no matching Wikidata
image, one image lacked a required author, and five photos passed visual review. Four temporary
failures and the rate-limited lookup remain pending. The manifest and contact sheet contain
87 reviewed photos totaling 835,735 bytes. Of the 1,349 spots, 366 have an outcome and 983 are pending.

### National spot continuation checkpoint 5 — 2026-11-27

This pass kept the four-second request interval and stopped immediately on Wikidata HTTP 429 with
`Retry-After: 120` after 8 min 46 s. Of 62 additional resolved spots, 37 had no matching Wikidata
image and one was rejected for licence. Of 24 candidates, 17 passed visual review and seven were
rejected. One temporary failure and the rate-limited lookup remain pending. The manifest and
contact sheet now contain 104 reviewed photos totaling 1,006,289 bytes. Of 1,349 spots, 428 have an
outcome and 921 are pending.
