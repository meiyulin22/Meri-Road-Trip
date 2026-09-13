# Meri

> Your Personal Outdoor Intelligence Companion.

Meri is a personal AI-powered outdoor companion designed to support a trip from the moment an idea appears to the moment the traveler returns home.

Instead of generating static travel itineraries, Meri continuously builds and maintains an understanding of the trip by combining route information, mountain weather, local transportation, recent local intelligence, accommodation, gear requirements, and the user's own preferences.

Meri is designed first for one real user: myself.

The goal is simple:

> Build an outdoor companion that I actually use when I travel.


---

# 1. Background

Planning an outdoor trip is fragmented.

For a normal trip, I may need to use:

- Maps for routes and transportation
- Weather applications
- Outdoor route platforms
- Hotel booking platforms
- Search engines
- Social media
- Travel forums
- Outdoor gear websites
- Local transportation information

The problem is not that this information does not exist.

The problem is that it exists in different places, has different levels of reliability, changes over time, and requires the traveler to manually combine it.

For example, planning a trip to a remote mountain area may involve questions such as:

- How do I actually reach the trailhead?
- Does public transportation really exist?
- Are there local buses that are not visible on maps?
- Is the road currently open?
- Has anyone traveled this route recently?
- What will the weather be like at 4,000 meters?
- What is the safest weather window?
- Is my existing gear sufficient?
- Where should I stay before starting the route?
- Has anything changed since I originally planned the trip?

Today, the traveler acts as the integration layer between all of these systems.

Meri attempts to become that integration layer.


---

# 2. Product Vision

Meri is not intended to be another:

- AI travel itinerary generator
- Travel chatbot
- Hotel recommendation website
- Outdoor gear store
- Map application

Instead, Meri should behave more like a personal outdoor intelligence system.

The long-term vision is:

> Tell Meri where I want to go. Meri should understand what information matters, gather it, maintain it, detect changes, and help me decide what to do next.


---

# 3. Core Product Principle

## AI should not be the interface.

A common AI product design is:

User → Chat → LLM → Answer

Meri should not default to this model.

Information should be presented in the form that makes the most sense.

Examples:

- Routes → Map
- Weather → Forecast / weather window
- Elevation → Elevation profile
- Transportation → Timeline / route
- Gear → Checklist
- Risks → Alerts
- Recent intelligence → Feed
- Evidence → Sources
- Trip status → Dashboard

Natural language interaction remains available when the user needs to express complex intent.

Example:

> I want to go to Siguniang Mountain next weekend. I will leave from Chengdu, I don't have a car, and I prefer flexible plans.

The result should not simply be a long AI-generated article.

Meri should transform this request into structured trip intelligence.


---

# 4. The Meri Experience

A trip begins with a simple intent.

Example:

> I want to hike here next weekend.

Meri creates a Trip.

A Trip becomes a persistent object that evolves over time.

Example:

Trip
├── Destination
├── Dates
├── Route
├── Transportation
├── Weather
├── Accommodation
├── Gear
├── Local Intelligence
├── Risks
└── Evidence

Meri then determines what information is missing and which capabilities are required to obtain it.

The user should gradually see the trip become "ready".


---

# 5. Before the Trip

Before departure, Meri helps answer four fundamental questions.

## Can I go?

Evaluate:

- Route accessibility
- Weather
- Road conditions
- Recent reports
- Seasonal conditions
- Known restrictions

---

## How do I get there?

Research:

- Standard transportation
- Public transportation
- Last-mile transportation
- Local buses
- Shared vehicles
- Trailhead access
- Alternative routes

The goal is not merely to reproduce map directions.

Meri should attempt to discover:

> How people actually get there.

---

## When should I go?

Outdoor weather should not be reduced to:

> Sunny, 20°C.

Meri should eventually consider:

- Temperature
- Precipitation
- Wind
- Cloud cover
- Visibility
- Snow
- Thunderstorm risk
- Altitude
- Sunrise / sunset
- Forecast confidence

The desired output is something closer to:

Weather Window

06:30 — 11:00
Good conditions

11:00 — 14:00
Cloud increasing

After 14:00
Higher precipitation risk

Recommendation:
Start early.

---

## What should I bring?

Meri should understand both:

1. What the trip requires
2. What the user already owns

Instead of:

> Here are 10 jackets you should buy.

Meri should aim for:

> Your current shell and mid-layer are sufficient.

> Your sleeping bag may be inadequate for the expected overnight temperature.

This turns gear recommendation into:

Gear Gap Analysis.


---

# 6. During the Trip

Meri should become more useful after the trip begins.

The system already knows:

- Where the user intends to go
- The planned route
- Transportation
- Expected weather
- Gear
- Accommodation
- Previous research

Therefore, Meri should not repeatedly research everything.

Instead, it should ask:

> What changed?


---

# 7. Trip State

The central concept of Meri is Trip State.

Meri maintains a structured representation of the current trip.

Example:

Trip State

Destination
Siguniang Mountain

Status
In Progress

Route
Changping Valley

Transportation
Confirmed

Weather
Updated 07:00

Weather Window
06:30 – 11:20

Recent Intelligence
Road open
Snow reported above 4,200m

Gear
1 potential gap

Risk
Moderate

Last Research
07:04

The Trip State evolves over time.

This allows Meri to reason about changes rather than repeatedly starting from zero.


---

