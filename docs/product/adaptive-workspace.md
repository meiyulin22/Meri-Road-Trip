# Meri Adaptive Workspace

## Status

This document records future product and architecture intent only.

Adaptive Workspace is not part of the current B2C persistence phase. This
document does not commit Meri to a decision engine, framework, or implementation
approach.

## Core Principle

Meri should not become a fixed travel dashboard.

The Workspace should eventually adapt to the user's current intent, Journey
state, research state, and real-world evidence. Meri owns a finite, trusted,
typed library of UI components, including components such as:

- `WeatherCard`
- `WeatherTimeline`
- `RouteCard`
- `RouteCompare`
- `Map`
- `RiskBanner`
- `TransportCard`
- `HotelCard`
- `LocationPicker`
- `DatePicker`
- `EquipmentList`
- `CompanionMessage`

A future decision layer may determine:

- which approved components should be visible
- component relevance and priority
- which component is primary
- information density
- layout mode
- whether the Companion should explain something
- emphasis such as risk or weather

The decision layer must not generate:

- React code
- CSS
- arbitrary components
- arbitrary executable UI

The React renderer remains deterministic. It validates a typed UI decision and
composes only components from Meri's controlled component library.

## Journey-Centered World Model

Meri is Journey-centered. It is not map-first, weather-first, content-first, or
chat-first. The Journey remains the stable center while Meri's understanding of
the surrounding world grows and the user's current intent changes.

### Journey State

Journey State represents the user's evolving Journey. In the current codebase,
this authoritative state is represented by `TripState`.

It contains user-established Journey information such as:

- origin
- destination
- dates and duration
- transport and other preferences

Journey State may remain incomplete, approximate, or ambiguous. It describes
the Journey; it is not a UI layout model and should not contain component
visibility, priority, or layout decisions.

### Meri World State

Meri World State is a future conceptual representation of what Meri currently
knows about the Journey and the relevant surrounding real world. It may
eventually combine:

- resolved locations
- `ResearchContext`
- research results and progress
- evidence
- weather
- routes and transport
- risks and equipment implications
- current user intent
- observed real-world changes

This concept must not be implemented now as a speculative giant
`MeriWorldState` interface. Its concrete shape should emerge incrementally as
Location Resolve, `ResearchContext`, Evidence, and Research become real product
capabilities.

### Views Over World State

Map, Weather, Route, Transport, Risk, Equipment, and similar capabilities are
views over the relevant parts of the current Meri World State. They are not the
center of the product.

> Map is not the product. Weather is not the product. Route is not the product.
> They are views over the current Meri World State.

## Conceptual Flow

```text
Journey State
        ↓
Resolve / Research / Evidence / real-world changes
        ↓
Meri World State
        ↓
UI Decision Layer
        ↓
Adaptive Workspace
```

The UI Decision Layer evaluates current intent and the relevant World State. It
produces a typed, validated decision describing which trusted Meri components
should be visible, primary, secondary, compact, or emphasized.

The Adaptive Workspace then uses the deterministic React renderer to compose
only approved components. It does not invent new UI capabilities or generate
arbitrary React and CSS at runtime.

Because the Journey remains authoritative and independent from layout, the same
Journey can produce different Workspace compositions as the user's immediate
intent changes without losing or rewriting Journey State.

## Example: Same Journey, Different Intent

User:

> 明天上午去雨崩徒步行不行？

A possible Workspace emphasis is:

```text
RiskBanner       → high relevance / primary
WeatherTimeline  → high relevance
Trail / Route    → visible
Map              → supporting context
Transport        → secondary
```

The same user then asks:

> 那从丽江怎么过去？

The Journey has not changed, but current intent has. A possible new emphasis is:

```text
TransportTimeline → primary
Map               → high relevance
Route options     → visible
WeatherTimeline   → secondary
RiskBanner        → retain when still relevant
```

The Workspace changes emphasis while preserving the same authoritative Journey
State and accumulated knowledge.

## Decision Boundaries

Any future decision output should be typed, validated, and constrained before
rendering. Code remains responsible for:

- validating component identifiers and inputs
- enforcing safety and product constraints
- rejecting unsupported layouts or values
- applying deterministic ranking rules where required
- rendering approved React components

This preserves a clear division of responsibility:

```text
Hard constraints    → deterministic rules
Semantic UI judgment → model or decision engine
Validation          → code
Rendering           → React
```

A hybrid approach may eventually be more appropriate than assigning every
decision to either rules or a model.

## Jev

Jev is a candidate experimental decision engine. It is not a committed
dependency, and Meri's architecture must not be designed around it yet.

When Meri has meaningful instances of all of the following:

- `TripState`
- `ResearchContext`
- `Evidence`
- research progress
- `CurrentIntent`

Meri should run a small experiment comparing:

1. deterministic rules
2. LLM structured decisions
3. Jev typed decisions

The experiment should evaluate:

- predictability
- latency
- cost
- testability

The result of that experiment—not framework novelty—should determine whether
Jev or another approach belongs in the product. The Journey-centered World
State and Adaptive Workspace product model must remain independent from Jev,
any specific model, or any decision framework.

## Companion

The Companion and Adaptive Workspace may eventually consume the same Meri World
State while making different decisions about how to express it.

```text
Meri World State
├── UI Decision Layer
│       ↓
│   Adaptive Workspace
│
└── Companion Decision
        ↓
    idle / thinking / look-map / warning / success
```

The Companion should express meaningful system or workflow state rather than
act as random decoration. It may eventually explain a high-priority risk, look
toward a map when location context is primary, show thinking while research is
active, or show success after a meaningful task completes.

## Timing

This is a product and architecture direction, not a current implementation
task. Meri does not yet have enough real-world research state to justify an
Adaptive Workspace decision layer.

The implementation order remains incremental:

```text
TripState
    ↓
Location Resolve
    ↓
ResearchContext
    ↓
Evidence / Research
    ↓
Allow concrete Meri World State concepts to emerge
    ↓
Adaptive Workspace
```

Do not create a speculative `MeriWorldState` interface before those preceding
capabilities establish the real data and decisions it must represent. Revisit
Adaptive Workspace only when the repository contains meaningful World State
that can support an honest evaluation of adaptive composition.

## Current Non-Goals

This vision does not currently authorize:

- adding Jev or another decision framework
- creating a speculative `MeriWorldState` interface
- creating UI decision domain types or registries
- changing the current Workspace layout
- generating React or CSS with an LLM
- implementing research or evidence features early
- adding speculative component abstractions

For now, this document exists only to preserve Meri's intended product and
architecture direction.
