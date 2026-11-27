# Meri deployment brief

> Written 2026-11-21 for the agent that deploys Meri to a VPS. main at the commit that added this file.
> merlin relays between you and the Claude session that built the planner; ask through merlin when unsure.
> This is a brief, not a plan of record: decisions below were made with merlin; anything marked **open**
> is for merlin to decide, not you.

## 1. Read first

`CLAUDE.md`, then `docs/PROJECT.md`, `docs/ARCHITECTURE.md` (§2 tech table: every provider and its limits),
`docs/CODEBASE_GUIDE.md` §1–5, `src/agents/README.md` §6, and `.env.example` (every variable, Chinese comments).

## 2. What you are deploying

One Next.js 16.3.5 app (`npm run build`, `npm run start`), Node 24, PostgreSQL, no other services. The plan
workflow runs inside the Next.js server process (Mastra); 12306 trains start a child process only when
`RAIL_PROVIDER=12306`. Files the server writes and must keep across restarts: `.cache/` (daily call counters
per provider, Tianditu caches) and `MERI_MEDIA_DIR` (runtime place photos). `public/photos/` (the city photo
catalog) ships with the code.

## 3. Open decision first: where (merlin decides)

- **China server**: needs ICP 备案 + 公安备案. merlin's friend's old filing may be void because the friend's ECS
  expired. First step: check the filing at beian.miit.gov.cn; if it still exists, ask the same cloud vendor
  about re-接入 on a new server; if cancelled, a new filing takes 1–3 weeks. Never set up any tunnel or proxy
  on a China server to reach blocked sites (Wikimedia etc.).
- **HK / JP server**: no filing. Unknown whether Tianditu accepts it (see §4). Kimi, 12306 and Tianditu are
  domestic, so latency is higher.

## 4. Hard rules (each learned the hard way)

1. **Tianditu**: one probe at a time; on HTTP 418 or a CloudWAF "访问被拦截" page, stop for the day, no retries.
   On 2026-11-21 three quick hand-typed curl calls from one machine got a 418. `TIANDITU_API_KEY` must be a
   key of type **服务端** (check its type in the Tianditu console); a 浏览器端 key is refused from servers
   (code 301012, 「Key权限类型为:浏览器端」). merlin has both kinds; ask merlin which is which, never print them.
   Add the server's public IP to the server key's whitelist before probing. Best probe: run Meri's own code
   path once (a plan or a location lookup), not hand-written curl. In cmd, percent-encode the `ds` JSON.
2. **Never commit or print secrets.** Keys live only in the server's environment / `.env.local` on the
   server. Do not paste keys into chat or logs.
3. **`NODE_TLS_REJECT_UNAUTHORIZED` must not be set on the server** (merlin's dev shell sets it for a
   corporate proxy).
4. **Money**: every Generate plan spends Kimi + search money. Say the cost before any live run (about
   ¥0.3–0.5 a plan). `PAID_CALLS_ENABLED=false` is the kill switch.
5. **Product code changes go through merlin**; your scope is deployment config, scripts and docs.
   Code changes known to be needed are listed in §6 for the planner session or for merlin to assign.

## 5. Steps

1. Server: Node 24, git checkout of `main` (public repo; from China use a GitHub mirror prefix, a shallow clone and
   skip `assets/`, design files the server never reads: `git clone --depth 1 --filter=blob:none --sparse <url>`, then
   `git sparse-checkout set --no-cone '/*' '!/assets/'`; check `git rev-parse HEAD` against GitHub), `npm ci`, `npm run build`, run with a process manager (systemd or
   pm2) as a non-root user; reverse proxy (nginx or Caddy) with HTTPS on 443.
2. Reverse proxy must **overwrite** the client address header: nginx `proxy_set_header X-Real-IP $remote_addr;`
   (Caddy `header_up X-Real-IP {remote_host}`). `src/platform/http/client-address.ts` trusts `x-real-ip`, then
   the last `x-forwarded-for` entry; per-IP limits depend on it. Server-sent events (`/api/trips/*/plan-runs/*/events`)
   run for minutes: they already send `X-Accel-Buffering: no`; raise the proxy read timeout (≥ 10 min).
