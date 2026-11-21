# Meri Agents

Agents are the part of Meri that decides its own next step. Everything else in the
repository is a fixed flow: a message is interpreted, validated and saved in an order
written in code. An agent gets a goal and a set of tools, and chooses which tool to
call next from what the previous call returned.

The first real agent is the **Planner**, which will stand behind the Generate plan
button. This document is its design contract. It separates what runs today from what
is planned; nothing under "planned" exists in code yet. The planning discussion that
shapes the Planner — business, page, run, tools, memory — is kept in Chinese in
[docs/agent-planner/](../../docs/agent-planner/README.md); decisions move here once they are built.

| Status | What |
| --- | --- |
| Implemented (1.0300) | Mastra instance, a trial agent, two tools (`resolve-place`, `web-search`), a live verification script |
| Implemented (Workspace) | The Generate plan action opens the real plan page with a saved TripState snapshot and source-checked preference quotes |
| Implemented (standalone) | First-round Research Agent and Kimi Search Pro, runnable with a PlanHandoff JSON file |
| Implemented (plan page) | Plan Agent route and days for every selected city (1.2009); the plan page shows the days, time anchors, sources and conflicts |
| Implemented (1.2010) | The plan-generation Mastra workflow, its live progress over Server-Sent Events, and run records, progress events and plan versions in Postgres (section 3, "The plan workflow") |
| Implemented (1.2011) | The Plan Agent may pause the run to ask one question; the answer becomes a preference and the run resumes from its snapshot in Postgres, also after a restart ("Asking the traveller") |
| Implemented (1.2013) | The validation stage: the second round checks opening, closures and booking for the trip's dates; code moves a closed stop, the Plan Agent re-plans what code cannot fix, in a Mastra `dountil` loop ("The validation stage") |
| Implemented (1.2014) | The evaluation set: ten sample trips run through the real workflow, with numbers and code-judged expectations saved per version ("Evaluation") |
| Implemented (1.2117) | Weather from Open-Meteo at each spot inside research; the route's detour guard; outdoor stops kept off poor-weather days ("Weather") |
| Implemented (1.2117 food) | What to eat: three searches a city, advertorials dropped, quotes checked, restaurants named by two sites, Tianditu near the stops, unfound ones kept with their sources ("What to eat") |
| Implemented (1.2117 stays) | Where to stay: one RollingGo search a city stay, three tiers by code, Kimi's pick for lodging preferences, no booking links ("Where to stay") |
| Implemented (1.2117 outfit) | What to wear each day: code's basics from the weather, Kimi's checked additions, a dressing room and a packing list on the plan page ("What to wear") |
| Planned | A near-departure weather refresh, a reviewer agent, tracing storage |

## 1. Why an agent here

A trip plan is research whose next question depends on the last answer. A trail that
turns out to be closed in winter needs an alternative route; a scenic area that needs
a reservation needs its booking rule; a last-mile question needs a search, then a
decision about what to search next. A fixed pipeline either runs every lookup for
every trip or misses the one that mattered.

Two things keep it from becoming an open-ended loop:

- **The agent proposes, code decides.** The agent's plan is validated in code against
  the Journey and against the tool results before anything is saved.
- **Every run has a budget.** Steps, tool calls, wall time and tokens are capped, and a
  run that hits a cap ends with what it has, marked incomplete.

## 2. Where it sits

```text
src/agents/          Mastra instance, agents, and their tools          ← this directory
  index.ts           Mastra instance: the Scout trial and the plan-generation workflow with its real providers
  scout-agent.ts     1.0300 trial agent (to be removed when the planner lands)
  tools/             Thin wrappers over src/platform ports, one tool per file
  planner/           The planner's parts as plain functions: research, map check, route, days, day photos
  workflows/         plan-generation.ts: imports the planner functions and orders them as Mastra steps
src/domain/plan/     Handoff, spot cards, plan drafts and their validation — pure, no Mastra
src/platform/        Ports and adapters the tools call (Tianditu, Bocha, Kimi, Postgres)
```

The usual layer rules hold. `src/domain/` stays free of IO and of Mastra. A tool
holds no business rule of its own: it calls a platform port and reduces the answer to
what a model can reason about. An agent never writes TripState; a plan is a separate
record (section 4).

## 3. Implemented: the trial (1.0300)

The trial proves the stack before the planner is designed on it: Kimi, reached
through Mastra, calling Meri's existing providers.

| Piece | File | Behaviour |
| --- | --- | --- |
| Mastra instance | [index.ts](index.ts) | Registers the agents and, since 1.2010, the plan-generation workflow. Turns off Mastra's default usage telemetry to PostHog (`MASTRA_TELEMETRY_DISABLED`). Mastra's storage is in memory and there is no trace exporter yet; Meri stores plan runs itself. |
| Trial agent | [scout-agent.ts](scout-agent.ts) | Answers one question about places in China with the two tools. The model is built on first use, so importing never needs the API key. |
| `resolve-place` | [tools/resolve-place.ts](tools/resolve-place.ts) | The Workspace's own place check (Tianditu since 1.0702) for one Chinese name: a match with province, city and coordinates (CGCS2000), up to five candidates, or a whole province. Says nothing about access. |
| `web-search` | [tools/web-search.ts](tools/web-search.ts) | Bocha search for recent notices, five results at most, each with its source and publish date. A provider failure is `unavailable`, never an error carrying a keyed URL. |
| Kimi model | [../platform/llm/moonshot-chat-model.ts](../platform/llm/moonshot-chat-model.ts) | The one place a Kimi model is built, shared with the structured-output client. Thinking is disabled. |

