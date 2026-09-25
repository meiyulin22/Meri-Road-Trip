import type { Journey } from "./journey-service";

type CreateJourneyWithOpeningDependencies = {
  readonly createJourney: (
    draft: unknown,
    ownerGuestId: string,
    initialUserMessage?: string,
  ) => Promise<Journey>;
  readonly initializeOpening: (input: {
    readonly tripId: string;
    readonly ownerGuestId: string;
    readonly requestId: string;
    readonly referenceDate: string;
    readonly timezone: string;
  }) => Promise<unknown>;
};

export async function createJourneyWithOpening(
  input: {
    readonly draft: unknown;
    readonly ownerGuestId: string;
    readonly initialUserMessage?: string;
    readonly requestId: string;
    readonly referenceDate: string;
    readonly timezone: string;
  },
  dependencies: CreateJourneyWithOpeningDependencies,
): Promise<{
  readonly journey: Journey;
  readonly opening: "completed" | "failed" | "not_requested";
  readonly openingError?: unknown;
}> {
  const journey = await dependencies.createJourney(
    input.draft,
    input.ownerGuestId,
    input.initialUserMessage,
  );
  if (input.initialUserMessage === undefined) {
    return { journey, opening: "not_requested" };
  }

  try {
    await dependencies.initializeOpening({
      tripId: journey.trip.id,
      ownerGuestId: input.ownerGuestId,
      requestId: input.requestId,
      referenceDate: input.referenceDate,
      timezone: input.timezone,
    });
    return { journey, opening: "completed" };
  } catch (openingError) {
    return { journey, opening: "failed", openingError };
  }
}
