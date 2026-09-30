import { cookies } from "next/headers";

import { addToDestination, destinationContains, removeFromDestination,
  type DestinationPick, type DestinationRemoval } from "@/domain/trip-state/destination-areas";
import { AmapLocationProvider } from "@/platform/location-provider/amap-location-provider";
import { readGuestId } from "@/platform/identity/guest-identity";
import { journeyService } from "@/capabilities/journey/journey-service-instance";
import { LocationService } from "@/capabilities/destination/location-service";
import { picksFromSearch } from "@/capabilities/destination/resolve-destination-place";
import { TripStateConflictError } from "@/capabilities/journey/journey-errors";
import { logger } from "@/platform/observability/logger";

type Context = { params: Promise<{ id: string }> };
const service = new LocationService(new AmapLocationProvider());

async function ownerAndTrip(context: Context) {
  const owner = readGuestId(await cookies());
  const { id } = await context.params;
  if (!owner) return null;
  try { return { id, owner, journey: await journeyService.loadJourney(id, owner) }; }
  catch { return null; }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  if (!await ownerAndTrip(context)) return Response.json({ error: "Journey not found." }, { status: 404 });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 80) return Response.json({ error: "Invalid query." }, { status: 400 });
  const result = await service.search(query);
  if (result.status !== "success") return Response.json({ error: "Search unavailable." }, { status: 503 });
  const choices = picksFromSearch(result.candidates).slice(0, 12).map((pick) => ({
    id: pick.id, name: pick.spot ?? pick.place ?? pick.province, province: pick.province,
    city: pick.place, spot: pick.spot, detail: pick.detail ?? null,
  }));
  return Response.json({ choices }, { headers: { "Cache-Control": "no-store" } });
}

async function addDestination(request: Request, context: Context): Promise<Response> {
  const access = await ownerAndTrip(context);
  if (!access) return Response.json({ error: "Journey not found." }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid choice." }, { status: 400 }); }
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 2 ||
    !("query" in body) || !("id" in body) ||
    typeof body.query !== "string" || body.query.trim().length < 2 || body.query.length > 80 ||
    typeof body.id !== "string" || body.id.trim() === "") {
    return Response.json({ error: "Invalid choice." }, { status: 400 });
  }
  const result = await service.search(body.query);
  if (result.status !== "success") return Response.json({ error: "Search unavailable." }, { status: 503 });
  const verified = picksFromSearch(result.candidates).find((pick) => pick.id === body.id);
  if (!verified) return Response.json({ error: "Choice expired. Search again." }, { status: 409 });
  const pick: DestinationPick = { province: verified.province, place: verified.place, spot: verified.spot };
  const current = (await journeyService.loadJourney(access.id, access.owner)).tripState;
  const areas = addToDestination(current.destination.state === "known" ? current.destination.areas : [], pick);
  const tripState = await journeyService.updateTripState(access.id, access.owner,
    { destination: { state: "known", source: "user", areas,
      ...(current.destination.state === "known" && current.destination.legacyText
        ? { legacyText: current.destination.legacyText } : {}) } }, current.destination);
  return Response.json({ tripState });
}

async function deleteDestination(request: Request, context: Context): Promise<Response> {
  const access = await ownerAndTrip(context);
  if (!access) return Response.json({ error: "Journey not found." }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid removal." }, { status: 400 }); }
  if (typeof body === "object" && body !== null && Object.keys(body).length === 1 &&
    "legacy" in body && body.legacy === true) {
    const current = (await journeyService.loadJourney(access.id, access.owner)).tripState;
    if (current.destination.state !== "known" || !current.destination.legacyText) {
      return Response.json({ error: "Old destination record no longer exists." }, { status: 409 });
    }
    const areas = current.destination.areas;
    const tripState = await journeyService.updateTripState(access.id, access.owner, { destination: areas.length
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
  const current = (await journeyService.loadJourney(access.id, access.owner)).tripState;
  if (current.destination.state !== "known" || !destinationContains(current.destination.areas, removal)) {
    return Response.json({ error: "Place no longer exists." }, { status: 409 });
  }
  const areas = removeFromDestination(current.destination.areas, removal);
  const legacyText = current.destination.legacyText;
  const tripState = await journeyService.updateTripState(access.id, access.owner,
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