Run it against the real model and providers:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=1 node --env-file=.env.local --import tsx scripts/verify-agent-tools.ts all
```

It needs `MOONSHOT_API_KEY`, `TIANDITU_API_KEY` and `BOCHA_API_KEY`, and prints each step's
tool calls and results, step time, token usage and the reply.

### What the trial found

Measured on 2026-10-05 with `kimi-k2.6`, from a local development machine; times depend on where the run starts.

| Case | Result |
| --- | --- |
| Place check before answering | `resolve-place`, then a reply: 2 steps, 4.3 s |
| Recent closure notices | `web-search` and `resolve-place` called **in parallel** in one step: 6.3 s |
| English question about Shangri-La | Looked up as 香格里拉, answered in English: 4.2 s |
| Tools plus a structured result | Works only with a separate structuring pass: 4.7 s |

Four findings shape the planner:

1. **Structured output must be a separate pass.** With the schema on the agent's own
   calls, Kimi skipped the tool, still claimed `verifiedByTool: true`, and padded the
   JSON with hundreds of blank lines (684 output tokens, 14 s). With
   `structuredOutput: { schema, model }` the tool loop finishes first and a second call
   shapes its answer: valid JSON, tools used.
2. **What was verified is decided by code.** The agent's prose said both places were
   "verified by the map tool" while one lookup came back ambiguous. The structuring
   pass got it right, but neither is trusted: verification is read from tool results.
3. **The agent needs today's date.** It searched with "2024 2025" and called a February
   2025 notice "the latest". The planner is given the reference date and judges every
   source's age against it.
4. **The run reports what evaluation needs.** Each result carries steps, tool calls,
   tool results and token usage, cached tokens included. `traceId` is empty until
   tracing storage is configured.

### First-round Research Agent

[research-agent.ts](planner/research-agent.ts) takes a PlanHandoff and
researches the selected cities. For each city, one structured Kimi call
nominates the attractions the city is known for, about three per day of the
city's even share of the trip (four to twelve). The nominations are only
proposals. Code searches them together with the user-named attractions, three
names per search and up to four searches in parallel. A Mastra Agent then
reviews the results and can make one follow-up search. A separate structured
model call extracts candidates. Code matches citation IDs and exact quotes
against that city's search results before building spot cards, so a nominated
name without a quoted source never becomes a card. A card is in the city when its
location quote names the city, in full or by its stem (迪庆 for 迪庆藏族自治州), or
else when the model's `cityName` is the city and appears in the same source. The
model picks the sentence; code only checks the strings (1.2015). Unresolved user choices stay
in the output, and unknown fields are null. Without nominations, code searches
the named attractions, or the city as a whole when there are none.

Search-led discovery was replaced in 1.2004. In the live check of 1.2003 it found
大理海洋世界 and remote counties for Dali but missed 洱海 and 苍山, and found only
three candidates for a three-day Lijiang trip. With nominations the same cases
gave 洱海, 崇圣寺三塔 and 蝴蝶泉 for Dali and seven candidates for Lijiang. A
curated spot catalog is planned to replace the nomination call later.

The first round researches up to ten cities, two at a time, with a 70-second
deadline and up to five search calls per city. Extraction asks for only as many cards
as the city needs, with short quotes; the model answers in a loose shape and each card
is checked on its own, so one overlong quote drops that fact, not the city (1.2009: two
cities in parallel had timed out at 45 s and lost a whole city to one invalid field).
A city that does not finish logs which step failed and how, by error name only. A trip without a confirmed
duration researches its first selected city. A province without selected cities
is reported separately. [researchTasks](planner/research-agent.ts) picks the cities and
[researchCity](planner/research-agent.ts) researches one, reporting each step (nominating,
searching n/m, reviewing, extracting) for the plan page's live line; the workflow runs it
for each city, two at a time.

Run the first round from the repository root:

```bash
node --env-file=.env.local --import tsx scripts/verify-plan-research.ts path/to/handoff.json
```

The script uses MOONSHOT_API_KEY for both the model and [Kimi Search
Pro](../platform/search/kimi-search-pro.ts). It runs research on its own, without the
workflow or the page.

### Map check (1.2006)

[map-check.ts](planner/map-check.ts) looks up each sourced spot card once on Tianditu,
with the card's province and 市 as hints, up to twelve spots a city. A spot counts as
located only when a result inside its own 市 carries its name, allowing an
administrative or scenic-area suffix, so a same-named place in another province
(甘肃 has an 洱海 too) never counts. A located card records its district; a spot not
found stays a card, marked not located, because Tianditu's data is incomplete. The
first failed lookup stops the check for the whole plan with no retry, rate limits
included (the client is built with `retryRateLimit: false`); the remaining spots stay
unchecked and the plan goes on. Judgements are cached in
`.cache/tianditu-spot-locations.json`: found for 30 days, not found for 7, never a
failure. The Plan Agent sees `located` and `district`, prefers located spots, keeps a
district together on one day, and still fills every day.

Live check on 2026-11-13 from saved research: Dali located 洱海 and 崇圣寺三塔 in 大理市
but not 蝴蝶泉 (only same-named places elsewhere); Lijiang located six of seven
(玉龙雪山, 白沙古镇, 东巴谷 in 玉龙纳西族自治县; 丽江古城, 黑龙潭公园, 木府 in 古城区), not
狮子山. Ten lookups took 3.1 s. The three-day Lijiang draft then put the 玉龙县 spots on
day 1, the 古城区 spots on day 2 and 狮子山 on day 3. A first prompt that only said
"prefer located" left day 3 empty rather than use 狮子山, so the prompt now also says
every day needs a stop.

**Inside each city's research since 1.2116.** Research is plan-and-execute with one replan (nominate,
search, one follow-up, extract); locating is now its next fixed step in the same `research-city` step,
so a city goes on the map as soon as its research is done instead of waiting for the slowest city.
The rules hold across cities: Tianditu's own client queue spaces every request 0.3 s apart, process
wide, and one stop shared by the run's cities (`MapCheckStop`) makes the first failure in any city stop
every city's lookups, no retry. `map-check` now only adds the deferred cities and reports the run's
map check as one line. Weather (1.2117) follows as the step after locating (next section).

### Weather (1.2117)

Weather is code, not an agent tool: once a city's spots are located, the same `research-city` step
asks for their forecast, and the Plan Agent reads it when it routes the trip and chooses the days.
The provider sits behind Meri's own port, so Jev can later call the same function as a tool and
QWeather could replace Open-Meteo without touching the planner.

**Provider.** [Open-Meteo](../platform/weather/open-meteo.ts): free, no key, no account and no
bill, for non-commercial use (decided 2026-11-20: Meri charges nothing and has no accounts). It
must be credited wherever weather is shown. Its free tier allows 10,000 calls a day per address;
Meri stops itself at `OPEN_METEO_MAX_CALLS_PER_DAY` (2000 by default), counted across restarts in
`.cache/open-meteo-calls.json` the way Open-Meteo counts: one call per point, double for a range
past two weeks. Requests are 0.2 s apart and wait up to 30 s: from this Mac without the proxy a request
took about 7 s and often more than 10 s (2026-11-20), which first left a whole run without weather;
merlin chose a longer wait over the proxy. A dropped connection or a timeout is tried once more
after two seconds and does not pause weather (2026-11-21: the line dropped mid-run, and the pause
then cost the next city its forecast and every day its outfit); an error answer from Open-Meteo
itself, or an answer in the wrong shape, pauses weather for ten minutes with no retry,
and the plan goes on without it. One probe on 2026-11-20 is the recorded fixture
(`fixtures/open-meteo-lijiang-2026-11-21.json`): 丽江古城 at 2454 m read 2–16°, 玉龙雪山 at
5026 m read −11 to −1° on the same day, because Open-Meteo corrects each point to its elevation.
The same answer had a thunderstorm with 22.5 mm in the town and 64 km/h gusts on the mountain,
the two cases the tests use.

**Which points** ([spot-weather.ts](planner/spot-weather.ts), rules in
[domain/plan/weather.ts](../domain/plan/weather.ts)):

| Step | Rule | Why |
| --- | --- | --- |
| 1. Dates | The trip's dates inside today + 15 days (Beijing); later dates are marked `beyond` and read "check again before you go"; a trip without dates asks nothing | The forecast reaches 16 days |
| 2. Points | A located spot uses its own point; a spot within 2 km of an earlier point shares it; an unlocated spot shares the point most located spots share (the town), and only when nothing in the city was located uses the city's centre (the transfers' cache, else one Tianditu search under the run's stop) | Altitude matters, a mountain and the town below it never share; an old town's sights do. Tianditu's centre for 大理白族自治州 sits at 3,304 m in the mountains (found 2026-11-20), so it is the last resort |
| 3. Request | One request a city for all its points, the dates from first to last | 3–6 points a city stays far under the cap |
| 4. Failure | The city's spots read `unavailable`; nothing is retried | Weather improves a plan, it never blocks one |

Each card keeps its forecast (`SpotCard.weather`: `forecast` with the point's source, elevation,
days and the dates past the reach; or `beyond_range`; or `unavailable`). A city's own weather is
the forecast most of its cards share (`cityForecast`), which is the town where most sights are,
not one mountain top.

**How a day is judged** (agreed 2026-11-20, `outdoorRating`):

| Rating | When | Effect |
| --- | --- | --- |
| poor | rain ≥ 25 mm (大雨), a thunderstorm (WMO 95–99), a heavy-rain or heavy-snow code, snow ≥ 5 cm, or gusts ≥ 62 km/h (Beaufort 8, when cable cars often stop) | Outdoor stops are moved off it when they can be |
| fair | rain ≥ 5 mm, or a 60% chance of rain | Shown only |
| good | anything else | — |

**Outdoor or not.** The extraction call that writes the cards also judges each spot outdoor, indoor
or unsure (`SpotCard.outdoor`). It is the model's judgement, needs no quote, is never shown as a
fact, and is used only to arrange days by weather.

**Route: distance first, then weather, with one route guard.** What decides the order, top first:

| Priority | What | Who holds it |
| --- | --- | --- |
| 1 | The route's rules: every city once, at least a day each and the days add up; no city is left out without cause (fewer days than cities, research found nothing there, or the traveller chose it when asked) | Code (`reviewRoute`) |
| 2 | Distance: never more than 30% longer than the shortest order | Code (route guard) |
| 3 | Weather: among the orders within that 30%, the fewest poor-weather days | Code (route guard) |
| 4 | Taste: which city gets more days, each day's theme | The model |

Weather never buys a longer route; what the route cannot avoid is left to the days, which move
outdoor stops inside a city (below).

1. The route call sees each city's forecast for every trip date (sky, outdoor rating, rain,
   temperatures), and is told: order by distance first; only among orders of about the same length,
   put a city's days on its good-weather dates; never more than 30% longer for weather.
2. Code measures the order: straight lines between city centres (the transfers' cache, else one
   Tianditu search each, none once the map check stopped), from the origin and back to it when the
   origin's point is known. The shortest order is found exactly up to 8 cities (8! = 40,320
   orders) and by nearest-first plus 2-opt above that ([route-distance.ts](../domain/plan/route-distance.ts)).
3. Code also counts the poor-weather days of every order ([route-weather.ts](../domain/plan/route-weather.ts)):
   each city keeps the days the model gave it, its days take the trip's dates in order, and a date
   counts when the city's own weather rates it poor. A transfer day counts like any other (merlin,
   2026-11-20). Only orders within 30% of the shortest are compared.
4. Sent back once, sharing the route's one send-back: when the order is more than 30% longer than
   the shortest (and more than 5 km, so rounding never counts), with both lengths and the best
   order; or, when it is within 30% but another order within 30% meets fewer poor days, with the
   poor days of both ("Your order 丽江市 → 大理白族自治州 meets poor outdoor weather on: 丽江市 on
   2026-11-24. 大理白族自治州 → 丽江市 is no more than 30% longer … and meets poor weather on: none.").
5. Still not the best, or the second answer unusable: code puts the cities in the best order, the
   one within 30% with the fewest poor days, then the shortest; a tie keeps the model's order
   ([reorderRoute](../domain/plan/plan-draft.ts)). Each city keeps its days and its reason; its days
   keep their focus and theme in the same sequence; the transfer days follow the new order.
6. Without centres for every city, with one city, or without forecasts (no dates, or past 16
   days), weather does not count; with fewer than two cities nothing is measured.

**Days: outdoor stops on good days.** `draftCityDays` shows each day's city forecast, and for each
candidate whether it is outdoors and the days its own forecast is poor (`poorWeatherDays`). Code then
looks for an outdoor stop on a poor day of its own point while another day of the same city is not
poor there and has room, or holds a stop that would be fine on the poor day
([plan-weather.ts](../domain/plan/plan-weather.ts)). Those go back with the existing second attempt,
naming a swap when there is one ("Day 1: 玉龙雪山 is outdoors and its forecast that day is poor (gale);
day 2 has better weather there. Swap it with 丽江古城 from day 2, which is fine on day 1, or move it to
day 2."). The swap was added after the first live run, where the model was told only to move 黑龙潭公园
and kept it on its thunderstorm day. An answer replaces the first only with fewer errors, or as many
errors and no more weather issues. A stop still on a poor day stays, and the page shows its forecast
under it. The validation stage's re-planning goes through the same function, so it heeds weather too.

**Page.** Each day's header shows the city's sky and range; the open day says the forecast (and
"not good for being outdoors: …" on a poor day) or "too far ahead, check again before you go"; an
outdoor stop shows its own forecast when its day is poor there or it sits 300 m or more above or below
the town. The plan ends with 「天气为预报，出发前请再查看」 and "Weather data by Open-Meteo.com" linked
to open-meteo.com ([plan-weather.tsx](../components/trip-plan/plan-weather.tsx)).

**How it connects.** The map check decides the weather points (a spot not located falls back to the
city centre, and after a Tianditu failure has no weather at all); the city weather feeds the route
order, bounded by the detour guard; the route's dates decide which day's forecast each stop meets;
the days avoid poor days for outdoor stops; the validation stage's repairs reuse the same rules.
**Measured on 2026-11-20** (four live runs, 大理 + 丽江 + 迪庆 over 4 days from 2026-11-24, then 丽江
alone over 2 days; 丽江 had a thunderstorm with 22.5 mm forecast for the 24th): weather took one
request per city (2–3 points each), and every card had its forecast. The page showed each day's sky
and range, the 「不宜户外」 line, 黑龙潭公园's own thunderstorm line and the Open-Meteo credit. The
detour guard fired once: the model ordered 丽江 → 大理 → 迪庆 (346 km) twice and code put the cities
in the shortest order, 大理 → 丽江 → 迪庆 (252 km); another run chose that order itself. On the
2-day 丽江 trip the stormy day went to 玉龙雪山 and 拉市海, and 丽江古城 and 束河古镇 moved to the dry
day. Two faults were fixed after the first run: a strict `outdoor` field could throw away a
city's whole extraction for one stray value (迪庆 came back with no cards), and the send-back only
said "move it", so 黑龙潭公园 stayed on its thunderstorm day; it now names a swap. Still open: in
the first run the route put 丽江 first, on its thunderstorm day, when 大理 had only rain; with two
cities both orders are the same length, so the weather choice was the model's alone. Since then the
route guard also counts poor-weather days (steps 3–5 above); that case is a unit test, not yet a live run.

Not built: a near-departure refresh within three days of setting off (thresholds and a 「按新天气重排这一天」
action), and official warnings, which Open-Meteo does not have.

### What to wear (1.2117 outfit)

Agreed with merlin on 2026-11-20: code decides the basics so nothing needed is ever missing, and
Kimi adds what only the day's spots reveal. It runs as `day-outfits`, after the drive legs, once
the days are final ([day-outfits.ts](planner/day-outfits.ts), rules in
[domain/plan/outfit.ts](../domain/plan/outfit.ts)).

**Basics, by code.** A day meets the forecasts of its own stops (or its city's weather when no stop
has one). Layers follow the **coldest** point, because the traveller is out all day and does not go
back to change (merlin), so there is no morning and afternoon split:

| Coldest point of the day | Basics |
| --- | --- |
| ≥ 20° | T-shirt |
| 12–20° | long sleeves + windbreaker |
| 5–12° | long sleeves + fleece + waterproof shell |
| 0–5° | thermal top + fleece + down jacket |
| < 0° | the same + thermal leggings + beanie + gloves |

Then: rain ≥ 5 mm or a 60% chance → umbrella; a thunderstorm, ≥ 25 mm, or gusts ≥ 62 km/h → a
waterproof shell instead (an umbrella does not hold in a gale), and waterproof shoes in a storm;
snow → waterproof shoes and gloves; a stop at 3,000 m or more → sunglasses and sunscreen; clear and
25° or more → sun hat and sunscreen; trousers and walking shoes always. Altitude counts only at a
stop's own point, never at the city's weather point. High and low 10° or more
apart: the page reminds the traveller to wear a layer they can take off and carry. Every basic keeps
why, as data (the place and the number), so the page words it in either language. Measured case:
玉龙雪山 −11° at 5,369 m and 丽江古城 2° on one day give down jacket, thermal layers, beanie,
gloves, sunglasses and sunscreen, and the layers reminder.

**Additions, by Kimi.** One structured call for the whole trip sees each day's city, stops (outdoor
flag, setting quote), weather per place and the basics, and may add up to four things a day the
basics miss (knee support for many steps, a hand warmer on a cold cable car, an oxygen can above
4,000 m), each with a slot (head, face, neck, top, mid, outer, hands, legs, feet, bag) and one
reason, plus one tip for the day. Code keeps an addition only with a name of 10 characters or less,
a known slot and a reason, never one named like any basic, worn that day or not (the first live run
added "Umbrella" and "Rain shell"), and no repeats; a long reason or tip is cut. A failed, slow (30 s) or unbuildable call leaves the basics; a trip without any forecast
makes no call. About 300 input and 60 output tokens a day.

**Page.** One dressing room for the trip, placed under the map and like it one tab a day, following
the day opened below ([plan-outfit.tsx](../components/trip-plan/plan-outfit.tsx)): the red panda on
a small pixel stage with rain, snow, wind or sun from the day's reasons; its kit arrives one piece at
a time, bottom layer first; ten equipment slots list what goes where (Meri's additions dashed and
marked); a chosen piece stays bright on the panda and says why; a pixel thermometer shows the
coldest and warmest and where; under it the layers reminder and Meri's tip. Each day card has one
line ("今日穿搭：羽绒服 · 毛线帽 · 手套 · 墨镜") that jumps there. After the days, a packing list
gathers everything with the days it is worn; ticks stay in this browser only. A day past the
forecast says to decide once the forecast is out.

**Measured on 2026-11-20** through the plan page (大理 + 丽江 + 迪庆, 4 days from 2026-11-26): the step
took 10 s for one call over four days and dressed all four; Kimi added ten things (knee brace, face
mask, crampons, an oxygen can for 玉龙雪山 at −12°). The page drew the panda, the slots, the reasons,
the day line and the packing list on desktop and at phone width. Three faults it found were fixed:
Open-Meteo timing out from this Mac (the wait is now 30 s), the city-centre point at 3,304 m (now
the last resort, and altitude counts only at a stop's own point), and additions naming basics.

**Art.** Placeholder pixels on a 32 × 40 grid until Codex draws the red panda as a paper doll: one
still base and one transparent overlay per basic on the same canvas, listed in
`public/companion/outfit/manifest.json` (`version`, `canvas`, `pixelated`, `base`, `items` with
`file` and `z`, optional `icons`), checked by `outfitManifestSchema`. A missing or malformed manifest
means placeholders, never an error; the whole stack bobs in code, so the base must be still.

### Where to stay (1.2117 stays)

Agreed with merlin on 2026-11-20. The step runs after the outfits, only with `HOTEL_PROVIDER=rollinggo`
and `ROLLINGGO_API_KEY` ([plan-stays.ts](planner/plan-stays.ts), rules in
[domain/plan/stays.ts](../domain/plan/stays.ts), adapter [rollinggo.ts](../platform/hotel/rollinggo.ts)).

**Provider.** RollingGo's hotel MCP (`https://mcp.rollinggo.cn/mcp`, `Authorization: Bearer`). Our key
lists four tools, all queries: `searchHotels`, `getHotelDetail`, `getHotelStaticInfo`,
`getHotelSearchTags`; no booking tool. It says free with no call cap, but the Chinese README says
"目前阶段免费使用" and its terms link is empty, so it sits behind the adapter with our own cap
(`ROLLINGGO_MAX_CALLS_PER_DAY`, 300), one call a second, a ten-minute pause after a failure, no
retry. Its prices are reference rates, not live; it has star ratings but no guest scores. Search
results carry a booking link with its partner tracking (`utm_source`); Meri never keeps it: a
commission would make Meri commercial, which Open-Meteo's free tier and a personal (non-business)
ICP filing do not allow (merlin, 2026-11-20). Instead the page builds a plain link to the hotel's
public RollingGo page from its id and the stay's dates only, opened with `noopener noreferrer`, so
nothing tells RollingGo the visit came from Meri (merlin, 2026-11-21; the page needs a login to book). Probe of 2026-11-20 near 丽江古城: five hotels in about
a second, 86 to 910 yuan a night; recorded as fixtures.

