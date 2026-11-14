import { cookies } from "next/headers";
import { z } from "zod";

import { handlePreferencesGet, handlePreferencesPost } from "@/capabilities/planning/trip-preferences-handler";
import { readGuestId } from "@/platform/identity/guest-identity";

import { preferenceDependencies } from "./dependencies";

type Context = { params: Promise<{ id: string }> };

async function owner(context: Context): Promise<{ tripId: string; ownerGuestId: string | null }> {
  const { id: tripId } = await context.params;
  const ownerGuestId = readGuestId(await cookies());
  return { tripId, ownerGuestId: z.uuid().safeParse(tripId).success ? ownerGuestId : null };
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { tripId, ownerGuestId } = await owner(context);
  return handlePreferencesGet(tripId, ownerGuestId, await preferenceDependencies());
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const { tripId, ownerGuestId } = await owner(context);
  const body: unknown = await request.json().catch(() => null);
  return handlePreferencesPost(tripId, ownerGuestId, body, await preferenceDependencies());
}
