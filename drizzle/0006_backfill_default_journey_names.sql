-- Fill only absent names from destinations already known in authoritative TripState.
UPDATE "trip_states"
SET "state" = jsonb_set(
  "state",
  '{name}',
  jsonb_build_object(
    'state', 'known',
    'value', "state"->'destination'->>'value' || '之旅',
    'source', 'system'
  )
),
"updated_at" = now()
WHERE "state"->'name'->>'state' = 'missing'
  AND "state"->'destination'->>'state' = 'known'
  AND jsonb_typeof("state"->'destination'->'value') = 'string'
  AND btrim("state"->'destination'->>'value') <> '';
