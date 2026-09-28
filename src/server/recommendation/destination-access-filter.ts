import type { DestinationAccessResult } from "@/domain/location/destination-access";
import { validateDestinationAccessResult } from "@/domain/location/destination-access";
import type { DestinationCandidate } from "@/domain/location/destination-candidates";

export interface DestinationAccessChecker {
  check(candidate: DestinationCandidate): Promise<DestinationAccessResult>;
}

type CheckedCandidate<Status extends DestinationAccessResult["status"]> = {
  readonly candidate: DestinationCandidate;
  readonly access: Extract<DestinationAccessResult, { readonly status: Status }>;
};

export type DestinationAccessFilterResult = {
  readonly eligible: readonly CheckedCandidate<"clear" | "uncertain">[];
  readonly blocked: readonly CheckedCandidate<"blocked">[];
};

export async function filterDestinationCandidatesByAccess(
  candidates: readonly DestinationCandidate[],
  checker: DestinationAccessChecker,
): Promise<DestinationAccessFilterResult> {
  const checks: { candidate: DestinationCandidate; access: DestinationAccessResult }[] = new Array(candidates.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, async () => {
    while (nextIndex < candidates.length) {
      const index = nextIndex++;
      const candidate = candidates[index];
      try {
        checks[index] = { candidate, access: validateDestinationAccessResult(await checker.check(candidate)) };
      } catch {
        // Lookup or validation failure cannot block an ordinary recommendation.
        checks[index] = { candidate, access: { status: "uncertain", reason: "Access lookup failed." } };
      }
    }
  }));

  const eligible: CheckedCandidate<"clear" | "uncertain">[] = [];
  const blocked: CheckedCandidate<"blocked">[] = [];
  for (const check of checks) {
    if (check.access.status === "blocked") blocked.push({ candidate: check.candidate, access: check.access });
    else eligible.push({ candidate: check.candidate, access: check.access });
  }
  return { eligible, blocked };
}