**Rules.**

| Step | Rule | Why |
| --- | --- | --- |
| 1. Stays | Consecutive days in one city are one stay; every day is a night except the trip's last day, spent going home; no dates, no stay | One hotel a city, no moving every night |
| 2. Where | Search within 3 km of the stay's middle stop (the located stop with the least total distance to the others); with none located, search the city | The tool takes a place name, not coordinates |
| 3. Three tiers (code) | 10 results; budget ≤ 2 stars, comfort 3–4, luxury 5; in each the nearest with a price | Stable, free, easy to explain; a tier with nothing stays empty |
| 4. Meri's pick (Kimi) | Only when a preference is about budget, companions, walking or things to avoid: one call for the trip picks one hotel a city from that city's list, with a reason; a pick off the list is dropped | Preferences such as 带爸妈要电梯 need reading; the tiers always stay |
| 5. Details | Each shown hotel's own page once: phone, business district, check-in and out, ten facilities, five photos | What a traveller checks before booking elsewhere |

**Page.** A card after each city's last day: Meri's pick with its reason (when there is one), then
the three tiers, each with up to five photos to swipe (the search's cover, then the hotel page's),
stars, reference price a night and for the stay, distance, address, "copy the name", "show on the
map" (a hotel pin over the day's stops), "view on RollingGo (third-party page)" and details. One
line says Meri is a personal project, free, with no ads; the link is a third-party page; Meri takes
no commission and makes no bookings; prices are reference rates; details and photos come from RollingGo. Photos load through
next/image from `image-cdn.rollinggo.cn` only.

### What to eat (1.2117 food)

