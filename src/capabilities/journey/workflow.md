# Journey persistence flows

## Create a Journey

`POST /api/journeys` validates a TripDraft and may receive the original Home `initialUserMessage` separately. `JourneyService.createJourney()` creates a Trip identity/lifecycle root through `TripService`, initializes authoritative TripState from the draft, persists that state, and writes the optional original user message to `trip_messages`. If TripState or initial message persistence fails, it deletes the new Trip. Opening a Workspace only reads already persisted messages.

The standalone `POST /api/trips` route was retired because it created Trips without TripState.

## Load a Workspace

`/trips/{id}` calls `JourneyService.loadJourney()`. The owner-scoped Trip lookup checks identity and ownership; the TripState repository loads the current evolving state. A missing TripState is an error.

## List My Journeys

`/trips` uses `loadMyJourneys()` and an owner-scoped `PostgresJourneySummaryRepository` query. The derived JourneySummary combines Trip identity/lifecycle metadata with evolving values from authoritative TripState.

## Delete a Journey

`DELETE /api/trips/{id}` deletes the Trip root only when it belongs to the current guest. PostgreSQL cascades the delete to TripState and TripMessages. Missing and wrong-owner IDs both return the same not-found response.
