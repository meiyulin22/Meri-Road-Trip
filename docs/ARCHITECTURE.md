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

The recommendation workflow now includes candidate generation, an access
check, and ranking. A later Generate Plan phase may use a Research Agent
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

Fields can be known, approximate, ambiguous, or missing. Established
values retain their user or system source. TripState is authoritative
for Journey decisions; conversation history, assistant suggestions,
recommendation cards, and model output are not.

The user can provide only part of a Journey. Origin, dates, duration,
and transport preference are not prerequisites for resolving a
destination. An assistant suggestion never silently changes an
established field.

A TripMessage records the real user or assistant conversation. An
assistant message may carry a narrow presentation. The current
presentations include location candidates and destination
recommendations. These are persisted with message content and restored
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
| Location services | Normalize provider results, validate destination identity, verify disambiguation candidates, and enrich recommendation images. |
| Recommendation use case | Discover context, generate candidates, interpret access evidence, rank eligible choices, enrich images, and build up to three cards. |
| Message services | Persist opening and conversation turns and read history for refresh. |
| UI and API | Submit user actions, show persisted state and conversation, render supported cards, and accept explicit selections. |
| Persistence and provider adapters | Store domain records in PostgreSQL and keep Amap-specific behavior at the boundary. |

External model and provider responses are untrusted. Validate them
before they affect domain state or presentation. Keep provider-specific
fields out of general TripState rules except for an explicitly selected,
validated location identity.

## 4. Current Journey and conversation flow

Journey creation interprets the initial idea into a TripDraft, creates
the owned Trip and TripState, and saves the original user message. The
opening assistant turn acknowledges the established Journey; it cannot
propose new TripState changes or request destination recommendations.

For a later Workspace message:

1. Load the owned Journey, authoritative TripState, and recent persisted
   conversation.
2. Interpret the real user text with a structured output containing
   intent, proposed changes, reply, optional destination disambiguation,
   and presentationIntent.
3. Validate that output. Only the application turns a valid proposal
   into a TripState patch.
4. Validate a proposed destination with the Location Provider before
   authoritative persistence. Other valid fields from the same turn may
   persist independently.
5. Choose the final assistant reply and supported presentation.
6. Persist the real user message and one coherent assistant message,
   then return the persisted result to the UI.

The reply shown in the Workspace is the committed assistant message.
Refresh reads stored messages and presentations; it does not regenerate
cards merely because the Journey reopened.

Critical rules are deterministic. The model may judge meaning and
timing, but it does not generate React instructions, arbitrary cards,
provider identity, or media choices.

## 5. Reality Validation and Destination Disambiguation

**Location Validation asks whether a destination expression can be tied
to a real place. Travel Feasibility asks whether that place is suitable
or accessible for this trip.** A resolved place is not evidence that its
route is open, safe, reachable, or timely. The current product
implements destination identity validation; the broader Safety / Access
Check is planned.

A new destination proposal follows:

User expression → LLM interpretation → Location Provider validation → authoritative TripState update only when resolved.

The Location Provider can return:

- **Resolved:** persist the validated destination.
- **Ambiguous:** keep the previous authoritative destination and show
  provider-returned candidates for explicit selection.
- **Unresolved:** keep the previous destination or missing state and ask
  for clarification.
- **Provider error:** explain that verification is unavailable rather
  than claiming the place does not exist.

For a fuzzy region, Destination Disambiguation may propose a small
number of concrete place expressions. The application verifies these
with the Location Provider before showing candidates. A candidate
becomes authoritative only after the user selects it; provider identity
and coordinates are retained with that selection. Do not hardcode
geography mappings or treat a model-suggested candidate as verified.

The same reality boundary applies when a user selects a recommendation
card. Cards are possibilities, not authoritative locations or proof of
Travel Feasibility.

## 6. Conversation and Gen UI

Workspace interpretation returns a narrow presentationIntent: none or
destination_recommendations. The intent is a semantic signal, not a UI
definition. The server honors a conversational recommendation signal
only when authoritative destination is exactly missing, the turn
proposes no destination change, and it does not request destination
disambiguation.

When the signal is honored, the application passes the real current user
text, prior real conversation, and TripState to the shared recommendation
workflow. It persists one assistant TripMessage with a short reply and
1–3 destination_recommendations cards, or a reply without a presentation
when no candidates survive. The interpreter's provisional reply is not
saved as a second assistant turn.

The explicit [帮我推荐] button continues to persist a TripUserAction and
uses that same generation, enrichment, and presentation core. A
conversational trigger does not fabricate that action. Both paths leave
TripState.destination unchanged until explicit selection and validation.

The current UI renders only known presentation types from persisted
messages. It does not execute model-generated UI code or use a generic
Gen UI router.

## 7. Recommendation Workflow v0.1

Journey-local preferences → Discovery Search → 8–10 candidates → official
access search and LLM evidence interpretation → remove blocked candidates
→ rank eligible candidates → enrich the top 1–3 → cards → explicit user
selection → validated authoritative TripState.destination.

All three searches in that line — discovery, official access evidence,
and card images — are one provider, Bocha's Web Search API, behind three
ports. A single response carries both web pages and images, so the
adapters differ only in which section they read. None of them narrows
`freshness`: Bocha documents the unrestricted default as the better
search and warns that naming a window often matches no pages at all,
which would reach Meri as an absence of evidence rather than a badly
asked question.

The application validates model output and evidence references. Clear and
uncertain candidates remain eligible; a failed access lookup becomes
uncertain and says so in the log, because a candidate nobody could check
is otherwise indistinguishable from one that was checked and found fine.
Image lookup failure leaves imageUrl null for the UI fallback.
The workflow does not assess broader safety or travel feasibility. It is
deterministic and does not use an Agent.

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
