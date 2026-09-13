# CODING_PRINCIPLES.md

# Meri Coding Principles

Meri is developed incrementally.

Always prefer simple, explicit, maintainable code over clever abstractions.

Before making changes, read the relevant project documentation and existing code.

Do not implement future architecture unless the current task requires it.


## 1. Keep Control Flow Flat

Avoid deeply nested code.

Prefer:

- early returns
- guard clauses
- small focused functions
- clear execution paths

Avoid unnecessary nesting such as multiple layers of:

if
  if
    if
      ...

A human reader should be able to understand the primary execution path quickly.


## 2. Use Clear Names

Function and variable names should explain intent.

Prefer:

createTrip()
validateTripInput()
loadTripState()
calculateWeatherWindow()

Avoid vague names such as:

handle()
process()
runThing()
data()
result2()

unless their meaning is obvious from a very narrow scope.


## 3. Comments Explain Why

Add comments where they provide useful context.

Comments should explain:

- why a decision exists
- why an unusual implementation is required
- external system constraints
- non-obvious domain rules

Do not add comments that merely repeat what the code already says.


## 4. Isolate External Systems

Do not allow provider-specific variables, response shapes, or concepts to leak deeply into Meri domain code.

External APIs and libraries should be normalized through adapters.

Prefer:

External Provider
↓
Adapter
↓
Meri Domain Type

Domain code should depend on Meri concepts rather than provider-specific concepts whenever practical.


## 5. Make Invalid States Hard to Represent

Do not make fields optional merely for convenience.

Use required fields when the domain requires them.

Prefer explicit types and discriminated unions when states differ.

Example:

type ResearchTask =
  | { status: "pending" }
  | { status: "running"; startedAt: Date }
  | { status: "completed"; startedAt: Date; completedAt: Date };

Avoid:

{
  status?: string;
  startedAt?: Date;
  completedAt?: Date;
}

when the optional fields allow impossible states.


## 6. Separate Decisions from Side Effects

Separate:

"What should happen?"

from:

"Perform the action."

Prefer pure decision logic where possible.

Example:

evaluateWeatherRisk()

should determine risk.

sendWeatherAlert()

should perform the side effect.

Do not combine decision making, network calls, persistence, and presentation in one large function.


## 7. Errors Must Be Useful

Errors should contain enough context to diagnose the failure.

Include relevant information such as:

- operation
- entity ID
- provider
- input context where safe
- original error / cause

Preserve stack traces.

Do not swallow errors.

Avoid generic errors such as:

"Something went wrong."

Prefer:

"Failed to load TripState for trip trip_123."

When wrapping errors, preserve the original cause.

Never expose secrets, tokens, or sensitive credentials in errors or logs.


## 8. Prefer Focused Changes

Keep each change narrowly scoped to the requested task.

Do not:

- refactor unrelated code
- rename unrelated files
- introduce new libraries without a clear need
- implement future features preemptively

If a larger refactor appears necessary, explain why before performing it.


## 9. Avoid Premature Abstraction

Do not create abstractions only because similar code might exist in the future.

Prefer duplication over the wrong abstraction when requirements are still unclear.

Extract abstractions when a real repeated pattern appears.


## 10. Keep Functions Focused

Functions should usually do one conceptual job.

If a function:

- validates input
- fetches network data
- transforms data
- writes database state
- logs output

consider splitting responsibilities.


## 11. Use Explicit Inputs and Outputs

Avoid hidden dependencies.

Prefer passing required dependencies explicitly.

Functions should make their inputs and return values understandable from their signatures.


## 12. Logging

Use the shared Meri logger.

Do not use console.log / console.error in application code unless explicitly required by tooling.

Logs should be structured.

Prefer event names such as:

agent.run.started
tool.call.completed
trip.created

Include useful context such as:

requestId
tripId
runId
toolName
durationMs

Never log secrets or credentials.


## 13. Validate External Data

Treat all external data as untrusted.

Validate:

- API responses
- model structured output
- environment variables
- user input

before allowing them into domain state.


## 14. Test the Boundary

Tests should focus especially on:

- domain rules
- external adapters
- state transitions
- error paths
- data normalization

Do not write meaningless tests solely to increase coverage.


## 15. After Every Change

Before completing a task:

1. Review the diff.
2. Remove unrelated changes.
3. Run lint.
4. Run type checking if configured.
5. Run relevant tests.
6. Run build when appropriate.
7. Report exactly what changed.
8. Report any unresolved issue clearly.

Do not claim success if validation has not actually been run.