3. PostgreSQL 18 with the pgvector and pg_trgm extensions (distribution packages or the `pgvector/pgvector:pg18`
   image), data on persistent storage, bound to localhost only. Development runs the same versions from Homebrew
   (see `docs/ARCHITECTURE.md` 8.1). Run migrations with `DATABASE_URL=… npm run db:migrate` as a user that may
   create extensions (migration 0014 creates `pg_trgm` and `vector`).
   **Catalog:** the catalog data is private and never goes on the server as files. merlin imports it from his Mac
   through an SSH tunnel with the same script: `ssh -N -L 15432:localhost:5432 <server>`, then
   `DATABASE_URL=postgresql://<user>:<password>@localhost:15432/meri node --env-file=.env.local --import tsx
   scripts/import-catalog.ts` (`--dry-run` first; the command-line `DATABASE_URL` wins over `.env.local`).
   Then, through the same tunnel, `scripts/embed-catalog.ts` fills the vectors (百炼, about ¥0.1 for the whole
   catalog). The server itself needs `DASHSCOPE_API_KEY` and `EMBEDDING_BASE_URL` for query vectors at run time.
4. Environment: copy `.env.example` to the server's `.env.local` and fill it. Set on purpose: `HOTEL_PROVIDER`,
   `FLIGHT_PROVIDER`, `RAIL_PROVIDER`, `PLAN_SEARCH_PROVIDER`. Launch limits agreed 2026-11-19:
   `PLAN_RUNS_PER_DAY=15`, `PLAN_RUNS_PER_GUEST_PER_DAY=2`, `PLAN_RUNS_PER_IP_PER_DAY=2`. Set
   `MET_NORWAY_USER_AGENT` to `Meri/<version> <site URL>` (no personal email).
5. Writable dirs: `.cache/` in the app directory and `MERI_MEDIA_DIR`, owned by the app user, backed up.
6. Smoke test, in order, one call each, free first: home page loads; create a journey (Kimi, cheap); Tianditu
   location lookup once (rule §4.1); weather: one Open-Meteo and one MET Norway request from the server, time
   them (from merlin's Mac Open-Meteo lost ~13% of connections); then **one** Generate plan after merlin agrees
   the cost.
7. Report back to merlin: server location, what passed, timings, every failure with its log line.

### PDF export on Ubuntu (1.2200)

- The production dependencies `playwright` and `@playwright/browser-chromium` are pinned together. Run `npm ci`
  under the Meri service account so Chromium downloads to a location the process can read. If deployment uses
  a different build account, set the same `PLAYWRIGHT_BROWSERS_PATH` for the install and the service.
- On Ubuntu, run `npx playwright install-deps chromium` and install the `fonts-noto-cjk` OS package. In a
  container, include these system packages and the bundled browser in the runtime image. Chromium runs headless.
- The print browser opens `http://127.0.0.1:${PORT:-3000}`. Set `MERI_PDF_PRINT_ORIGIN` to the app's internal
  HTTP origin if it differs. The PDF route streams NDJSON with `X-Accel-Buffering: no` and a 60-second export
  deadline. A PDF export needs no PDF volume and does not use the planning provider keys.
- Smoke-test a saved Chinese plan with the service account. Check the font, page breaks, contents links and
  download through the reverse proxy. This check reads a saved plan and spends no model quota.

## 6. Code changes still needed before launch (not your scope unless merlin assigns them)

- `src/platform/persistence/database/db.ts` uses node-postgres only for `localhost`/`127.0.0.1`; any other host
  goes to Neon's HTTP driver. A Postgres on another host (e.g. a Docker service name) needs this check widened.
  Then the four multi-step writes in the `transactions-todo` note can become real transactions.
- Captcha (ALTCHA agreed) on Generate plan — not built.
- Trains: VariFlight's `searchTrainTickets` is the default since 2026-11-22 (`RAIL_PROVIDER` unset or `variflight`); do not set `RAIL_PROVIDER=12306` on a server.
- Kimi K2 goes offline end of December 2026: move `LLM_MODEL` to `kimi-k3.1-pro` with a check on the eval set.
- Tianditu tile relay (`/api/map-tiles/…`) uses the server key; check it from the server once.
