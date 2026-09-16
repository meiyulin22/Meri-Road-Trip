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
src/server/trip/trip-repository.ts
TripRepository.save()
        ↓
src/server/trip/postgres-trip-repository.ts
PostgresTripRepository.save()
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
src/server/trip/trip-repository.ts
TripRepository.findById()
        ↓
src/server/trip/postgres-trip-repository.ts
PostgresTripRepository.findById()
        ↓
Drizzle SELECT
        ↓
Neon public.trips