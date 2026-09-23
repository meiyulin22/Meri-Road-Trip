# Meri — Technical Architecture

> Architecture for a personal outdoor intelligence system.

This document describes the technical architecture behind Meri.

The architecture follows one primary rule:

> The product should own the domain model.
> Frameworks should remain replaceable implementation details.


---

# 1. Architecture Goals

Meri should support:

- Long-running research tasks
- Structured trip state
- Multiple external data sources
- Deterministic workflows
- Agentic execution
- Tool execution
- Reusable skills
- Persistent memory
- Evidence provenance
- Background jobs
- Failure recovery
- Mobile PWA access
- Streaming progress
- Model independence
- Agent framework independence

The architecture should remain understandable enough for one developer to maintain.


---

# 2. High-Level Architecture

                    ┌──────────────────────────┐
                    │         MERI PWA         │
                    │                          │
                    │ Next.js / React          │
                    │ Desktop + iPhone         │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │      Application API     │
                    │                          │
                    │ Trips                    │
                    │ User                     │
                    │ Research                 │
                    │ Intelligence             │
                    └────────────┬─────────────┘
                                 │
                                 ▼
              ┌──────────────────────────────────────┐
              │              MERI CORE               │
              │                                      │
              │ Trip Manager                         │
              │ State Manager                        │
              │ Intelligence Engine                  │
              │ Agent Runtime                        │
              │ Workflow Runtime                     │
              │ Skill Registry                       │
              │ Tool Registry                        │
              │ Memory                               │
              │ Evidence Store                       │
              └──────────────────┬───────────────────┘
                                 │
              ┌──────────────────┼───────────────────┐
              ▼                  ▼                   ▼
          External APIs       Web / Browser       Internal Data
              │                  │                   │
           Weather             Search               Trips
           Maps                Websites             Gear
           Routes              Community            Memory
           Places              Sources              Evidence


---

# 3. Domain Layer

The most important architectural decision is that Meri owns its domain model.

Core domain objects may include:

User
Trip
Destination
Route
WeatherSnapshot
TransportOption
Accommodation
GearItem
Risk
IntelligenceItem
Evidence
ResearchTask
AgentRun

Agent frameworks should operate on these objects.

The domain should not be designed around LangGraph, Mastra, or any specific LLM provider.


---

# 4. Trip

Trip is the Journey identity, ownership, and lifecycle root. Evolving Journey values belong to TripState.

Example:

Trip {
  id
  ownerGuestId (persistence)
  status
  createdAt
  updatedAt
}

Current lifecycle states:

IDEA
PLANNING


---

# 5. Trip State

Trip State represents Meri's current understanding of the trip.

It should contain structured data rather than only conversation history.

Example:

TripState {
  name
  origin
  destination
  startDate
  endDate
  duration
  transportPreference
}

TripState is stored once per Trip. List cards use JourneySummary, a read model derived from Trip and TripState rather than another source of truth.

This distinction is important.

Conversation history is not application state.

The system should be able to understand a Trip without replaying an entire chat conversation.


---

# 6. Intelligence Items

Information discovered by Meri should become structured Intelligence Items.

Example:

IntelligenceItem {
  id

  type: "ROAD_STATUS"

  claim: "Road to trailhead is open"

  value: true

  confidence: 0.87

  observedAt
  validUntil

  evidenceIds[]

  status
}

Possible types:

ROAD_STATUS
TRAIL_STATUS
WEATHER_RISK
TRANSPORT_CHANGE
SNOW_CONDITION
LOCAL_REPORT
GEAR_REQUIREMENT
ACCOMMODATION_CHANGE


---

# 7. Evidence Model

Every important external claim should be traceable.

Evidence {
  id

  sourceType

  sourceUrl

  title

  extractedContent

  publishedAt
  retrievedAt

  authorityScore
  freshnessScore

  relatedClaim
}

This enables:

- Source inspection
- Conflict detection
- Confidence calculation
- Re-verification
- Future research


---

# 8. Agent vs Workflow

Meri intentionally supports both deterministic workflows and agentic execution.

They solve different problems.


## Workflow

Use a workflow when:

- Steps are known
- Inputs are predictable
- APIs are reliable
- Behavior should be deterministic

Example:

Scheduled Weather Update

Scheduler
↓
Weather API
↓
Normalize
↓
Store WeatherSnapshot
↓
Compare Previous Snapshot
↓
Update Trip State


## Agent

Use an agent when:

- The next step is unknown
- Information is incomplete
- Multiple sources may conflict
- Research strategy must adapt
- Tool selection depends on previous results

