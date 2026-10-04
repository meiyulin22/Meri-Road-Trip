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
user explicitly chooses a destination before it becomes authoritative:
naming it in their own words is that choice when the provider matches it
exactly; anything Meri suggested or had to interpret is confirmed by a click.

## 4. Current MVP — implemented

The current product is a responsive Next.js PWA with guest-owned,
persistent Journeys. A Trip supplies Journey identity, ownership, and
lifecycle; TripState stores evolving values. The user can create a
Journey from natural language, reopen it, continue a Workspace
conversation, edit state through supported controls, and review the
saved conversation. A 「中 | EN」 toggle on the home page switches the
interface language; so far only the home page follows it, and the
Workspace and Meri's replies are still in Chinese.

Current TripState fields are name, origin, destination, start date, end
date, duration, and transport preference. Ordinary values may be known,
approximate, ambiguous, or missing. Destination is missing or known and
stores provinces, cities/prefectures, and named spots under each city. This state is authoritative;
conversation history and assistant suggestions are not. Start date, end date and duration
describe one span: when any two are exact, the third is derived (counting inclusively), and
the Journey overview edits them together as 「何时」 with a range calendar.

The implemented destination flow includes:

- Destinations in China only, for travellers from any country: prompts limit
  suggestions to China and mention the scope only when a place outside China comes
  up; recommendation output and destination additions check a shared province-level
  coverage list. City/spot
  identity still requires Amap verification. Old records remain readable and removable.
- LLM interpretation into explicit destination edits: set, add, remove, or none.
- Both set and add produce additive choices, preserving saved provinces, cities
  and spots. Only explicit removal of named existing places deletes them; new
  conversation turns no longer create whole-destination replacement offers.
- Amap verification of every place expression. A name the user typed that Amap
  matches exactly — one place, and the provider's name is the user's words plus only
  an administrative or scenic-area suffix (大连 → 大连市) — is added at once. A typo,
  several possible places, a broad region, or a name the model rewrote is offered
  as choices instead. Chat offers use checkboxes and one batch confirmation; manual
  search uses a result's Add action.
- Chat choices stop at city/prefecture level. User-named spots appear as preferences
  under that city. Repeated POIs for the same province/city/preference show once;
  this does not resolve the exact POI for future planning.
- Province → city/prefecture → spot display with continued additions and removals.
  Removing a city removes its spots and retains the province. Removing a spot keeps
  the city; removing a province removes all its children.
- Manual destination search and explicit addition after provider verification.
- Discovery Search, structured recommendation generation, and filtering to the
  user’s settled provinces — or, when the user asks for somewhere else, to provinces
  not yet saved. Up to 12 suggested places may be shown; selection rechecks identity
  with Amap before saving. An explicit request is enough to get cards. Meri's reply
  is shown first and the cards follow as their own message once chosen.
- Persisted assistant offers restored when the Journey reopens. Add offers can
  extend existing destinations; replacement offers reject changes to their base state.
- Older free-text destinations remain visible as unverified records until the user
  searches again or explicitly clears them.
- Planning readiness requires a saved destination (a whole province is enough) and
  no unverified legacy record. One Generate plan sits under the conversation; while
  it cannot proceed it stays disabled and explains how to add a destination.
- Destination recommendations are requested in conversation; there is no separate
  recommendation button.

Location identity does not establish access, safety, or travel feasibility.
The active recommendation workflow does not run access checks or ranking. Cards,
the photo ring around the Journey globe and the title thumbnail show Amap photos
chosen by a recommended landmark or a national scenic area; they decorate a place
and are not evidence about it. Research Agent, generated Plan, live weather intelligence, and route
research remain planned.

## 5. Product principles

### Conversation UX

**有偏好就推荐；没偏好就引导；有目的地就规划。** Preference → Recommend; No preference → Guide; Known destination → Plan. Recommendation cards help the user clarify a choice through conversation. The user can receive value before filling every Journey field; deeper feasibility verification belongs to later Research.

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
until the user selects or confirms them. A place the user names in their
own words and the provider matches exactly is already their choice, so it
is not asked again; the model's rewording of it is not.

**Build from actual use.** The first target user is the creator. Real
trips should expose what is missing, confusing, stale, or unreliable.
Keep the product focused on decisions that matter in the field.

**Deterministic when possible, agentic when necessary.** Known steps and
critical business rules belong in workflows. Agentic research is
appropriate only when the next action depends on observed results.

## 6. Near-term roadmap — planned

**Recommendation Workflow v0.1 — implemented:** the deterministic workflow uses
Discovery Search as context, generates validated province/city suggestions, and
restricts them to settled provinces. Each place carries a representative landmark
used only to pick its photo. Access checking and ranking are not connected to this
workflow. Explicit selection and identity verification are required.

**Generate Plan and Research:** after recommendation, a later Generate
Plan action may start a Research Agent. It should inspect the Journey
and use weather, route, transport, opening/access, risk, and
destination-fact tools as needed. It should observe results, decide
whether further research is needed, produce a research result, and then
support a final Plan. This Agent is not implemented.

The next planning input should come from current TripState, including city-level
destination choices and their named spots. Deleted spots and unselected offers
must not re-enter the plan through conversation history. Spot names need renewed
identity verification; the current readiness check does not perform research.

See [the detailed current user flow](USER_FLOW_CURRENT.md) for each operation,
API, response source, persistence boundary, and its implementation files.

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
