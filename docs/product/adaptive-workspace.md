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

## Conceptual Flow

```text
Current user intent
+ TripState
+ ResearchContext
+ Evidence
+ Research progress
        ↓
Typed UI Decision
        ↓
Validation / Ranking / Safety Constraints
        ↓
Deterministic React Renderer
        ↓
Meri Controlled Component Library
```

The decision layer decides how existing product capabilities should be
composed. It does not invent new UI capabilities at runtime.

## Example: Focused Outdoor Decision

User:

> 我不想看详细攻略，就告诉我明天上午去雨崩徒步行不行。

A possible typed UI decision could express:

```text
WeatherTimeline → high relevance / primary
RiskBanner      → high relevance
Map             → low relevance
RouteCompare    → low relevance
EquipmentList   → low relevance

density         → compact
risk priority   → high
companion       → explain
```

The renderer would use these decisions to compose approved Meri components. It
would not execute model-generated React or CSS.

If the user then asks:

> 把三条路线放一起比较。

The decision may change to:

```text
RouteCompare    → primary
Map             → visible
WeatherTimeline → secondary
RiskBanner      → keep
```

The Workspace can therefore respond to changing intent without becoming either
a fixed dashboard or an arbitrary AI-generated interface.

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
Jev or another approach belongs in the product.

## Companion

The Companion may eventually consume the same system state used by the
Workspace decision layer and express meaningful behavior such as:

- `idle`
- `walk`
- `look-map`
- `thinking`
- `warning`
- `success`
- `backpack`

Companion behavior should reflect real Meri state. It should not be driven by
decorative random animation.

For example, the Companion may explain a high-priority risk, look toward a map
when route context becomes primary, or show a success state after a meaningful
research task completes.

## Timing

Do not implement Adaptive Workspace during the current B2C persistence phase.

Meri first needs meaningful research and evidence state. Without that state,
an adaptive UI would mostly become an expensive and premature collection of
`if/else` conditions.

Revisit this architecture only after TripState, ResearchContext, Evidence,
research progress, and current user intent provide enough real product context
to evaluate adaptive composition.

## Current Non-Goals

This vision does not currently authorize:

- adding Jev or another decision framework
- creating UI decision domain types or registries
- changing the current Workspace layout
- generating React or CSS with an LLM
- implementing research or evidence features early
- adding speculative component abstractions

For now, this document exists only to preserve Meri's intended product and
architecture direction.
