import { cookies } from "next/headers";

import { addToDestination, destinationContains, removeFromDestination,
  type DestinationPick, type DestinationRemoval } from "@/domain/trip-state/destination-areas";
import { createLocationProvider } from "@/platform/map-providers";
import { readGuestId } from "@/platform/identity/guest-identity";
import { journeyService } from "@/capabilities/journey/journey-service-instance";
import { LocationService } from "@/capabilities/destination/location-service";
import { savedAreaNames } from "@/capabilities/destination/saved-area-names";
import { picksFromSearch } from "@/capabilities/destination/resolve-destination-place";
import { destinationSelectionSchema, pickFromSuggestion, withoutAreaNamesakes } from "@/capabilities/destination/search-picks";
import { TripStateConflictError } from "@/capabilities/journey/journey-errors";
import { TripNotFoundError } from "@/domain/trip/trip-errors";
import { logger } from "@/platform/observability/logger";

type Context = { params: Promise<{ id: string }> };

/**
 * A service built for this trip: its saved areas are the prior a provider may narrow by, so
 * a search inside a 大理 trip finds 点苍山 rather than the 广西 village of the same name.
 */
function serviceFor(tripState: Awaited<ReturnType<typeof journeyService.loadJourney>>["tripState"]) {
  return new LocationService(createLocationProvider(), savedAreaNames(tripState));
}

/**
 * The trip, or why it could not be read. A Journey that is not there and a database that
 * did not answer are different answers: saying "not found" for a timeout told the traveller
 * their journey had vanished, and asked them to search again into the same failure.
 */
async function ownerAndTrip(context: Context): Promise<
  | { readonly trip: { id: string; owner: string; journey: Awaited<ReturnType<typeof journeyService.loadJourney>> } }
  | { readonly error: "not_found" | "unavailable" }
> {
  const owner = readGuestId(await cookies());
  const { id } = await context.params;
  if (!owner) return { error: "not_found" };
  try {
    return { trip: { id, owner, journey: await journeyService.loadJourney(id, owner) } };
  } catch (error) {
    return { error: error instanceof TripNotFoundError ? "not_found" : "unavailable" };
  }
}

/** 404 for a Journey that is not there, 503 for a database that did not answer. */
function accessFailure(access: { readonly error: "not_found" | "unavailable" }): Response {
  return access.error === "not_found"
    ? Response.json({ error: "Journey not found." }, { status: 404 })
    : Response.json({ error: "Journey unavailable. Please retry." }, { status: 503 });
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const access = await ownerAndTrip(context);
  if ("error" in access) return accessFailure(access);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 80) return Response.json({ error: "Invalid query." }, { status: 400 });
  const result = await serviceFor(access.trip.journey.tripState).search(query);
  if (result.status !== "success") return Response.json({ error: "Search unavailable." }, { status: 503 });
  const choices = picksFromSearch(withoutAreaNamesakes(result.candidates, query)).slice(0, 12).map((pick) => ({
    id: pick.id, name: pick.spot ?? pick.place ?? pick.province, province: pick.province,
    city: pick.place, spot: pick.spot, detail: pick.detail ?? null,
  }));
  return Response.json({ choices }, { headers: { "Cache-Control": "no-store" } });
}

async function addDestination(request: Request, context: Context): Promise<Response> {
  const access = await ownerAndTrip(context);
  if ("error" in access) return accessFailure(access);
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid choice." }, { status: 400 }); }
  const parsed = destinationSelectionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid choice." }, { status: 400 });
  }
  const selection = parsed.data;
  const result = await serviceFor(access.trip.journey.tripState).search(selection.query);
  if (result.status !== "success") return Response.json({ error: "Search unavailable." }, { status: 503 });
  // The same filter as the search: an id the list never showed cannot be added through it.
  const verified = "id" in selection
    ? picksFromSearch(withoutAreaNamesakes(result.candidates, selection.query)).find((pick) => pick.id === selection.id)
    : pickFromSuggestion(result.candidates, selection.query, selection.region);
  if (!verified) return Response.json({ error: "Choice expired. Search again." }, { status: 409 });
  const pick: DestinationPick = { province: verified.province, place: verified.place, spot: verified.spot };
  const current = (await journeyService.loadJourney(access.trip.id, access.trip.owner)).tripState;
  const areas = addToDestination(current.destination.state === "known" ? current.destination.areas : [], pick);
  const tripState = await journeyService.updateTripState(access.trip.id, access.trip.owner,
    { destination: { state: "known", source: "user", areas,
      ...(current.destination.state === "known" && current.destination.legacyText
        ? { legacyText: current.destination.legacyText } : {}) } }, current.destination);
  return Response.json({ tripState });
}

async function deleteDestination(request: Request, context: Context): Promise<Response> {
  const access = await ownerAndTrip(context);
  if ("error" in access) return accessFailure(access);
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid removal." }, { status: 400 }); }
  if (typeof body === "object" && body !== null && Object.keys(body).length === 1 &&
    "legacy" in body && body.legacy === true) {
    const current = (await journeyService.loadJourney(access.trip.id, access.trip.owner)).tripState;
    if (current.destination.state !== "known" || !current.destination.legacyText) {
      return Response.json({ error: "Old destination record no longer exists." }, { status: 409 });
    }
    const areas = current.destination.areas;
    const tripState = await journeyService.updateTripState(access.trip.id, access.trip.owner, { destination: areas.length
      ? { state: "known", source: "user", areas } : { state: "missing" } }, current.destination);
    return Response.json({ tripState });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 3 ||
    !("province" in body) || !("place" in body) || !("spot" in body) ||
    typeof body.province !== "string" || body.province.trim() === "" ||
    !(body.place === null || (typeof body.place === "string" && body.place.trim())) ||
    !(body.spot === null || (typeof body.spot === "string" && body.spot.trim())) ||
    (body.place === null && body.spot !== null)) {
    return Response.json({ error: "Invalid removal." }, { status: 400 });
  }
  const removal = body as DestinationRemoval;
  const current = (await journeyService.loadJourney(access.trip.id, access.trip.owner)).tripState;
  if (current.destination.state !== "known" || !destinationContains(current.destination.areas, removal)) {
    return Response.json({ error: "Place no longer exists." }, { status: 409 });
  }
  const areas = removeFromDestination(current.destination.areas, removal);
  const legacyText = current.destination.legacyText;
  const tripState = await journeyService.updateTripState(access.trip.id, access.trip.owner,
    { destination: areas.length || legacyText
      ? { state: "known", source: "user", areas, ...(legacyText ? { legacyText } : {}) }
      : { state: "missing" } }, current.destination);
  return Response.json({ tripState });
}

async function mutateDestination(action: () => Promise<Response>): Promise<Response> {
  try { return await action(); }
  catch (error) {
    if (error instanceof TripStateConflictError) {
      return Response.json({ error: "Destination changed. Please retry." }, { status: 409 });
    }
    logger.error({ event: "destination.mutation.failed" }, "Destination mutation failed");
    return Response.json({ error: "Destination save unavailable." }, { status: 500 });
  }
}

export function POST(request: Request, context: Context): Promise<Response> {
  return mutateDestination(() => addDestination(request, context));
}

export function DELETE(request: Request, context: Context): Promise<Response> {
  return mutateDestination(() => deleteDestination(request, context));
}
