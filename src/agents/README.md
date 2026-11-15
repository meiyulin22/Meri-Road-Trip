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
| Planned | Weather and route checkers in the validation stage, a reviewer agent, tracing storage, evaluation |

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
name without a quoted source never becomes a card. Unresolved user choices stay
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
  .foreach(research-city, concurrency 2)  researchCity: nominate → search → one follow-up → extract → check quotes
  .then(map-check)                        Tianditu, one lookup a spot; the first failure stops it, no retry
  .then(plan-route)                       planRoute
  .then(plan-days)                        draftCityDays per city in route order, then finishDraft
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
none. About 2,000 input and 450 output tokens for route and days; research tokens are not
counted yet.

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
plan-days → verify-facts → dountil(verify-repair, until nothing is closed or 2 rounds) → day-photos
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
- Weather numbers appear only from a forecast tool result for dates it covers.
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
| `get-weather` | QWeather: hourly forecast up to 10 days, sunrise and sunset | Planned |

All Tianditu calls share one paced queue ([../platform/tianditu/tianditu-fetch.ts](../platform/tianditu/tianditu-fetch.ts),
one start every 0.3 s), so parallel tool calls queue rather than fail.

### Budgets

Each run caps candidates, steps, tool calls, wall time and input and output tokens.
Research reuses valid spot facts and stops when it has enough evidence and candidates
for the days being planned. Pass compact evidence to the model. Tune the limits
against measured coverage, feasibility and cost.

## 5. Planned: observability and evaluation

Runs will be traced in the OpenTelemetry GenAI conventions and stored in Postgres, so
an evaluation can read any run without depending on Mastra. The evaluation runs a set
of sample Journeys and reports cost, latency (p50/p95), tool calls, completion rate
and quality scores (destination scope, coverage of selected spots, factual evidence,
and reported unknowns).

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