Example:

Investigate Possible Road Closure

Report detected
↓
Agent
↓
Search authoritative source
↓
Search recent reports
↓
Compare timestamps
↓
Detect conflict
↓
Search additional source
↓
Evaluate route impact
↓
Produce IntelligenceItem


---

# 9. Agent Runtime Abstraction

Meri should not directly couple domain logic to a specific agent framework.

Conceptually:

Meri Core
↓
AgentRuntime Interface
↓
Implementation

Possible implementations:

- LangGraph
- Mastra
- OpenAI Agents SDK
- Custom runtime
- Future frameworks

Example conceptual interface:

AgentRuntime

run(task, context)

resume(runId)

cancel(runId)

getState(runId)

stream(runId)

The application should depend on the interface rather than the framework.


---

# 10. Why Framework Independence Matters

Agent frameworks are evolving rapidly.

Meri should be able to move from:

LangGraph

to:

Mastra

without rewriting:

- Trip model
- Evidence model
- Skills
- Tools
- Database
- UI
- Business logic

Framework-specific code should remain inside an adapter layer.

Example:

agent-runtime/

├── runtime.ts
├── langgraph/
│   └── adapter.ts
│
└── mastra/
    └── adapter.ts


---

# 11. Meri Harness

The Harness is the environment in which agentic tasks execute.

The Harness is not the Agent itself.

Agent:

Decides what to do.

Harness:

Controls how the Agent is allowed to do it.

Conceptually:

                    Agent
                      │
                      ▼
              ┌───────────────┐
              │ Meri Harness  │
              │               │
              │ Tools         │
              │ Skills        │
              │ State         │
              │ Context       │
              │ Permissions   │
              │ Limits        │
              │ Execution     │
              └───────┬───────┘
                      │
                      ▼
                 Real World


---

# 12. Harness Responsibilities

Possible responsibilities:

Execution lifecycle

- Start
- Pause
- Resume
- Cancel
- Timeout

Tool execution

- Validation
- Permission checks
- Retry
- Timeout
- Error normalization

Context

- Trip State injection
- User context
- Relevant memory
- Evidence
- Previous task state

Resource control

- Token budget
- Search budget
- Tool call budget
- Execution time

Observability

- Tool calls
- Agent decisions
- Errors
- Cost
- Duration

The goal is not to rebuild existing observability products.

The goal is to provide the execution guarantees required by Meri.


---

# 13. Skills

Skills represent reusable domain capabilities.

Examples:

skills/

├── weather/
│
├── route-research/
│
├── local-intelligence/
│
├── transport-research/
│
├── gear-analysis/
│
└── accommodation-research/

A Skill may contain:

SKILL.md

Instructions describing:

- Purpose
- Inputs
- Outputs
- Available tools
- Constraints
- Validation rules

and optional executable code.

Example:

weather/
├── SKILL.md
├── weather.ts
├── normalize.ts
└── schemas.ts


---

# 14. Tools

Tools are lower-level capabilities.

Examples:

searchWeb()

fetchPage()

getWeather()

searchPlaces()

calculateDistance()

getElevation()

readTrip()

updateTrip()

saveEvidence()

searchGear()

Tools should ideally:

- Have typed input
- Have typed output
- Be independently testable
- Avoid embedding agent reasoning
- Be reusable across Skills


---

# 15. Skill vs Tool

Tool:

> Get weather forecast for latitude/longitude.

Skill:

> Analyze mountain weather conditions for this trip.

The Skill may use:

getWeather
getElevation
getSunrise
readTrip

and combine them into a domain capability.

Agent:

> Determine whether weather analysis is required for the current task.


---

# 16. Skill Registry

The Harness should maintain a registry of available skills.

Example:

SkillRegistry

weather
routeResearch
localIntel
transport
gear
stay

Each skill can declare:

name
description
input schema
required tools
permissions
execution mode

This allows the Agent Runtime to discover capabilities without hardcoding every possible execution path.


---

# 17. Tool Registry

Tools should also be registered.

Example:

ToolRegistry

weather.getForecast
maps.search
maps.route
web.search
web.fetch
trip.read
trip.update
evidence.save

The Harness controls access to these tools.


---

# 18. Permission Model

Not every agent execution should have access to every capability.

Example permission levels:

READ

Read:
- Trip
- Weather
- Evidence
- Search results

WRITE

Modify:
- Trip State
- Research state

NETWORK

Access:
- Search
- External APIs
- Browser

ACTION

