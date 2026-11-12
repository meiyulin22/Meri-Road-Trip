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
| Implemented (standalone) | Plan Agent draft for one city or a preview day, runnable with a PlanHandoff and research JSON |
| Planned | Multi-city allocation, plan page display, second-round verification, route and weather tools, durable plan workflow, itinerary storage and display, tracing storage, evaluation |

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
  index.ts           Mastra instance for the Scout trial
  scout-agent.ts     1.0300 trial agent (to be removed when the planner lands)
  tools/             Thin wrappers over src/platform ports, one tool per file
  planner/           First-round Research Agent, Plan Agent draft, and their tests
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
| Mastra instance | [index.ts](index.ts) | Registers the agents. Turns off Mastra's default usage telemetry to PostHog (`MASTRA_TELEMETRY_DISABLED`). No storage or trace exporter yet: run records live in memory. |
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

[research-agent.ts](planner/research-agent.ts) takes a PlanHandoff. It searches
the selected cities. When a city has user-named attractions, code makes one
search for those attractions and another for citywide candidates. For a city
with no named attractions, a Mastra Agent reviews the citywide search results
and can make one follow-up search. A separate structured model call extracts
candidates. Code matches citation IDs and exact quotes against that city's
search results before building spot cards. Unresolved user choices stay in
the output, and unknown fields are null.

The first round researches up to ten cities, two at a time, with a 45-second
deadline and up to two search calls per city. A trip without a confirmed
duration researches its first selected city. A province without selected cities
is reported separately.

Run the first round from the repository root:

```bash
node --env-file=.env.local --import tsx scripts/verify-plan-research.ts path/to/handoff.json
```

The script uses MOONSHOT_API_KEY for both the model and [Kimi Search
Pro](../platform/search/kimi-search-pro.ts). The Generate plan button currently
opens the handoff page. This script runs research independently of the page.

### Plan Agent draft (single city)

[plan-agent.ts](planner/plan-agent.ts) turns research into a
[PlanDraft](../domain/plan/plan-draft.ts). Code allocates the days first: without a
confirmed duration, one preview day in the first selected city; with one city and a
confirmed duration, every day in that city, dated from the start date when it is
exact. Several cities with a confirmed duration return `unsupported` until the Plan
Agent's allocation is built.

One structured Kimi call chooses each day's spots from the candidates, which it sees
under short IDs (`s1`, `s2`…) with their quoted facts and the user's preference
quotes. Each stop has a slot (morning, afternoon or evening) and an optional time
anchor such as a last cable car. Code keeps a stop only if the spot is a candidate in
that day's city and is not already scheduled, and allows four stops a day while the
transport is unknown. An anchor stays only if one of the spot's quoted facts states
that time. In a full plan every requested spot must be scheduled. When the review
finds problems, the model gets one more attempt with them. Whatever still fails is
dropped and reported: unscheduled requested spots and empty days become conflicts,
and scheduled spots list their unknown facts as unverified.

```bash
node --env-file=.env.local --import tsx scripts/verify-plan-draft.ts path/to/handoff.json [path/to/research.json]
```

Without a research file the script runs the first round first. It prints the draft,
the attempts, token usage and timings.

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

The run is a **durable workflow**: each stage's result is stored, so a server restart
resumes instead of starting over, and a later version can pause to ask the user a
question (two possible routes, a closed trail) and continue from the answer.

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
refuses this development machine (HTTP 418): its adapters are built against sample
responses, and a one-request verification script is run by hand on a machine with a
whitelisted IP. The trial times above come from a development machine and are not a
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