# 8. Delta Intelligence

One of Meri's long-term core capabilities should be detecting meaningful changes.

Instead of asking:

> What is the weather?

Meri asks:

> What changed since the previous forecast?

Instead of:

> Is the road open?

Meri asks:

> Has road accessibility changed since the trip was planned?

Examples:

Previous State
↓
New Information
↓
Difference
↓
Impact
↓
Recommended Action

Example:

Original forecast:
Light wind

Latest forecast:
Strong afternoon wind

Impact:
Planned ridge section may become uncomfortable or unsafe.

Possible action:
Start earlier or choose an alternative route.

This concept is called:

Delta Intelligence.


---

# 9. Evidence

Meri should distinguish between:

Information
and
Evidence.

Information gathered from the open web may be:

- Incorrect
- Outdated
- Duplicated
- Promotional
- Incomplete
- Contradictory

Important conclusions should retain their sources.

Example:

Road Status

OPEN

Confidence: High

Evidence:
- Official announcement
- Recent traveler report
- Local transportation information

Last verified:
2 hours ago

If information conflicts, Meri should expose the uncertainty instead of inventing certainty.


---

# 10. Confidence and Uncertainty

Meri should be allowed to say:

> I don't know.

Examples:

High Confidence
Multiple recent authoritative sources agree.

Medium Confidence
Several community reports agree.

Low Confidence
Only one unverified source exists.

Unknown
Insufficient reliable evidence.

The system should prefer uncertainty over hallucinated confidence.


---

# 11. Personalization

Meri is initially designed for a single user.

This allows the system to maintain a persistent personal context.

Possible information includes:

- Travel preferences
- Outdoor preferences
- Transportation preferences
- Existing gear
- Previous trips
- Preferred trip intensity
- Accommodation preferences
- Typical budget
- Frequently visited regions

The goal is not simply recommendation personalization.

The goal is to avoid asking the same questions repeatedly.


---

# 12. MeriGear

MeriGear becomes one capability inside the larger Meri system.

MeriGear focuses on outdoor equipment intelligence.

Responsibilities may include:

- Gear identification
- Product specification research
- Gear comparison
- Gear gap analysis
- Availability research
- Existing gear inventory
- Trip-specific equipment requirements

Example:

Trip conditions:
- Minimum temperature: -5°C
- Strong wind
- Possible precipitation

User Gear:
- Shell ✓
- Mid-layer ✓
- Gloves ✓
- Sleeping bag comfort: +5°C ⚠

MeriGear:

Potential gear gap detected:
Sleeping system.


---

# 13. Product Architecture

Meri should gradually support several intelligence domains.

Meri

├── Route Intelligence
├── Weather Intelligence
├── Local Intelligence
├── Transport Intelligence
├── Gear Intelligence
├── Stay Intelligence
└── Risk Intelligence

These are product capabilities.

They should not automatically become separate AI agents.

Some may be implemented using:

- APIs
- deterministic workflows
- search
- databases
- algorithms
- agentic research

The implementation should match the problem.


---

# 14. Agent Philosophy

Meri should not use an AI agent when normal software is sufficient.

Example:

Fetch weather every morning.

This is:

Scheduler → Weather API → Database

No agent required.

However:

A road closure is detected.

The system must determine:

- Whether the route is affected
- Whether the report is reliable
- Whether newer information exists
- Whether an alternative route exists
- Whether transportation changes
- Whether the trip should be modified

This may require agentic execution.

Therefore:

> Deterministic when possible.
> Agentic when necessary.


---

# 15. PWA

Meri will initially be built as a Progressive Web Application.

Primary targets:

Desktop
- Trip creation
- Deep research
- Route exploration
- Configuration
- Research inspection

iPhone PWA
- Trip dashboard
- Weather
- Route
- Latest intelligence
- Alerts
- Gear
- Quick interaction with Meri

The goal is to use the same system both while planning at home and while traveling outdoors.


---

# 16. MVP

Meri should not attempt to implement the complete vision immediately.

The first version should prove the core loop:

Intent
↓
Trip
↓
Research
↓
Structured State
↓
Useful UI

Initial MVP:

1. Create Trip
2. Destination + date
3. Basic route information
4. Weather intelligence
5. One research capability
6. Evidence storage
7. Trip State
8. Mobile PWA dashboard
9. Ask Meri interface

The exact first intelligence capability should be chosen based on real-world usefulness.

Candidates:

- Mountain weather window
- Route intelligence
- Last-mile transportation
- Recent local intelligence
- Gear gap analysis


---

# 17. Development Strategy

Meri should be developed through real use.

Build
↓
Travel
↓
Use Meri
↓
Find failures
↓
Improve
↓
Travel again

Real trips become the product benchmark.

The system should evolve from problems discovered in the field rather than imagined feature lists.


---

# 18. Long-Term Vision

Meri may eventually become a persistent outdoor companion that understands:

Where I want to go.

Where I have been.

What equipment I own.

How I prefer to travel.

What conditions I am comfortable with.

What information I trust.

What changed since yesterday.

What I should care about right now.

At that point, Meri is no longer simply a travel planner.

It becomes:

> A personal intelligence layer between the traveler and the outdoor world.


---

# 19. Success Criteria

Meri succeeds when:

I am traveling somewhere unfamiliar.

I take out my phone.

And instead of opening five different applications and searching through dozens of posts,

I open Meri first.