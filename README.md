# Meri

Meri is a personal outdoor intelligence companion: a Next.js PWA where a
Journey starts from one sentence of natural language and stays useful as the
plan gets clearer.

The product goals and principles live in [docs/PROJECT.md](docs/PROJECT.md).
The layer contracts and request flows live in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). This file covers how to run the
project and how to find your way around it.

The complete Chinese directory/layer and file guide lives in
[docs/CODEBASE_GUIDE.md](docs/CODEBASE_GUIDE.md). Detailed user operations, state
changes, APIs, and failure boundaries live in
[docs/USER_FLOW_CURRENT.md](docs/USER_FLOW_CURRENT.md).
The database table/field directory and relationships live in
[docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md).

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Every variable is server-side only. None of them may use the `NEXT_PUBLIC_`
prefix, because that would ship the value to the browser.

Required:

| Variable | Used for |
| --- | --- |
| `MOONSHOT_API_KEY` | The LLM behind conversation, extraction, and recommendation |
| `DATABASE_URL` | Neon Postgres connection string |
| `AMAP_API_KEY` | Amap, which validates that a destination really exists |

Optional. Recommendation degrades without it rather than failing:

| Variable | Missing means |
| --- | --- |
| `BOCHA_API_KEY` | Recommendations are generated without discovery search context; access checks and image enrichment are not connected to the current workflow |

The remaining variables in `.env.example` override defaults:
`LLM_MODEL`, `MOONSHOT_BASE_URL`, `MERI_TIMEZONE`, `LLM_DEBUG_OUTPUT`, and
`LOG_LEVEL`.

## Validate

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` runs every `*.test.ts` and `*.test.tsx` file under `src/` through the
Node test runner. Tests sit next to the code they cover.

Database schema changes go through Drizzle Kit:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

## Architecture

Each top-level directory answers one question.

```text
docs/             Product and architecture documents
src/app/          What the URLs are: App Router pages and route handlers
src/components/   What the screen looks like: React components
src/domain/       What Meri's concepts are: pure types and validation, no IO
src/capabilities/ What Meri can do: one directory per capability
src/agents/       What Meri decides for itself: Mastra agents and their tools
src/platform/     How Meri talks to the outside world: ports and adapters
```

Two rules hold the layers apart:

- **`src/domain/` performs no IO.** It defines Trip, TripState, TripDraft, and
  the certainty of each field (`known`, `approximate`, `ambiguous`, `missing`),
  and it validates anything arriving from outside. It never calls a network or a
  database.
- **`src/platform/` implements external integrations.** Application services use
  ports and normalized results; production factories and some route handlers
  assemble the concrete adapters. Browser components also request Meri's own APIs.
  Provider-specific HTTP/SDK handling belongs in adapters, not domain rules.

`src/capabilities/` is named after what the code does, not where it runs, and
holds one directory per capability, so a whole flow reads top to bottom in one
place. It contains no React components.

```text
src/capabilities/journey/         Creating, loading, and updating a Journey
src/capabilities/conversation/    Interpreting a Workspace message and wording the reply
src/capabilities/destination/     Confirming a destination names a real place
src/capabilities/recommendation/  Turning preferences into validated, province-filtered suggestions
```

`src/agents/` holds the parts that choose their own next step. A capability is a
fixed flow written in code; an agent gets a goal and tools and decides which tool
to call from what the last call returned. Its tools are thin wrappers over
`src/platform/` ports, and nothing an agent produces is saved before code has
validated it. Today it holds a trial agent; the Planner behind Generate plan is
designed in [src/agents/README.md](src/agents/README.md).

```text
src/platform/llm/                Structured-output port, Moonshot adapter
src/platform/location-provider/  Location and suggestion ports, Amap adapters
src/platform/search/             Search ports, one shared Bocha Web Search
                                 request and the Discovery Search adapter
src/platform/persistence/        Repository ports at the top, with the Postgres
                                 and in-memory adapters and the Drizzle schema
                                 beneath them
src/platform/identity/           Guest identity
src/platform/observability/      Logger and error serialization
```

### What is authoritative

TripState is the truth about a Journey. Conversation history and anything the
model proposes are not. A destination becomes authoritative only after the
Location Provider confirms the place exists and the user picks it — an LLM
naming a place is not evidence that the place is real.

### One Workspace message, end to end

A message posted to `/api/trip-workspace/messages` is interpreted by the LLM,
validated by the domain, checked against the Location Provider if it proposes a
new destination, persisted, and answered with a reply plus any cards. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the exact step order and the
rules that decide which presentation a turn may produce.

## Deploy to Vercel

Meri uses the standard Next.js build and needs no custom Vercel configuration.
Configure the environment variables above as server-side secrets. Journeys are
stored in Postgres, so they survive instance recycling.

The app ships a web manifest and Home Screen icons, so it installs. Offline use
is not supported yet: there is no service worker or offline cache.

## What's next

- **Decide a turn's presentation in code, not in the prompt.** The model is
  currently asked which cards a turn may show, and the same rule is then
  implemented again in `destination-recommendation-use-case.ts`.
- **Steer off-topic messages back to travel.** Meri should stay a travel
  companion instead of answering as a general chatbot.
- **Generate plan as the Planner agent.** A Mastra agent that researches the
  Journey with tools within a budget and returns a plan code validates before
  saving. Only the 1.0300 trial exists; see [src/agents/README.md](src/agents/README.md).
