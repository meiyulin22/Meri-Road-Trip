# Meri Agents

Agents are the part of Meri that decides its own next step. Everything else in the
repository is a fixed flow: a message is interpreted, validated and saved in an order
written in code. An agent gets a goal and a set of tools, and chooses which tool to
call next from what the previous call returned.

The first real agent is the **Planner**, which will stand behind the Generate plan
button. This document is its design contract. It separates what runs today from what
is planned; nothing under "planned" exists in code yet.

| Status | What |
| --- | --- |
| Implemented (1.0300) | Mastra instance, a trial agent, two tools (`resolve-place`, `web-search`), a live verification script |
| Planned | Planner agent, route and weather tools, durable plan workflow, plan storage and page, tracing storage, evaluation |

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
  index.ts           The one Mastra instance; registers every agent
  scout-agent.ts     1.0300 trial agent (to be removed when the planner lands)
  tools/             Thin wrappers over src/platform ports, one tool per file
  planner/           Planned: planner agent, plan workflow, prompts
src/domain/plan/     Planned: Plan types, validation, staleness — pure, no Mastra
src/platform/        Ports and adapters the tools call (Amap, Bocha, Kimi, Postgres)
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
| `resolve-place` | [tools/resolve-place.ts](tools/resolve-place.ts) | The Workspace's own Amap identity check for one Chinese name: a match with province, city and GCJ-02 coordinates, up to five candidates, or a whole province. Says nothing about access. |
| `web-search` | [tools/web-search.ts](tools/web-search.ts) | Bocha search for recent notices, five results at most, each with its source and publish date. A provider failure is `unavailable`, never an error carrying a keyed URL. |
| Kimi model | [../platform/llm/moonshot-chat-model.ts](../platform/llm/moonshot-chat-model.ts) | The one place a Kimi model is built, shared with the structured-output client. Thinking is disabled. |

Run it against the real model and providers:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=1 node --env-file=.env.local --import tsx scripts/verify-agent-tools.ts all
```

It needs `MOONSHOT_API_KEY`, `AMAP_API_KEY` and `BOCHA_API_KEY`, and prints each step's
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

## 4. Planned: the Planner

### Input

A snapshot of the current TripState (destination provinces → cities → spots, dates,
duration, origin, transport preference), the reference date, and the language chosen
on the home page. Not the conversation history: deleted places and unselected cards
must not return through it.

### The run

```text
snapshot TripState
  → research loop      the agent calls tools within the budget
  → structuring pass   a second call turns the findings into the Plan schema
  → validation         code checks the plan against TripState and the tool results
  → save               a new plan version, with the snapshot it was built from
```

The run is a **durable workflow**: each stage's result is stored, so a server restart
resumes instead of starting over, and a later version can pause to ask the user a
question (two possible routes, a closed trail) and continue from the answer.

### Output

A plan is days, each with places and the legs between them. Every fact carries its
source, retrieval time and confidence, and anything not found is listed as unknown
rather than guessed: ticket prices, opening hours, road conditions, availability.

### Validation in code

- Every place in the plan comes from the TripState snapshot.
- A place counts as verified only if a `resolve-place` result in this run says so.
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
| `resolve-place` | Amap place search | Implemented |
| `web-search` | Bocha Web Search | Implemented |
| `get-route` | Amap directions: driving or transit, distance and time | Planned |
| `get-weather` | Amap weather: a few days of forecast only; beyond that, season only | Planned |

All Amap calls share one rate-limited queue ([../platform/amap/amap-fetch.ts](../platform/amap/amap-fetch.ts)),
about three requests per second for the current key, so parallel tool calls queue
rather than fail.

### Budgets

Each run caps steps, tool calls, wall time and tokens. The values are set when the
planner is built and measured, not guessed here.

## 5. Planned: observability and evaluation

Runs will be traced in the OpenTelemetry GenAI conventions and stored in Postgres, so
an evaluation can read any run without depending on Mastra. The evaluation runs a set
of sample Journeys and reports cost, latency (p50/p95), tool calls, completion rate
and quality scores (places drawn from TripState, no invented numbers, unknowns
listed). A LangGraph build of the same planner, measured by the same evaluation, is
the planned comparison.

## 6. Running and deploying

Development runs locally under `next dev`, where a long run has no time limit. The
target host is a VPS in Japan: Kimi (`api.moonshot.cn`) and Amap are in China and the
Neon database is in Singapore, so Japan is near all three. The trial times above
come from a development machine and are not a measurement of the deployed app.

## 7. Decisions

| Date | Decision |
| --- | --- |
| 2026-10-05 | Generate plan is an agent, built on the agent architecture from the start rather than a fixed pipeline first. |
| 2026-10-05 | Mastra over LangGraph: TypeScript like the rest of Meri, built on the Vercel AI SDK v6 Meri already uses, with workflows, tracing and evaluation built in. LangGraph comes later as the comparison. |
| 2026-10-05 | Agents live in `src/agents/`; this README is their document, and `docs/` links here. |
| 2026-10-05 | The plan opens on its own page after Generate plan. |
| 2026-10-05 | Mastra's usage telemetry is off by default. |
