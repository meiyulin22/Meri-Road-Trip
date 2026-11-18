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
| Planned | Weather and route checkers in the validation stage, a reviewer agent, tracing storage |

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
  (validation stage: verify-facts, dountil verify-repair; see below)
  .then(drive-legs)                       transport/legs.ts: walk or drive between neighbouring stops (1.2102–1.2103)
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
the leg's, telling the agent its code was wrong. At most 4 flight searches a plan and 40 a day; any
failure pauses half an hour, an empty balance until the next day. The pick may now be train, flight or
drive; a bound leg keeps the traveller's kind when one was found, and a picked flight must be one
returned. Measured 2026-11-18: 上海 → 丽江 on 12-21, let Meri decide: no direct train; 5 flights; the
agent picked CA8559 07:55 → 11:50, ¥670 (1 flight search ¥0.25, 1,829 + 356 tokens).

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
