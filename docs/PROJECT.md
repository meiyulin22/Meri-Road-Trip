# Meri

> Your Personal Outdoor Intelligence Companion.

Meri is a personal outdoor intelligence system, designed first for one
traveler and tested on real trips. A Journey begins with an idea and
remains useful as plans become clearer and conditions change.

## 1. Product vision

Meri should help a traveler decide where to go, whether the trip is
feasible, how to get there, when to go, and what to bring. It should
combine the user's preferences with relevant real-world information,
retain uncertainty and evidence, and make the next decision easier.

The Journey is the center of the product. Chat is one way to express
intent; structured Journey state and useful views are the lasting
result. Meri should eventually be useful before departure and during
travel, especially when conditions differ from the original plan.

## 2. User problem

Outdoor planning is fragmented across maps, forecasts, route platforms,
transport sources, local reports, accommodation sites, and gear
information. These sources vary in freshness and reliability. Today the
traveler must reconcile them manually.

Questions Meri should eventually answer include:

- Can I safely and legally access the destination or route?
- How do people actually reach the trailhead, including the last mile?
- Which weather window is suitable at the relevant elevation?
- What has changed since I last checked?
- Is my existing equipment sufficient?

These are product goals, not claims that all research capabilities exist
today.

## 3. Target experience

The traveler can begin with incomplete language, such as “I want to hike
somewhere next month.” Meri creates a persistent Journey, reflects what
it understood, and asks a useful next question. The user can keep
talking or use direct controls.

Information should appear in a form suited to the decision: destination
choices as cards, weather as a forecast or window, routes on a map,
transport as steps, gear as a checklist, risks as alerts, and evidence
as inspectable sources. Those examples describe the direction of the
product; only some presentations exist in the current MVP.

Meri should preserve what the user has established, avoid treating its
own suggestions as user decisions, and say when facts are uncertain. A
user explicitly chooses a destination before it becomes authoritative.

## 4. Current MVP — implemented

The current product is a responsive Next.js PWA with guest-owned,
persistent Journeys. A Trip supplies Journey identity, ownership, and
lifecycle; TripState stores evolving values. The user can create a
Journey from natural language, reopen it, continue a Workspace
conversation, edit state through supported controls, and review the
saved conversation.

Current TripState fields are name, origin, destination, start date, end
date, duration, and transport preference. Values may be known,
approximate, ambiguous, or missing. This state is authoritative;
conversation history and assistant suggestions are not.

The implemented destination flow includes:

- LLM interpretation of the user's meaning, followed by application
  validation.
- Location Provider verification before a proposed destination replaces
  authoritative TripState.
- Destination Disambiguation for a broad or fuzzy place, with
  provider-verified candidates and explicit selection.
- An explicit **[帮我推荐]** action that generates three destination cards.
- Conversational Gen UI: a narrow presentationIntent can trigger the
  same recommendation pipeline when the destination is missing and the
  conversation has useful preference context.
- Persisted assistant messages containing the reply and cards, restored
  when the Journey reopens.
- A planning-readiness view based on the currently available Journey
  state.

Recommendation cards suggest possibilities; they do not establish a
destination. Selecting a card passes through destination validation.
Current recommendations do not perform a Safety / Access Check. Meri
does not yet provide the planned Research Agent, full travel feasibility
assessment, generated Plan, live weather intelligence, or route
research.

## 5. Product principles

**Reality before authority.** An LLM proposal is not proof that a place
exists or that travel there is feasible. Validate destination identity
before persistence. Location Validation and Travel Feasibility are
separate questions.

**AI is not the entire interface.** Conversation helps capture intent,
while the application owns state, workflow, and supported presentations.
The LLM does not generate arbitrary React or decide provider identity.

**Useful uncertainty.** Do not turn ambiguous input or weak external
evidence into false certainty. Important future real-world conclusions
should retain sources, freshness, and confidence.

**User decisions remain explicit.** Meri may suggest destinations or
explain options; suggestions do not become authoritative Journey choices
until the user selects or confirms them.

**Build from actual use.** The first target user is the creator. Real
trips should expose what is missing, confusing, stale, or unreliable.
Keep the product focused on decisions that matter in the field.

**Deterministic when possible, agentic when necessary.** Known steps and
critical business rules belong in workflows. Agentic research is
appropriate only when the next action depends on observed results.

## 6. Near-term roadmap — planned

**Recommendation Workflow v0.1:** use expressed preferences to propose a
broader pool of roughly 8–10 destinations; run a separate Safety /
Access Check; remove officially restricted, closed, or clearly
unsuitable choices; rank the survivors against preferences; show the top
three cards; require explicit selection. This remains a deterministic
workflow. Do not hardcode geography mappings or present the check as
prompt wording alone.

**Generate Plan and Research:** after recommendation, a later Generate
Plan action may start a Research Agent. It should inspect the Journey
and use weather, route, transport, opening/access, risk, and
destination-fact tools as needed. It should observe results, decide
whether further research is needed, produce a research result, and then
support a final Plan. This Agent is not implemented.

Longer-term directions include delta intelligence, background
monitoring, evidence-backed research, personalized memory, gear gap
analysis, and better offline use. Sequence them by real-world usefulness
rather than building a speculative platform first.

## 7. Non-goals for the current phase

- A generic Agent or open-ended research loop in normal conversation.
- Arbitrary UI, generated code, or a generic Gen UI router.
- Hardcoded place-name mappings as a substitute for provider validation.
- Treating a destination match as proof that access, weather, transport,
  or safety is acceptable.
- Building model routers, registries, vector stores, or other broad
  infrastructure before a concrete capability needs them.
- A static itinerary generator, booking system, map replacement, or gear
  store.

## 8. Success criterion

Meri succeeds when the traveler is somewhere unfamiliar, opens Meri
first, and can understand the Journey's current state and the next
meaningful decision without reconciling five separate applications by
hand.
