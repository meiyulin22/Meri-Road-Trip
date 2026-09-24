import type { LocationCandidate } from "./location";

export type DestinationResolution =
  | { readonly status: "resolved"; readonly candidate: LocationCandidate }
  | { readonly status: "ambiguous"; readonly candidates: readonly LocationCandidate[] }
  | { readonly status: "unresolved" };

const administrativeSuffixes = ["市", "区", "县", "镇", "乡", "村", "都"];

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").trim();
}

function isReasonableMatch(expression: string, candidate: LocationCandidate): boolean {
  const name = normalize(candidate.name);
  if (
    candidate.providerId.trim() === "" ||
    name === "" ||
    !Number.isFinite(candidate.longitude) ||
    !Number.isFinite(candidate.latitude) ||
    Math.abs(candidate.longitude) > 180 ||
    Math.abs(candidate.latitude) > 90
  ) return false;

  if (expression === name) return true;

  // A bare administrative name can refer to more than one place (e.g. 朝阳).
  if (expression.length >= 2 && administrativeSuffixes.some((suffix) => name === `${expression}${suffix}`)) {
    return true;
  }

  // Explicit geographic qualification can distinguish places with the same name.
  if (!expression.endsWith(name)) return false;
  const qualifier = expression.slice(0, -name.length);
  return qualifier.length >= 2 &&
    [candidate.region, candidate.address].some((part) => part !== null && normalize(part).includes(qualifier));
}

export function resolveDestinationCandidates(
  destination: string,
  candidates: readonly LocationCandidate[],
): DestinationResolution {
  const expression = normalize(destination);
  if (expression === "") return { status: "unresolved" };

  const seen = new Set<string>();
  const reasonable = candidates.filter((candidate) => {
    if (!isReasonableMatch(expression, candidate)) return false;
    const identity = `${candidate.providerId}:${candidate.longitude},${candidate.latitude}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });

  if (reasonable.length === 0) return { status: "unresolved" };
  if (reasonable.length === 1) return { status: "resolved", candidate: reasonable[0] };
  return { status: "ambiguous", candidates: reasonable };
}
