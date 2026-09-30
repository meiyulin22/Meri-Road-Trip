# Meri — Technical Architecture

This document separates the architecture running in the current v0.1
product from planned capabilities. Meri owns its domain model; model,
provider, and UI frameworks remain replaceable implementation details.

> Deterministic when possible, agentic when necessary.

## 1. System overview

### Current implemented architecture

Meri is a Next.js and React PWA backed by a TypeScript application layer
and PostgreSQL. A guest owns each persistent Journey. The current path
is:

User + current TripState + recent real conversation
→ Workspace/Home LLM interpretation
→ validated, deterministic application workflow
→ Location Provider validation when a destination is proposed
→ authoritative TripState update
→ persisted Conversation and supported Gen UI presentation

The LLM supplies semantic judgments and proposed data. Application code
validates its structured output, enforces business rules, calls the
Location Provider, persists state and messages, and renders approved UI.
Normal conversation does not run an Agent.

### Planned architecture

The active recommendation workflow includes discovery, candidate generation,
validation, and province filtering. A later Generate Plan phase may use a Research Agent
whose tool choices depend on observed results. That Agent is not implemented.

## 2. Core model and authority

A Trip is the stable Journey identity, guest ownership, and lifecycle
root. TripState contains evolving Journey values. A JourneySummary is a
read model for list cards, not another source of truth.

Current TripState fields are:

- Name
- Origin
- Destination
- Start date and end date
- Duration
- Transport preference

Ordinary fields can be known, approximate, ambiguous, or missing. Destination
is missing or known: areas contain provinces and city/prefecture places, each
with named spots. The display text is derived rather than stored a second time. Established
values retain their user or system source. TripState is authoritative
for Journey decisions; conversation history, assistant suggestions,
recommendation cards, and model output are not.

The user can provide only part of a Journey. Origin, dates, duration,
and transport preference are not prerequisites for resolving a
destination. An assistant suggestion never silently changes an
established field.

A TripMessage records the real user or assistant conversation. An
assistant message may carry a narrow presentation. The current
presentations include destination_choices and destination_recommendations.
Historical location_candidates remain readable through adapters. These are persisted with message content and restored
when the Journey reopens.

A TripUserAction records the explicit destination recommendation button
press. It is distinct from a TripMessage. A conversational
recommendation intent uses the real user turn and does not invent an
action or another user message.

## 3. Major current modules

| Area | Responsibility |
| --- | --- |
| Domain | Trip, TripState, messages, validated changes, and location/recommendation shapes. |
| Journey services | Create and load owned Journeys; apply valid TripState updates. |
| AI interpretation | Extract a TripDraft or interpret a Workspace turn with a constrained structured output. |
| Location services | Normalize provider results, preserve distinct POIs, and verify offered choices before saving. |
| Recommendation use case | Discover context, generate validated candidates, filter settled provinces, and build up to 12 suggestions. |
| Message services | Persist opening and conversation turns and read history for refresh. |
| UI and API | Submit user actions, show persisted state and conversation, render supported cards, and accept explicit selections. |
| Persistence and provider adapters | Store domain records in PostgreSQL and keep Amap-specific behavior at the boundary. |

External model and provider responses are untrusted. Validate them
before they affect domain state or presentation. Keep provider-specific
fields out of general TripState rules except for an explicitly selected,
validated location identity.

## 4. Current Journey and conversation flow

Journey creation interprets the initial idea into a TripDraft containing ordinary
fields and destinationEdit. It saves the owned Journey and original user message.
A destination edit is verified and saved as an assistant offer; destination remains
missing until explicit selection. Without an edit, opening mode replies without
proposing further changes. Opening reply failure leaves the Journey recoverable.

Workspace interpretation returns presentationIntent, changes, destinationEdit,
and reply. There is no separate intent or destinationDisambiguation field.
Ordinary changes receive user authority through domain validation. Destination
changes go through applyDestinationEdit:

- set/add queries expressions, preserves distinct provider IDs and offers choices;
  neither silently writes destination.
- remove matches current saved names. An exact match wins; a prefix must be unique.
  City removal cascades spots and retains the province.
- failed lookup and ambiguous removal produce a factual reply without claiming success.

The server persists one real user message and one assistant message with its supported
presentation. Refresh reads these records; it does not regenerate offers.

## 5. Destination authority and selection

DestinationEditor renders province → city/prefecture → spot. Its search uses
GET /api/trips/[id]/destinations and explicit addition uses POST with query and
provider ID. The server searches again and saves the verified pick. DELETE names
an exact saved province/city/spot; an explicit legacy flag clears old unverified text.