Future capabilities:
- Booking
- Messaging
- Purchasing

High-impact actions should require explicit human approval.


---

# 19. Memory

Meri needs several different kinds of memory.

They should not be treated as one giant vector database.


## User Memory

Long-term user preferences.

Examples:

- Travel style
- Gear ownership
- Transportation preferences
- Accommodation preferences


## Trip Memory

Information specific to one trip.

Examples:

- Decisions
- Research
- Route choices
- Rejected alternatives


## Execution Memory

Temporary state used during an agent run.

Examples:

- Current plan
- Tool results
- Pending questions
- Intermediate reasoning state


## Evidence Memory

External information collected from sources.

This should remain structured and traceable.


---

# 20. Context Management

The Agent should not receive the entire database or entire conversation every time.

Context should be assembled dynamically.

Task
↓
Context Builder
↓
Relevant Trip State
+
Relevant User Memory
+
Relevant Evidence
+
Relevant Previous Results
↓
Agent Runtime

As histories grow, Meri may introduce:

- Summarization
- Context compaction
- Relevance retrieval
- State snapshots


---

# 21. Research Loop

A generic research task may follow:

Goal
↓
Understand Current State
↓
Identify Missing Information
↓
Choose Skill / Tool
↓
Execute
↓
Evaluate Result
↓
Enough Evidence?
│
├── YES → Produce Result
│
└── NO
     ↓
Choose Next Action
     ↓
Continue

This loop should have explicit stopping conditions.

Examples:

- Goal satisfied
- Confidence threshold reached
- Search budget exceeded
- Tool budget exceeded
- Timeout
- No meaningful new evidence


---

# 22. Background Jobs

Not every background task should involve an Agent.

A scheduler may handle:

Weather refresh
Route refresh
Trip reminders
Evidence expiration
Pre-trip research

Example:

T-7 days
Initial weather research

T-72 hours
Refresh

T-24 hours
Refresh

Trip morning
Latest update

If a deterministic update detects something unusual, it may create an Agent task.

Example:

Weather Job
↓
Significant Change Detected
↓
Research Task
↓
Agent Runtime


---

# 23. Delta Engine

The Delta Engine compares previous and current state.

Previous State
+
New State
↓
Diff
↓
Significance Evaluation
↓
Action

Example:

Wind

Previous:
15 km/h

Current:
45 km/h

Difference:
+30 km/h

Impact:
Potentially significant

The Delta Engine should use deterministic logic where possible.

An Agent can be invoked when interpreting the impact requires broader context.


---

# 24. Data Sources

Meri should treat external systems as data sources rather than dependencies embedded throughout the application.

Potential categories:

Weather

- Forecast APIs
- Mountain weather data
- Satellite-derived information

Maps

- Map APIs
- Routing
- Places
- Elevation

Outdoor

- Route databases
- GPX
- Trail information

Web

- Search engines
- Official websites
- Travel blogs
- Community reports

Commerce

- Gear manufacturers
- Retailers
- Marketplaces

Accommodation

- Booking services
- Maps / places

Not all sources need to exist in V1.


---

# 25. Source Adapters

External sources should be normalized behind adapters.

Example:

WeatherProvider

getForecast(location, timeRange)

Possible implementations:

ProviderA
ProviderB
ProviderC

The Meri domain should consume normalized WeatherSnapshot objects rather than provider-specific responses.


---

# 26. Reliability

External data will fail.

Meri should expect:

- Timeout
- Rate limits
- Missing fields
- Changed HTML
- API failure
- Invalid model output
- Conflicting information

The system should support:

Retry
↓
Fallback
↓
Degraded Result
↓
Expose Uncertainty

Failure should not automatically become hallucinated data.


---

# 27. Structured Output

LLM output used by application logic should be validated.

Example:

Zod / JSON Schema

ResearchResult {
  conclusion
  confidence
  evidence[]
  unresolvedQuestions[]
}

Invalid structured output should not directly mutate Trip State.


---

# 28. Model Layer

Meri should remain model-independent.

Conceptually:

ModelRouter

reasoning()
fast()
vision()
embedding()

Different workloads may use different models.

Examples:

Simple extraction
→ inexpensive fast model

Complex research
→ stronger reasoning model

Image / gear identification
→ vision-capable model

The domain should not depend directly on a specific provider.


---

# 29. Model Routing

Future model routing may consider:

- Task complexity
- Cost
- Latency
- Context size
- Vision requirement
- Reliability requirement

Example:

Task
↓
Classifier / Rules
↓
Simple
→ Fast Model

