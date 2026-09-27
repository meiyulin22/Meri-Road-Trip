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
  readonly allowed: readonly CheckedCandidate<"allowed">[];
  readonly restricted: readonly CheckedCandidate<"restricted">[];
  readonly unknown: readonly CheckedCandidate<"unknown">[];
};

export async function filterDestinationCandidatesByAccess(
  candidates: readonly DestinationCandidate[],
  checker: DestinationAccessChecker,
): Promise<DestinationAccessFilterResult> {
  const checks = await Promise.all(candidates.map(async (candidate) => {
    try {
      return { candidate, access: validateDestinationAccessResult(await checker.check(candidate)) };
    } catch {
      // Provider errors may contain credentials. Keep the failure distinct from an official restriction.
      return { candidate, access: { status: "unknown" as const, reason: "Access lookup failed." } };
    }
  }));

  const allowed: CheckedCandidate<"allowed">[] = [];
  const restricted: CheckedCandidate<"restricted">[] = [];
  const unknown: CheckedCandidate<"unknown">[] = [];
  for (const check of checks) {
    if (check.access.status === "allowed") allowed.push({ candidate: check.candidate, access: check.access });
    else if (check.access.status === "restricted") restricted.push({ candidate: check.candidate, access: check.access });
    else unknown.push({ candidate: check.candidate, access: check.access });
  }
  return { allowed, restricted, unknown };
}
