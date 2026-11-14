import { cookies } from "next/headers";
import { z } from "zod";

import { handlePreferenceDelete } from "@/capabilities/planning/trip-preferences-handler";
import { readGuestId } from "@/platform/identity/guest-identity";

import { preferenceDependencies } from "../dependencies";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; preferenceId: string }> },
): Promise<Response> {
  const { id: tripId, preferenceId } = await context.params;
  const ownerGuestId = readGuestId(await cookies());
  const valid = z.uuid().safeParse(tripId).success && z.uuid().safeParse(preferenceId).success;
  return handlePreferenceDelete(tripId, valid ? ownerGuestId : null, preferenceId, await preferenceDependencies());
}
