# Journey persistence flows

## Create a Journey

`POST /api/journeys` validates a TripDraft. `JourneyService.createJourney()` creates a Trip identity/lifecycle root through `TripService`, initializes authoritative TripState from the draft, and persists that state. If TripState creation fails, it deletes the new Trip.

The standalone `POST /api/trips` route was retired because it created Trips without TripState.

## Load a Workspace

`/trips/{id}` calls `JourneyService.loadJourney()`. The owner-scoped Trip lookup checks identity and ownership; the TripState repository loads the current evolving state. A missing TripState is an error.

## List My Journeys

`/trips` uses `loadMyJourneys()` and an owner-scoped `PostgresJourneySummaryRepository` query. The derived JourneySummary combines Trip identity/lifecycle metadata with evolving values from authoritative TripState.

## Delete a Journey

`DELETE /api/trips/{id}` deletes the Trip root only when it belongs to the current guest. PostgreSQL cascades the delete to TripState and TripMessages. Missing and wrong-owner IDs both return the same not-found response.