Agreed with merlin on 2026-11-20 and 2026-11-21 ([plan-food.ts](planner/plan-food.ts), rules in
[domain/plan/food.ts](../domain/plan/food.ts)). There is no open API for 大众点评 or 美团 ratings,
and scraping them is not allowed, so Meri cannot prove which restaurant is best; it can show what
several independent sites recommend, and where that is.

| Step | Rule | Why |
| --- | --- | --- |
| 1. Search | Three Kimi searches a city run: its dishes, restaurants near its middle sight, old local places | A search returns five results; one or two searches rarely gave a restaurant two sources (sample 2026-11-21) |
| 2. Drop promotion | A result whose title or snippet holds 推广, 广告, 赞助, 合作, 软文, 探店, 团购, 品牌推荐, 注册主体, 招商 or 加盟 is never read | The sample held a "TOP5 品牌推荐" advertorial and a piece naming a restaurant's registered company; a ctrip review page with one 探店 post is dropped too, to be safe |
| 3. Quote (Kimi) | One structured call a city: dishes with a quote, restaurants with a quote from every source naming them; diet and avoid preferences go with it | The model reads; code checks |
| 4. Check (code) | A quote must be in its source and name its dish or restaurant; a restaurant needs quotes from two different sites (m.ctrip.com and ctrip.com are one) | A name the model invents, or one site's word alone, never shows |
| 5. Map | Up to four restaurants a city, most-sourced first, looked up on Tianditu with the city as hint; it counts only in the city and within 1.5 km of one of the city's located stops, the nearest such | The sample's 渣渣米线 came back only in 张家口, so the city check matters; a failed lookup stops the step's lookups, no retry |
| 6. Degrade | Found: address, distance and a map pin (three at most). Not found: kept below as "mentioned in articles", "address to check", with its sources (two at most) | merlin, 2026-11-21: say where it is when we can, otherwise show the articles |

**Page.** A card after each city's last day, under the stay card: local dishes with a note and their
source, restaurants with what to order, address, distance, "copy the name" and "show on the map" (a
fork-and-knife pin), then the ones from articles, dashed. One line says it comes from public web
search, Meri takes no payment from any business and filters promotion as far as it can, tastes
differ, and opening hours should be checked before going. A city with nothing reliable shows no card.
About ¥0.045 of search and one extraction call a city.

### Plan Agent: route and days

The Plan Agent is two functions, so the plan page's future chat (routed by Jev) can call
either on its own. Code scopes the plan first ([planScope](../domain/plan/plan-draft.ts)):
without a confirmed duration, one preview day in the first selected city; with one, every
selected city across every day, dated from the start date when it is exact.

[plan-route.ts](planner/plan-route.ts) routes the trip, one city included (1.2009): one
structured Kimi call orders the cities to avoid backtracking, gives each its days with a
short reason, and gives every day a focus district and a theme. With fewer days than
cities it may leave cities out, each with a reason. Code checks that every city appears
exactly once, routed or left out, that cities are left out only when the days cannot hold
them, that the days add up, and that each focus is a district the map located spots in for
that city; it gives one more attempt with the problems, then shares the days out in the
order the cities were added (marked as automatic). The first day in each later city is a
transfer day: no morning stops, one stop fewer, travel time still unknown.

[plan-days.ts](planner/plan-days.ts) chooses one city's days at a time, in route order
(1.2010; before, one call chose every day of the trip). It sees that city's candidates under
short IDs (`s1`, `s2`…) with their quoted facts and the user's preferences: each preference's
kind and the traveller's own words, never the short label shown on the page. A walking limit
or companions lower the daily limit from four stops to three, decided in code from the kinds
(1.2007). Each stop has a slot (morning, afternoon or evening) and an optional time anchor
such as a last cable car. Code keeps a stop only if the spot is a candidate in that day's
city and is not already scheduled. An anchor stays only if one of the spot's quoted facts
states that time. In a full plan every requested spot must be scheduled. When the review
finds problems, the model gets one more attempt with them. Whatever still fails is dropped,
and [finishDraft](../domain/plan/plan-draft.ts) reports it: unscheduled requested spots and
empty days become conflicts, and scheduled spots list their unknown facts as unverified.
Choosing per city lets the page show each city's days as soon as they are drafted; a city's
candidates never belong to another city, so nothing is lost by splitting.

### The plan workflow (1.2010)

[workflows/plan-generation.ts](workflows/plan-generation.ts) is Generate plan as a Mastra
workflow (`@mastra/core` 1.74). It only imports the planner functions and orders them:

```text
plan-generation   input { runId, tripId, handoff }   state { handoff, scope, deferred, pendingProvinces }
  .then(load-scope)                       planScope and the cities to research → one task per city
  .foreach(research-city, concurrency 2)  researchCity: nominate → search → one follow-up → extract → check quotes,
                                          then locate on Tianditu (1.2116) and forecast each spot (1.2117)
  .then(map-check)                        since 1.2116 each city locates inside research-city; this step sums it up
  .then(plan-route)                       planRoute, with each city's weather and the detour guard (1.2117)
  .then(plan-days)                        draftCityDays per city in route order, then finishDraft
  (validation stage: verify-facts, dountil verify-repair; see below)
  .then(drive-legs)                       transport/legs.ts: walk or drive between neighbouring stops (1.2102–1.2103)
  .then(day-outfits)                      dressDays: what to wear each day with a forecast (1.2117 outfit)
  .then(plan-stays)                       planStays: where to stay in each city, when hotel search is on (1.2117 stays)
  .then(plan-food)                        planFood: what to eat in each city (1.2117 food)
  .then(day-photos)                       dayPhotos from the local catalog only
  .then(save-plan)                        a new plan version
```

Dependencies are injected (`createPlanGenerationWorkflow(deps)`): tests pass fakes, and
[index.ts](index.ts) registers the workflow with the real providers, built on first use.

**Progress.** Each step writes events with Mastra's step `writer`; they reach the run's
stream as `workflow-step-output`. Mastra's own `workflow-step-start` and
`workflow-step-result` become the stage start and finish events, with the step's real time
and a summary of numbers taken from its output. The event format is Meri's, in
[plan-progress.ts](../domain/plan/plan-progress.ts), shared by the server and the page: an
envelope `{ runId, seq, at, event }` and events `stage.started`, `stage.activity` (what the
stage does now, as data: a search sent, a spot looked up, a model call started),
`stage.finished`, `scope.ready`, `city.researched`, `map.checked`, `route.ready`, `day.ready`
(one day with the cards it uses), `day.photo` and `run.finished`. Only real work produces an
event; a single long model call is one activity until it returns.

**Runs.** [plan-run-service.ts](../capabilities/planning/plan-run-service.ts) starts a run
in the background and returns at once; the run goes on when the page closes. It reads the
workflow's stream, numbers each event, sends it to the pages following the run at once from
memory, and saves it to `plan_run_events` behind it (waiting for each Neon write first put
the page about eight seconds behind the run). A page follows a run with Server-Sent Events
from `GET /api/trips/[id]/plan-runs/[runId]/events`; EventSource reconnects with
Last-Event-ID and gets only what it missed. Two requests for the same handoff share one run,
and a handoff that already has a plan answers with it. A run has an eight-minute backstop
(each part has its own deadline; ten cities can need about seven minutes). A model that
cannot be reached fails the run as `planner_unavailable`.

**Storage.** Meri keeps the run record (`plan_runs`: handoff, status, error code, usage,
time), every event, and each finished plan as a numbered version with the TripState and
preferences it was built from (`plan_versions`; see [DATABASE_SCHEMA](../../docs/DATABASE_SCHEMA.md)).
Since 1.2011 Mastra's workflow snapshots are in Postgres too (next section); every other
Mastra domain stays in memory. A run that was *working* when the server stopped is not
resumed: the first page that follows it marks it interrupted. A run *waiting for an answer*
resumes from its snapshot.

