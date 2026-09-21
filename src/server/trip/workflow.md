Create Trip API
Browser / iPhone
Send POST /api/trips
        ↓
src/app/api/trips/route.ts
        ↓
src/server/trip/trip-service-instance.ts
        ↓
src/server/trip/trip-service.ts
TripService.createTrip()
        ↓
src/repositories/trip-repository.ts
TripRepository.create()
        ↓
src/server/trip/postgres-trip-repository.ts
PostgresTripRepository.create()
        ↓
src/server/database/schema/trips.ts
Confirm trips  //table and attribute
        ↓
src/server/database/db.ts
Drizzle + Neon client
        ↓
Neon PostgreSQL
public.trips


Select Trip API

Browser / iPhone
Send GET /api/trips/:id
        ↓
src/app/api/trips/[id]/route.ts
        ↓
src/server/trip/trip-service-instance.ts
        ↓
src/server/trip/trip-service.ts
TripService.getTripById()
        ↓
src/repositories/trip-repository.ts
TripRepository.findById()
        ↓
src/server/trip/postgres-trip-repository.ts
PostgresTripRepository.findById()
        ↓
Drizzle SELECT
        ↓
Neon public.trips


List My Journeys

Browser / iPhone
Open GET /trips
        ↓
src/app/trips/page.tsx
        ↓
Read existing meri_guest_id cookie
        ↓
src/server/journey/my-journeys.ts
loadMyJourneys()
        ↓
src/server/trip/trip-service.ts
TripService.listTrips()
        ↓
src/repositories/trip-repository.ts
TripRepository.listByOwner()
        ↓
src/server/trip/postgres-trip-repository.ts
PostgresTripRepository.listByOwner()
        ↓
Drizzle SELECT
WHERE owner_guest_id = current guest
ORDER BY updated_at DESC, created_at DESC, id DESC
        ↓
My Journeys cards
        ↓
Continue /trips/{id}