Chat selection uses the owned persisted assistant offer and its choice IDs through
POST /api/trips/[id]/destination-recommendation-selection. Amap rechecks chosen
identities. Add merges with existing areas, including a new spot under an existing
city. Replace compares the offer’s baseDestination with current state and returns
409 if it changed. Same-choice retries reuse the persisted follow-up when applicable.
State-save success followed by reply failure returns the saved TripState and
follow_up_unavailable, allowing the UI to show the actual saved state.

The saved spots currently retain names, not provider coordinates. They express
user preferences for later planning. Historical free-text destinations remain in
legacyText for review; they are not converted into invented city identities.
Location identity verification does not verify opening, safety, or reachability.

## 6. Conversation and Gen UI

presentationIntent is none or destination_recommendations. The application honors
recommendations only when destination is missing or consists of provinces with no
selected city, and destinationEdit is none. A destination edit occupies that turn
with verified choices or a failure reply. The model does not generate UI code.

Both conversational recommendations and the explicit recommendation button use the
shared workflow. Conversational context contains the real user turn and history;
the button separately records TripUserAction. Suggestions do not modify TripState.
Historical presentations adapt into the unified choice UI.

Chat choices are grouped by province with checkboxes and a single batch submit.
DestinationEditor uses the same field-row layout as dates and origin, with an
indented province/city/spot value and a pencil to expand manual search. The manual
search result's Add action remains an explicit selection boundary.

## 7. Recommendation Workflow v0.1

Journey-local context → Bocha Discovery Search → structured LLM generation →
validation and de-duplication → settled-province filtering → persisted suggestions →
explicit selection → Amap verification → saved destination.

Discovery failure degrades to no search context. Search results are unverified
inspiration. The workflow supports up to 12 places and does not call access checking,
ranking or image enrichment. It is ordinary application orchestration, not an Agent
loop or Vercel Workflow runtime. Generate Plan remains a readiness check; city
selection is required and legacy records must be reviewed first.

## 8. Workflow and Agent boundary

Use a workflow when steps and constraints are known: interpret,
validate, enrich, persist, and render. Use deterministic code for
critical business rules, including destination authority, provider
validation, presentation eligibility, and explicit selection.

An Agent is appropriate when the next action cannot be fixed in advance
and depends on earlier observations, conflicting evidence, or failed
tool calls. An LLM judgment inside a workflow does not by itself make
the workflow an Agent.

There is no Agent in the current normal conversation or destination
recommendation flow. Do not add a generic runtime, skill registry, tool
registry, or model router merely because a future Agent may need one.

## 9. Later planned phase: Generate Plan and Research Agent

This phase is planned, not implemented:

Generate Plan
→ Research Agent inspects the current Journey and TripState
→ uses tools as needed for weather, routes, transportation, opening/access restrictions, risks, and POIs or destination facts
→ observes results and decides whether more research is needed
→ produces a research result
→ generates the final Plan

The Agent may need to compare sources, respond to uncertainty, and
choose a different tool after each result. Its eventual execution should
have explicit stopping conditions, tool and time budgets, permission
boundaries, and recoverable errors. These are design constraints for
future implementation, not current runtime features.

Important external conclusions should retain evidence, source freshness,
and uncertainty. Future research should not silently overwrite
user-established TripState. The domain should remain independent of any
particular Agent framework.

## 10. Reliability and deferred decisions

JourneyService applies patches against freshly loaded state and uses repository
compareAndUpdate, retrying up to three times. Production PostgreSQL compares the
raw JSONB state in the UPDATE condition. Destination mutations also supply an
expected destination; a changed destination yields 409 rather than applying a
stale replacement. Ordinary field retries preserve concurrent destination writes.

State mutation and conversation persistence are still separate steps. A chat
request may fail after state was saved; the client asks the user to refresh and
check the result. Selection follow-up failure returns the saved state explicitly.
See [USER_FLOW_CURRENT](USER_FLOW_CURRENT.md) for detailed API and error paths.

- Preserve the distinction between user intent, model proposals,
  provider evidence, and authoritative state.
- Validate structured model output and external data. Invalid output
  must not directly mutate TripState.
- Keep provider adapters replaceable and normalize errors. When
  verification fails, expose uncertainty rather than inventing a result.
- Persist assistant content with its supported presentation so a refresh
  restores the same cards.
- POST retry idempotency for ordinary conversation and recommendation
  generation is a follow-up concern; no generic run system or message
  identity redesign has been added for it.
- Add weather, route, evidence, memory, background monitoring, and
  offline capabilities only as concrete product use requires them.
- Keep high-impact future actions, such as booking or messaging, behind
  explicit user approval.
- Prefer focused services and explicit inputs over speculative
  frameworks. A vector store, generic adaptive UI layer, and Agent
  harness are deferred until real requirements justify them.