**Measured on 2026-11-15** through the plan page, 丽江 and 大理 over five days from a
development machine: 40 s and 43 s end to end. Research of both cities in parallel took
25–28 s of that, the route 5–6 s, the days 8–9 s (two calls), and saving the version about
1 s. The first run made one Tianditu lookup (it succeeded; the rest were cached), the second
none. About 2,000 input and 450 output tokens for route and days; research tokens were not
counted then (they are since 1.2014, and are most of a run's tokens).

### Asking the traveller (1.2011)

When the preferences leave the route to taste, the Plan Agent may ask one question before
routing, and the workflow pauses until the traveller answers on the plan page.

- **Who decides.** The route call may return a question (text and two or three options, each
  with the preference kind it expresses) next to its route. Code accepts it only for a full
  trip of two or more cities, only on the first route of a run, and only in a valid shape
  (labels under 24 characters, distinct, a known kind); otherwise the route stands. The
  prompt asks for a question when there are fewer days than cities and no preference says
  which matter more, or when there is no interests or pace preference and the cities differ.
- **Pausing.** The `plan-route` step writes `run.waiting` with the question and returns
  Mastra's `suspend({ question, usage })`. The run's status becomes `suspended`; the page's
  stream ends; the clock stops.
- **Where it is saved.** `@mastra/pg`'s `WorkflowsPG` writes the run's snapshot to Neon, schema
  `mastra`, table `mastra_workflow_snapshot` (one row a run, keyed by workflow name and run id,
  `INSERT … ON CONFLICT DO UPDATE` on every change). The snapshot holds every finished step's
  output, the workflow state, and the suspended step with its payload. `WorkflowsPG` creates
  the schema and table itself on first use; Drizzle does not manage them. [index.ts](index.ts)
  routes only the workflows domain there through `MastraCompositeStore`; without
  `DATABASE_URL` everything stays in memory.
- **Answering.** `POST /api/trips/[id]/plan-runs/[runId]/answer` with `{ questionId, choice }`
  (an option's label, or null for "you decide"). The service checks the run is waiting on
  that question, claims it (`suspended → running` in one UPDATE, so a second answer gets 409),
  saves the choice as a preference (`source: question`), and calls
  `run.resumeStream({ step: "plan-route", resumeData })`. Mastra reloads the snapshot and
  re-runs only `plan-route` onwards: research and the map check are not repeated. The step adds
  the answer to the run's preferences (and so to the saved version), writes
  `question.answered`, and routes again without the option to ask. Events go on numbering
  from the last; the page reconnects with `?after=` its last event.
- **A tight trip is asked, not decided (1.2012).** With a day for every city, the route must
  keep every city; code refuses a route that leaves one out unless the traveller chose that
  city when asked. If the trip feels too tight, the question offers concrete trips: each
  option names the city it leaves out and carries it as `leaveOut`, plus at most one option
  keeping every city. Options never add days or change dates (locked facts). Answering a
  leave-out option lets the resumed route drop exactly that city.
- **Version pin.** `@mastra/pg` is pinned at 1.29.0, released with `@mastra/core` 1.74.0. Its
  1.30.0 declares support for core ≥1.68 but reads seven trace-query exports that core 1.74 does
  not have, and Next refused to build it. Upgrade both together.

Measured on 2026-11-15 through the plan page: 大理, 丽江 and 迪庆 over three days with no
preferences. The run paused after 51 s of work with "Do you prefer a relaxed lakeside pace or
active mountain trekking?" and three options. The dev server was then stopped and started
again; the page showed the same question, the answer resumed the run from its snapshot
(a 23 KB row), and the plan finished at 1 min 14 s of working time with the route themed on
trekking. In a Kimi-only check of the route call, an empty preference list asked 6 times in
6; with interests and pace preferences, once in 3. Before the prompt named these cases, Kimi
never asked. The same check found Kimi sometimes writes an empty city reason, which used to
fail the whole route answer; an empty reason is now just a missing one.

**Who decides to ask (1.2016).** The evaluation found the question going wrong both ways. With
every city fitting and a preference to see more (case 4), Kimi still asked "keep all three cities?"
2 times in 3, following the 1.2012 line about tight trips; the prompt now asks only when no
preference says how the traveller wants a full trip, and a relaxed pace with too little time is still
asked (case 11). Told that, Kimi then stopped asking where it must: two days for three cities with no
preferences (case 3) asked 0 times in 3. That case code can see on its own, so code decides it: with
fewer days than cities and no interests or pace preference, a route without a question is sent back
once with that reason, and if the second answer still does not ask, the first route stands. Two
options leaving out the same city (丽江+大理 and 大理+丽江) are one trip, so only the first is kept.
Rerun (`2026-11-16-1.2016.json`, against `-prompt-only`): case 3 asked 3 of 3, case 4 0 of 3 with
every city kept, case 11 2 of 3 (the third run's 迪庆 research found nothing, so there was no
choice to make).

**A hidden pace direction (1.2017).** Whether a preference such as 紧凑 answers the question is no
longer read by the route call. A pace preference carries a direction the traveller never sees,
`packed` (more in each day, a tight trip is fine) or `relaxed` (fewer things, time to spare), or none
when it says neither (早上别太早). The model judges it once where the preference is made: extraction
at the handoff, a sentence written on the plan page, and the options of a question ("保留三城，紧凑走完"
is packed). It is stored in `trip_preferences.pace` (migration 0013, a CHECK keeps it on pace
preferences only); preferences saved before read as none. Code then decides: with every city
fitting and a packed preference, the route may not ask at all; a relaxed preference lowers the day
to three stops, like a walking limit. The 1.2016 prompt line stays for preferences without a
direction. Live extraction gave 紧凑多看 → packed, 不想太赶 → relaxed, 早上别太早 → none; a written
早上睡个懒觉 → relaxed. Rerun (`2026-11-16-1.2017.json`): case 4 asked 0 of 3, case 3 3 of 3, cases 2
and 11 at most three stops a day. Case 11 (relaxed, three days for three cities) asked 1 of 3, one
run having no 迪庆 cards to choose about: asking there is still the model's call.

**Code asks when the model will not, and the traveller may answer in their own words (1.2018).**
A relaxed traveller is also rushed when, with every city kept, the transfer days leave fewer
travel-free days than cities (three cities in three or four days): one city is left the day they
arrive. Code sees that from the route's transfer days, so it is a second case that must ask, sent
back once like the first. Sent back once, Kimi still sometimes did not ask (1 in 3 for case 11), so
code now builds the question itself: "2天去不了3座城，放弃哪一座？" or "3天去3座城，几乎每天都在换地方",
offering first the cities with the fewest candidates, in Chinese or English. Under the options the
question card has a box for the traveller's own answer. `labelAnswer` reads it once (label, kind,
pace, and a city to leave out, kept only if it is one of the trip's), the words are saved as the
preference, and the city goes to the resumed route as a chosen omission. Whether to ask on a roomy
relaxed trip (case 2, a question about 泸沽湖's distance) is left to the model, as different models
will judge it differently. Live on the plan page: 大理, 丽江, 迪庆 over two days, Kimi did not ask
twice and code asked; the answer 这次不去大理了，丽江和香格里拉各一天 became the preference 不去大理 and
the plan dropped 大理. Rerun (`2026-11-16-1.2018.json`): case 3 asked 3 of 3, case 11 3 of 3 (one
built by code), case 4 0 of 3; case 4 left an empty 迪庆 day twice, from too few 迪庆 cards.

**Areas the traveller named (1.2012).** A Workspace "spot" that is really a county-level area
of its city (大理市 under 大理白族自治州, 香格里拉市 under 迪庆; names ending in 市, 县 or 旗,
not 区, which scenic areas share) is not a place to visit: [isAreaName](../domain/plan/plan-draft.ts)
separates it. Research does not search or schedule it but nominates attractions there, and
the route call sees it as `travellerAreas`, to make it the focus of that city's days. Before,
大理市 became a stop of its own with no source and no map location.

Measured on 2026-11-15 with Kimi only (route call, no search, no Tianditu), 大理, 丽江 and 迪庆:
four days with interests and pace preferences routed all three cities in 4 tries of 4 on the
first attempt (before: a city left out twice, then the automatic fallback). Two days and no
preferences asked in 4 of 4, three of them with one option per city to drop and no extra-day
option. An answer with a question once took Kimi past the route's 30 s, so the route budget is
now 60 s. Research for 大理州 with 大理市 named nominated 洱海, 苍山, 大理古城, 崇圣寺三塔, 喜洲 and
双廊, all in 大理市, and made no 大理市 card.

### The validation stage (1.2013)

After the days are chosen, the plan is checked against when each spot is actually open, and
repaired before it is saved. The stage has room for more checkers (weather and drive times
next) and, later, a reviewer agent; today it has one checker.

```text
plan-days → verify-facts → dountil(verify-repair, until nothing is closed or 2 rounds) → drive-legs → day-photos
```

1. **Collect facts** ([verify-spots.ts](planner/verify-spots.ts)). Every scheduled stop, then two
   unscheduled cards per city as checked replacements, within 24 Kimi searches a run, four at a
   time. One search per spot (`{city} {spot} 门票 是否需要预约 开放时间 {year}`), then one
   structured extraction call per city turns the text into rules: daily hours, weekdays closed,
   month-day ranges closed (with the part that closes, if only part), booking, and vague notices.
   Code keeps a rule only if its quote is in the source found for that spot, the source names the
   spot, and the values are in the quote (周一 for Monday, 18:00, 12月1日, the number of days).
2. **Decide in code** ([availability.ts](../domain/plan/availability.ts)). For each stop on its date
   and slot: closed (a whole-spot weekday or range hits, or an evening visit where it closes before
   18:00), partial (only a part closes), uncertain (a vague notice, or no dates yet), open, or
   unchecked (nothing found). A dated notice older than a year is not used. Booking is a flag, not
   a closure.
3. **Repair** ([plan-repair.ts](../domain/plan/plan-repair.ts), then the Plan Agent). Code moves an
   evening stop that closes early to the afternoon, or a closed stop to another day in its city
   that is open and has room. Days still holding a closed stop go back to `draftCityDays` for
   those days only, without the closed spot and anything kept elsewhere. New stops are checked,
   verdicts are taken again; at most two rounds. A stop still closed leaves its day and becomes a
   `closed_on_day` conflict. Every stop keeps its verdict in `draft.checks` (with booking and where
   it moved from).

Events: `stage.activity` (verifying a spot n/m, re-planning days, round), `spot.checked` for
every stop's verdict (sent again after a repair), `day.ready` for repaired days, and one
`stage.finished` for the whole loop. The run service starts each stage once and keys its timing
by stage, since this stage is two steps.

Measured on 2026-11-15 through the plan page, 丽江 three days from 2026-12-21: the stage took
20–25 s for 7–9 searches. With the first query wording, sources rarely gave hours or booking;
the current wording found both for 玉龙雪山 and 木府. Kimi left a nested `reservation` object
null even when its sources said 无预约不入园, so booking is extracted as flat fields; in two runs
after that it found "需提前7天在小程序预约" for 玉龙雪山 every time. That trip had no closures on its
dates, so moving and re-planning were exercised by tests, not live. A spot searched with nothing
usable found used to read "open that day"; it is unchecked.

The same live check found the day-planning call failing when Kimi wrote a time anchor as a bare
string: that answer shape is now read, and a malformed answer gets the second attempt instead of
failing the run.

### Drive times and the map (1.2100–1.2106)

The map check keeps each located spot's coordinates (1.2100), and the plan page draws the stops
on a Tianditu map (since 1.2104 with Leaflet, from tiles our server relays with the server key, so no
key reaches the page and the map loads behind proxies and abroad; vec plus Chinese labels, paced at
one tile every 120 ms after a burst of English-label tiles was refused with 418); a day with no located stop shows its city
(1.2101). After the validation stage, [transport/legs.ts](transport/legs.ts) asks Tianditu's drive
service (`/drive`, style 0, fastest) for each pair of neighbouring located stops in a day (1.2102):
its distance in km, duration in seconds and the road as `lng,lat;…` (an XML answer labelled
text/html, read in [tianditu-drive.ts](../platform/tianditu/tianditu-drive.ts) and thinned to 200
points). Legs are kept 30 days in `.cache/tianditu-drive-legs.json`, at most 20 lookups a run,
and the first failure stops the rest with no retry; their lookups count as map lookups. The plan
saves them as `draft.legs`; the map follows the road where a leg exists and draws a dashed straight
line otherwise, and each day card shows "about 7 min by car · 4.8 km" before a stop. Measured
2026-11-16: 崇圣寺三塔 → 大理古城, 4.76 km, 448 s, about 80 road points.

**Walking and ways the road does not reach (1.2103).** The legs moved to `src/agents/transport/`, where
the transport agent (trains, flights) will live. Code decides the mode from the straight distance:
1.2 km or less is walked (style 3), farther is driven. Tianditu's walking time is not a walking pace
(1.03 km in 261 s, measured 2026-11-16), so a walk's minutes come from its distance at 4.5 km/h. On
foot from 双廊 to 南诏风情岛 Tianditu answered distance 0 with only the two points: zero is no way,
saved as a `none` leg (straight line, no time). By road it reached the shore and drew a straight line
across the water; since every answer starts and ends at the points asked, the first and last segments,
measured before thinning, are the stretches with no road. Over 300 m, the card says so ("最后约 650 米
地图上没有路（可能要坐船、索道或步行）") and the map dashes it. The card says drive, taxi or "by road" from
the trip's transport preference. Nothing here asks the model why a way is missing; finding the ferry
or cable car with a sourced search is a later checker. Driving between cities and using the times to
re-plan a day are not done yet. Two days no longer share a photo: a day with nothing new goes without.

**Large areas, a colour per day, a line per mode (1.2105).** An end more than 1 km from any road
(`bigAreaMeters`) is a large area, not a point: Tianditu put 洱海 mid-lake, so 洱海 → 南诏风情岛 read
53.8 km in 55 min with the first 1.7 km off road. Such a leg shows no minutes and no kilometres; the
card says "洱海是一大片区域，车程要看具体从哪里出发，无法估算" and the map draws one straight dashed line.
300 m to 1 km keeps the note above. This is a code guardrail on Tianditu's answer, decided by
`legReach` from what is already saved, so older plans read the same way; no model is asked and
nothing is looked up again. Each day has its own colour (six of Meri's tones, repeating), shared by
its lines, pins, map tab and day card; a one-day view greys the other days. A drive is a thick solid
line on a white casing, a walk a thin dotted one, a stretch with no road dashed, with a key below
the map.

**Setting off, changing city and heading home (1.2106).** Code lists the legs from the route and
the origin ([transfer-legs.ts](../domain/plan/transfer-legs.ts)): setting off before day 1, one leg
into every day marked `arrivingFrom`, and the way back after the last day (a preview plan has
none). A missing or only roughly known origin is said, not guessed. A new step after the route,
`transfer-legs`, then gives each leg a rough drive ([transport/transfers.ts](transport/transfers.ts)):
one Tianditu search for each place's centre, read only from an administrative answer whose name is
the one asked ([tianditu-city-point.ts](../platform/tianditu/tianditu-city-point.ts); measured
2026-11-17: 丽江市 → 156530700 at 100.225258, 26.8583), and one drive between the two centres.
Centres are kept 180 days, drives 30; at most 24 lookups a run, the first failure stops the rest. A
one-city trip's way back is the way there reversed; a multi-city trip's starts from its last city
and is asked. City centres, not stops, because a stop can sit in a lake and trains and flights go
city to city. No model is asked: this is the code fallback the transport agent will wrap, and the
step sits where that agent will sit. The days are still drafted as if a transfer takes the
morning. The page shows a card before day 1 and after the last day, a slim strip between the two
days of a change of city, and the roads between cities in ink on the whole-trip map.

**Filling in the origin on the plan page (1.2107).** When the trip had no origin, the setting-off
card offers the same Tianditu place suggestions as the Workspace, so the traveller can only pick a
place on the map, and, when the trip did not say how to travel, drive / train / flight / let Meri
decide. Confirming writes the origin (with its point) to TripState, then re-estimates only setting
off and heading home ([getting-there.ts](../capabilities/planning/getting-there.ts)): the picked
point is used as it is, and one within 25 km of the first city's centre counts as that city. The
plan version gets the new TripState in place, so the plan is not out of date, and the run gets the
matching handoff, so the page finds the same plan after a reload instead of starting a paid run.
The origin is filled once. Train and flight are recorded (`travelChoice`) and the card says they
are looked up next; until 1.2108 the drive stays as a reference. No model is asked. An origin
picked in the Workspace now keeps its point in Generate plan too.

**Trains and the transport agent (1.2108).** The first real agent loop in transport, built as agreed:
the agent decides, code guards. Code decides which legs may be trains: none for a self-driver;
setting off and heading home only when the traveller chose train or let Meri decide (flights are
not wired); every change of city, as the agent's call. Code sets each leg's departure hours. A Mastra
agent with one tool, `search-trains`, decides which legs to search and whether another window is
worth a search (at most 6 a run); a separate structured call then picks train or drive per leg with
a reason, since Kimi skips tools when asked for JSON in the same call. Code keeps a pick only if the
train is one 12306 returned for that leg; a bound leg keeps a train when one was found; otherwise
the quickest train or the drive. Trains come from 12306-mcp 0.3.10 (unofficial web query, query only)
through [platform/rail](../platform/rail/): a subprocess started on the first search, one request every
3 s process-wide, 100 a day, a 30-minute pause after any failure. The adapter checks both stations
belong to the cities (12306 mixes in neighbours), computes arrival from departure plus duration, and
asks a same-weekday reference date beyond the ~15-day presale window. Measured 2026-11-17: start
2.8 s; 丽江 → 大理 on 11-20, 6–13 h: C378 12:00 → 14:22. The first live pick chose to drive, reading
the departure window as an arrival window; the prompt now names it `departureHours`, and the next
pick was C378 with a correct reason (857 + 183 tokens). 上海 → 丽江 had no direct train; transfers
(12306's interline search) are not used yet.

**Journeys with a change (1.2110).** 12306-mcp's own interline tool pages through results in a loop
with no page limit, inside the subprocess where Meri's pacing and daily cap cannot reach, so it is
not used. Instead the agent got a second tool, `search-connection`: for a leg whose direct search
found no train, it names a hub city on the way, and code searches the two halves directly, through
the same budget, and joins them ([train-connections.ts](../domain/plan/train-connections.ts)): the
second train must leave at least 40 minutes after the first arrives at the same station, 90 when the
change crosses the city to another station (said on the card), and within 6 hours; the quickest
three journeys are kept. A run may now make 8 searches; a connection takes two. Measured 2026-11-18:
上海 → 丽江 on 11-20 had no direct train; the agent chose 昆明; code found G201 + Y767, 10:00 → 10:45
next day, 24 h 45 min (3 searches, 9 requests with startup; 1,883 + 372 tokens). Open: the pick's
reason called G201 "the earliest departure" when G1371 left earlier; the train and its times are
checked by code, the prose is not.

**Flights (1.2111).** RollingGo's flight endpoint refused the developer key (401 with Bearer, with
X-Secret-Key and with none; its flight repos are gone), so flights come from VariFlight (飞常准), a
remote MCP paid per call from prepaid credits: `getFlightPriceByCities` at ¥0.25
([platform/flight](../platform/flight/)). It answers with a printed Python dict, read by Meri's own
literal parser, never evaluated. Code decides which legs may fly (setting off and heading home for a
flight or let-Meri-decide choice; a change of city only when the drive is over six hours); the agent
gives the two IATA city codes in `search-flights`, and code drops any row whose airport cities are not
the leg's, telling the agent its code was wrong. At most 4 flight searches a plan and 40 a day (money since 1.2113); any
failure pauses half an hour, an empty balance until the next day. The pick may now be train, flight or
drive; a bound leg keeps the traveller's kind when one was found, and a picked flight must be one
returned. Measured 2026-11-18: 上海 → 丽江 on 12-21, let Meri decide: no direct train; 5 flights; the
agent picked CA8559 07:55 → 11:50, ¥670 (1 flight search ¥0.25, 1,829 + 356 tokens).

**Asking "train or plane?" (1.2112).** When the traveller chose the train and setting off or heading
home takes more than 12 hours on the quickest train found, the run may pause to ask, as agreed: the
agent decides, code guards. Code decides which legs can be asked about. Choosing the train normally
searches no flight, so a leg bound to the train in a run that may ask can search one comparison
flight, and `search-flights` refuses it (at no cost) until the leg's trains are in and the quickest
is over 12 hours or none was found; it counts against the 4 flight searches. The pick sees such a
leg as `askable` instead of bound to the train, recommends what it would, and says with
`askTraveller` whether the traveller should choose; it may say no only when a preference already
says they want the train (a sleeper, a fear of flying). When no preference mentions trains or flying
at all, code asks anyway (the 1.2018 pattern). Code writes the question from the real timetable and
fares ("去程火车最快也要24小时45分（G201/Y767），飞机 CA8559 约3小时55分、¥670。怎么走？"), one question
for both ends, with the fixed options 坚持坐火车 and 改坐飞机 plus the card's own "you decide", and no box
for words. The `transfer-legs` step suspends with the findings (every train and flight found, the
pick) in its snapshot, so the answer decides the legs again with no new search: fly → the agent's
flight or the quickest; stay → the agent's train or the quickest; you decide → the agent's pick, the
flight when it has none. The answer is saved as a preference of kind `other`. The question carries
`step: "transfer-legs"`, and the run resumes at that step; a run may now wait twice (route, then
transport), and its clock leaves out both waits. No train at all: the comparison flight is used
without a question, and the card says no train was found. The plan page's origin fill-in cannot
pause, so it neither asks nor searches the comparison flight; a 「改坐飞机」 button there is later.
Built with unit tests only; not yet run live.

**Changing planes, and a budget in money (1.2113).** VariFlight has no tool that returns connections
with fares: `getFlightTransferInfo` (¥0.25) names the flights and the change city but no price, and
the fare tools list direct flights only. So a change of plane is built like a change of train: when
a leg's direct search finds no flight, the agent names a change city in `search-flight-connection`
(code and city), code makes two fare searches (¥0.50) and joins them
([flight-connections.ts](../domain/plan/flight-connections.ts)): the second must leave at least 1.5 h
after the first lands in the same airport (VariFlight's own 上海 → 迪庆 connection changes in 成都天府
in 1 h 50 min) and 3.5 h at the city's other airport, within 6 hours; the quickest three are kept. Its
fare is the two tickets added, and the card says "两段分开买", never a through fare; another airport is
said plainly. When the agent's city does not join, `suggest-flight-hubs` reads VariFlight's own change
cities from `getFlightTransferInfo` (¥0.25), keeping only connections leaving on the leg's day (the
answer repeats the next days). The cap is now money: ¥2 a plan and ¥20 a Beijing day, reserved before a
call goes out (the agent's calls in one step may run at once) and given back when nothing was sent;
every flight answer tells the agent `budgetLeftYuan`. Both caps, and 12306's searches a plan and
requests a day, can be set in `.env.local` ([provider-limits.ts](../platform/provider-limits.ts));
reaching a daily cap is logged once with what was used. Built with unit tests only; not run live.

**Bocha first, Kimi to fill the gaps (1.2113 step 1).** Both of Generate plan's searches used Kimi's
search_pro. Bocha costs a fraction as much and merlin has prepaid calls, so the first look is now
Bocha ([plan-search.ts](../platform/search/plan-search.ts)): one adapter interface, so research and
the checks did not change, and a Bocha failure or spent day falls back to Kimi for that search. Two
places look again with Kimi, both agent decisions with code guards. In research, the agent's one
follow-up has two tools, `search-city` (Bocha) and `search-city-deeper` (Kimi), for results that are
thin, miss a named spot or lack hours and booking; code still allows one follow-up whichever it picks.
In the second round (plan C, agreed 2026-11-19), code first checks each spot's Bocha results for a
fact worth extracting (a clock time, 预约, 闭馆, 全天开放…); only the spots without one go to the model,
one call per city, which says for each whether a second, Kimi look could find its rules and words the
query, or that there is nothing to find (a lake, an old town open all day). Code keeps the second
looks within the run's 24 searches; if the model cannot be asked, every such spot gets the fixed
wording. A skipped spot stays "not checked": the model's reason is never shown as a fact. Daily caps:
Bocha 500 and Kimi search 150 (500 since the same day, below), from `.env.local`, each logged once when reached. Bocha pages are read
to 550 characters for plans, as Kimi's were. Not measured live yet: whether Bocha's summaries give the
extraction as much to quote as Kimi's chunks did.

**Kimi is the default after all (same day).** Looking again at the 2026-10-29 comparison (six questions,
official sources 6 to 3, and the closures and limits only Kimi found) against the saving (about ¥0.34 a
plan, ¥5 a day at fifteen plans), merlin chose Kimi for both research and checks: `PLAN_SEARCH_PROVIDER`
defaults to `kimi` and Kimi search to 500 a day. Everything above stays as a switch: the agent's deeper
follow-up and plan C's code check and second look work the same with Kimi as the first look. Bocha keeps
Workspace inspiration. Still to try: Kimi's `sites` and `time_window` for the checks.

**A ceiling on the whole site (step 2).** Every Kimi model call, chat and plans alike, goes through one
fetch ([kimi-spend.ts](../platform/llm/kimi-spend.ts)), set in `createMoonshotChatModelFromEnvironment`
and the structured-output client: before a call it checks `PAID_CALLS_ENABLED` and the day's money,
and a refusal answers 403 without reaching Kimi; after it, the answer's usage (input, output, cache
hits) is priced from merlin's 2026-11-19 table and added to the Beijing day in `.cache/kimi-spend.json`,
default ¥40 (`KIMI_MAX_YUAN_PER_DAY`); an unknown model is priced as the dearest. It is an estimate that
guards, not the bill. A new Generate plan is also refused once the site has started 15 that day
(`PLAN_RUNS_PER_DAY`, counted in `plan_runs`, so a restart does not reset it); a saved plan, the same
handoff or a resumed run never counts. The start answers `limited` with the reason and the page says
it with no retry; a run Kimi refused midway ends as `daily_quota` or `paid_calls_paused`, and the
Workspace chat shows "today's demo allowance is used up" or "the demo is paused" instead of "refresh".
The switch also stops Kimi search, Bocha and VariFlight. Measured from 16 saved runs: 10–28k tokens a
plan (11-16/17), 5–14 searches.

**A ceiling on one visitor and one address (step 3).** Defaults raised with merlin on 2026-11-19: 30 plans
a day site-wide, Kimi search 450. A new Generate plan is refused once the visitor has started 3 that
Beijing day on their own trips (counted in the database, leaving out runs that failed on Meri's side), or
once the address has started 6 in 24 hours (kept high for shared office networks, counted in memory and
given back when a run fails; no address is stored). The eleven endpoints that call Kimi share one count,
120 requests an address an hour, and a Workspace message also counts 30 an hour for its visitor; over a
limit the answer is 429 `too_many_requests`, which the chat explains. The address comes only from a
header our own proxy writes ([client-address.ts](../platform/http/client-address.ts)): x-real-ip, then
the last x-forwarded-for entry, since a client can forge the first; no CDN header is trusted (Cloudflare
was taken out the same day, the CDN and captcha left for the deploy, a China server first). A pool of
rotating addresses still gets through; the site's daily caps are for that.

**Choosing on the plan page (1.2115).** The traveller cannot go back to the Workspace once the plan is
made, so a trip with an origin but no way of travelling had nowhere to choose one. The setting-off card
now offers the four choices under its details, and the 1.2107 fill-in takes the choice alone: written
once to TripState and locked, the drives already estimated kept, only the transport agent run (without
pausing to ask), the version and the run's handoff updated in place, no new run. A way of travelling
already set stays locked. The plan page's side of the 1.2112 question is a switch: where setting off or
heading home shows a train over 12 hours and a flight was also found, 「改坐飞机」 (then 「改坐火车」)
changes that leg of this plan from what was already found (`by: "traveller"`), with no model call and
no lookup, and TripState untouched.

**Flying near, then the train (1.2114).** VariFlight's air-rail tool came back with single flights, no
train leg and no fares (probe 2026-11-18), and it only takes airport codes, so a place with no airport
(婺源, 凤凰) cannot even be asked. The journey is built by code instead, like a change of plane: when a
leg's flight search finds no direct flight and trains may be searched, the agent names a city with an
airport near the end in `search-air-rail` (景德镇 for 婺源, 铜仁 for 凤凰); code makes one fare search to
it and one 12306 search from it on the landing day, and joins them
([air-rail.ts](../domain/plan/air-rail.ts)): the train leaves at least two hours after landing (the ride
to the station is not looked up, so it is generous) and within six; the quickest three are kept, the
fare is the two tickets added. The pick may be `air_rail` with its code; with no pick, code takes the
quickest such journey when there is no train, or when it beats the quickest train for a leg not bound
to the train. The card draws it as a plane ticket, "飞到景德镇，换火车 · 共…", says the ride from the
airport to the station is not included, and names both sources. Built with unit tests only.

**A switched-off search says so (1.2113 step 1).** Without `RAIL_PROVIDER` or `FLIGHT_PROVIDER`, that
search is not wired at all: the transport agent is not run for it, and a leg bound to the traveller's
choice reads "没有开启火车查询" / "没有开启航班查询" (`trainsMissing` / `flightsMissing: "off"`) instead
of "couldn't be looked up just now".

### Evaluation (1.2014)

[scripts/eval-plan.ts](../../scripts/eval-plan.ts) runs the cases in
[evals/plan/cases/](../../evals/plan/cases/) through the real workflow, one at a time, as the plan
page would, but in memory. A case is a trip written short (cities and named spots, days, start date,
language, preferences), which option answers a question, how many runs it gets, and what the plan
must show. [eval-plan-score.ts](../../scripts/eval-plan-score.ts) builds the handoff, takes every
number from the run's events and saved plan, and judges the expectations in code: mode, every city
kept, a question asked (with options that name the city they leave out), spots scheduled or not, a
booking rule found, a spot kept off given weekdays, stops a day, no empty day, English text. No
model grades anything yet.

Each run records its time and stage times, tokens (research included: `researchCity` now reports
its three model calls), research and verification searches, Tianditu lookups, route and day
retries, the route's source, the question, cities routed and left out, cards, requested spots
scheduled, stops and empty days, the verdicts and booking rules, conflicts, unverified facts and
repair rounds, plus each day's stops by name. A results file per evaluation goes to
[evals/plan/results/](../../evals/plan/results/), named by date and label, so versions can be
compared. A run whose map check stopped ends the whole evaluation: Tianditu is never retried.

```bash
node --env-file=.env.local --import tsx scripts/eval-plan.ts --label 1.2014 [case-id-prefix ...] [--repeat N]
```

**First evaluation, 2026-11-16** (`2026-11-16-1.2014.json`, 14 runs, cases 3 and 4 three times
each), from a development machine:

| Measure | Result |
| --- | --- |
| Runs finished | 14 of 14 |
| Time | 35–86 s, median 62 s; research 28.5 s and verification 15.2 s are the median's largest stages |
| Tokens | input 9.9k–26.3k (median 22.6k), output 0.5k–2.5k (median 1.8k) |
| Searches | 91 research and 88 verification in all |
| Tianditu | 34 lookups for the five new cities, no failure |
| Expectations | 51 of 57 passed |
| Verdicts on 80 stops | 36 open, 3 uncertain, **41 unchecked**, 0 closed at the end; 17 booking rules |
| Stops a day | 80 on 42 days, about 1.9, under the limit of 4 |
| Retries | the route needed its second attempt 3 times, a day 4 times; no fallback route |

What it found:

1. **迪庆 never gets a card** (case 4, 3 of 3; case 3 too). Research nominated 梅里雪山, 松赞林寺,
   普达措 and 独克宗古城 and found sources, but the extraction gave `cityName: 香格里拉` for every
   spot, even where the quote reads 迪庆藏族自治州香格里拉市. Code accepts only names of the assigned
   市 itself, so the city came back unavailable and the route, rightly with no cards, left it out
   of a four-day trip. Some quotes were also in traditional characters (松贊林寺), which the name
   check does not match. **Fixed in 1.2015** (the location quote may name the city instead):
   rerunning cases 3 and 4 (`2026-11-16-1.2015.json`), 迪庆 had cards in every run and case 4
   kept all three cities 3 times in 3. It also showed two things still open: with 迪庆 back,
   case 4 asked "keep all three cities?" 2 times in 3 although the traveller said a tight trip
   is fine, and once a 迪庆 day stayed empty for want of candidates.
2. **The question is not certain** (case 3): two days for three cities asked 2 times in 3.
3. **Half the stops stay unchecked**: the fixed verification search found nothing usable for 41
   of 80 stops (8 of 9 in case 5).
4. **Days are light**: about two stops a day.

The 北京 Monday case passed: 故宫 was moved off Monday in one repair round, the first live repair.

Run the workflow from the command line, printing each event as it arrives:

```bash
node --env-file=.env.local --import tsx scripts/verify-plan-draft.ts path/to/handoff.json [path/to/research.json]
```

With a research file, the saved cards stand in for research. The script keeps the run and
its version in memory, and its own Mastra instance keeps snapshots in memory too; a question
is answered with its first option, so the resumed half runs as well.

## 4. Planned: the Planner

### Input

A snapshot of the current TripState (destination provinces → cities → spots, dates,
duration, origin, transport preference), the reference date, and the language chosen
on the home page. The handoff can extract preferences from the conversation. The
snapshot defines destination scope and selected spots. Deleted places and unselected
cards cannot return through conversation history.

Planned changes to the handoff: each preference gets a type tag (pace, walking
limit, companions, budget, diet, interests, avoid), and extraction reads the whole
Workspace conversation up to about 30 turns under a token cap. The user does not
return to the Workspace after Generate plan. Facts filled in the Workspace are
locked; a missing fact can be filled once on the plan page and is locked after the
user confirms it.

### The run

```text
PlanHandoff
  → research     discover candidate spots and check user-named places in every selected city
  → outline      the Plan Agent assigns days to cities for a confirmed multi-city trip;
                 code validates; it may pause to ask the user when preferences are too thin
  → rank         score optional spots for each day with Jev, or Kimi initially
  → plan         the same Plan Agent selects spots across the days
  → verify       check scheduled candidates and a few alternatives for the trip dates
  → validate     code orders stops, checks evidence and feasibility, and records conflicts
  → review       a reviewer agent checks the whole plan last, once the baseline works
  → save         a new plan version with the snapshot it was built from
```

Without a confirmed duration, code schedules one preview day in the first selected
city and keeps later days locked until the user provides or confirms the duration.
See [the Planner notes](../../docs/agent-planner/README.md) for the planned allocation
and research rules. Use a separate call to structure the results of a tool loop.

The run is a Mastra workflow (1.2010, above). Its events and results are stored; a run cut
off by a restart is marked interrupted rather than resumed. Pausing to ask the user a
question (two possible routes, a closed trail) and continuing from the answer is next
(1.2011), with Mastra's snapshots stored durably.

### Output

A plan is days, each with places and the legs between them. Every fact carries its
source, retrieval time and confidence, and anything not found is listed as unknown
rather than guessed: ticket prices, opening hours, road conditions, availability.

### Validation in code

- Keep the plan within the snapshot's selected destinations. Keep user-selected spots
  or report a conflict. Additional candidates belong to the plan only.
- A place counts as verified when it has valid place-lookup evidence, including
  eligible cached results.
- Distances and travel times come from route tool results, not from the model.
- Weather numbers appear only from a forecast result for dates it covers (since 1.2117, Open-Meteo, fetched by code).
- A plan that fails validation is not saved; the run records why.

### Plan versions and staleness

A plan is a snapshot, not a second state. It is stored with the TripState it was built
from. When the Journey changes afterwards, the plan is marked stale and the page
offers to regenerate. A plan never writes TripState.

### Tools

| Tool | Source | Status |
| --- | --- | --- |
| `resolve-place` | Tianditu place search (Amap until 1.0702) | Implemented |
| `web-search` | Bocha Web Search | Implemented |
| `get-route` | Tianditu directions: driving or transit, distance and time | Planned |
| `get-weather` | Meri's weather port (Open-Meteo since 1.2117, called by code in research); as a tool for Jev | Planned |

All Tianditu calls share one paced queue ([../platform/tianditu/tianditu-fetch.ts](../platform/tianditu/tianditu-fetch.ts),
one start every 0.3 s), so parallel tool calls queue rather than fail.

### Budgets

Each run caps candidates, steps, tool calls, wall time and input and output tokens.
Research reuses valid spot facts and stops when it has enough evidence and candidates
for the days being planned. Pass compact evidence to the model. Tune the limits
against measured coverage, feasibility and cost.

## 5. Observability and evaluation

The evaluation set runs today (1.2014, "Evaluation" above): sample trips, their cost, time,
searches, coverage, evidence and code-judged expectations. Planned: runs traced in the
OpenTelemetry GenAI conventions and stored in Postgres, so an evaluation can read any run
without depending on Mastra, and model-graded quality scores for what has no rule.

## 6. Running and deploying

Development runs locally under `next dev`, where a long run has no time limit. The
target host is a VPS in the United States (decided 2026-11-12, replacing Japan). Kimi
(`api.moonshot.cn`) and Tianditu are in China and the Neon database is in Singapore, so
reachability and latency from the US are measured before launch. Tianditu's firewall
once refused this development machine (HTTP 418); since 2026-11-12 it is whitelisted
and answers. Tianditu checks still start with a single request and stop at the first
failure. The trial times above come from a development machine and are not a
measurement of the deployed app.

## 7. Decisions

| Date | Decision |
| --- | --- |
| 2026-10-05 | Generate plan is an agent, built on the agent architecture from the start rather than a fixed pipeline first. |
| 2026-10-05 | Mastra over LangGraph: TypeScript like the rest of Meri, built on the Vercel AI SDK v6 Meri already uses, with workflows, tracing and evaluation built in. A LangGraph version is not planned. |
| 2026-10-05 | Agents live in `src/agents/`; this README is their document, and `docs/` links here. |
| 2026-10-05 | The plan opens on its own page after Generate plan. |
| 2026-10-05 | Mastra's usage telemetry is off by default. |
| 2026-11-12 | Research covers every selected city first; the Plan Agent then allocates days and selects spots, and code only validates. The Plan Agent may pause to ask the user. A reviewer agent checks last. |
| 2026-11-12 | Deploy to a US VPS. Tianditu is integrated last, verified by hand on a whitelisted machine. |
| 2026-11-15 | 1.2013: a validation stage after the days. Facts come from fixed searches, not tools the agent chooses; Kimi turns text into rules with quotes; code checks the quotes, computes dates and decides; the Plan Agent only re-plans what code cannot fix, in a `dountil` loop of at most two rounds. A reviewer agent will sit in the same stage when evaluation shows it helps. |
| 2026-11-15 | 1.2011: the Plan Agent may ask one question while routing, with options only (plus "you decide"); not about adding days, which would change locked TripState facts. Mastra's workflow snapshots go to Postgres (`mastra` schema), with `@mastra/pg` 1.29.0 pinned to core 1.74.0. |
| 2026-11-15 | Generate plan runs as a Mastra workflow with live progress over SSE. Mastra's state stays in memory until suspend/resume needs durable snapshots; Meri stores runs, events and plan versions itself. The Plan Agent chooses days one city at a time, so each city's days reach the page as they are ready. A restarted run is marked interrupted, not resumed. |