Complex Research
→ Strong Reasoning Model


---

# 30. Backend

Recommended initial backend:

TypeScript / Node.js

Possible architecture:

Next.js
+
API layer
+
Meri Core
+
Background worker

The backend may later be separated if long-running Agent workloads require independent scaling.


---

# 31. Frontend

Recommended:

Next.js
React
TypeScript

UI responsibilities:

- Trip dashboard
- Map
- Weather
- Intelligence feed
- Gear
- Evidence
- Agent progress
- Settings

The UI should remain product-first rather than chatbot-first.


---

# 32. PWA

Meri should support installation as a PWA on iPhone.

Initial PWA goals:

- Home screen installation
- Responsive mobile UI
- Cached application shell
- Trip dashboard
- Graceful poor-network behavior

Future possibilities:

- Offline trip state
- Cached maps / route information
- Push notifications
- Background synchronization

Offline capability is especially relevant to outdoor use.


---

# 33. Database

Recommended initial database:

PostgreSQL

Possible major tables:

users
trips
trip_states
routes
weather_snapshots
gear_items
intelligence_items
evidence
research_tasks
agent_runs
tool_executions

A vector store should only be introduced when semantic retrieval becomes necessary.

Do not introduce one simply because the project uses AI.


---

# 34. Streaming

Long-running research should stream progress to the UI.

Possible technologies:

Server-Sent Events
or
WebSocket

Example:

Research started

Searching route information...

3 sources found

Checking recent reports...

Potential conflict detected

Verifying...

Trip State updated


---

# 35. Suggested Repository Structure

meri/

├── apps/
│   └── web/
│
├── packages/
│   ├── core/
│   │   ├── trip/
│   │   ├── intelligence/
│   │   ├── evidence/
│   │   └── memory/
│   │
│   ├── agent-runtime/
│   │   ├── runtime.ts
│   │   ├── langgraph/
│   │   └── mastra/
│   │
│   ├── harness/
│   │   ├── execution/
│   │   ├── permissions/
│   │   ├── context/
│   │   └── registry/
│   │
│   ├── skills/
│   │   ├── weather/
│   │   ├── route/
│   │   ├── transport/
│   │   ├── local-intel/
│   │   └── gear/
│   │
│   ├── tools/
│   │   ├── web/
│   │   ├── weather/
│   │   ├── maps/
│   │   └── trip/
│   │
│   ├── providers/
│   │
│   └── db/
│
├── workers/
│   └── research/
│
└── docs/
    ├── PROJECT.md
    └── ARCHITECTURE.md


---

# 36. MVP Architecture

Do not build the entire architecture immediately.

V1 should contain only what is required.

PWA
↓
Next.js API
↓
Trip Service
↓
PostgreSQL

+

One Intelligence Skill
↓
Agent Runtime
↓
Tools
↓
Evidence
↓
Trip State

This is enough to prove the architecture.


---

# 37. Evolution

Phase 1

Trip
+
Weather
+
PWA

Phase 2

Research Skill
+
Evidence

Phase 3

Agent Runtime
+
Adaptive research

Phase 4

Additional Skills

Route
Transport
Local Intelligence
Gear

Phase 5

Delta Intelligence
+
Background monitoring

Phase 6

Personal Memory
+
Offline outdoor experience

The phases are intentionally flexible.

Real-world usage should determine priority.


---

# 38. Architectural Principle

The most important principle of Meri is:

> Do not build an Agent because Agent technology is interesting.

Build normal software wherever normal software is sufficient.

Use an Agent only when the problem requires:

- adaptive reasoning
- unknown execution paths
- dynamic tool selection
- incomplete information
- conflicting evidence
- open-ended research

Meri is an outdoor product first.

The Agent architecture exists to make the product possible.


---

# 39. Final Architecture Vision

Eventually:

                         MERI PWA
                            │
                            ▼
                        MERI CORE
                            │
                 ┌──────────┴──────────┐
                 │                     │
             Workflows              Agents
                 │                     │
                 │              Agent Runtime
                 │                     │
                 │                 Harness
                 │                     │
                 └──────────┬──────────┘
                            │
                     Skill Registry
                            │
           ┌────────────────┼────────────────┐
           │                │                │
        Weather           Route          Local Intel
        Transport         Gear           Stay
           │                │                │
           └────────────────┼────────────────┘
                            │
                       Tool Registry
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
         APIs             Browser          Database
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                        Real World


Meri's responsibility is not to replace the real world.

Its responsibility is to continuously understand the parts of the real world that matter to the current trip.
