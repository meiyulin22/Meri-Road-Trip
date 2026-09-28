import type { DestinationAccessEvidence, DestinationAccessResult } from "@/domain/location/destination-access";
import type { DestinationCandidate } from "@/domain/location/destination-candidates";
import { createBochaOfficialAccessSearchFromEnvironment } from "@/platform/search/bocha-official-access-search";
import {
  createDestinationAccessEvidenceInterpreterFromEnvironment,
  validateAccessInterpretation,
  type AccessEvidenceInput,
  type DestinationAccessEvidenceInterpreter,
} from "./destination-access-evidence-interpreter";
import type { DestinationAccessChecker } from "./destination-access-filter";
import type { OfficialAccessSearch, OfficialAccessSearchResult } from "@/platform/search/official-access-search";
import { logEvents, logger } from "@/platform/observability/logger";

export function buildOfficialAccessQuery(candidate: DestinationCandidate): string {
  return [candidate.name, candidate.region, "进入 通行 穿越 开放 封闭 禁止 官方公告"]
    .filter((part) => part?.trim()).join(" ");
}

export function officialAuthorityForUrl(urlText: string, verifiedHosts: readonly string[] = []): string | null {
  let url: URL;
  try { url = new URL(urlText); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "gov.cn" || host.endsWith(".gov.cn")) return host;
  if (verifiedHosts.some((verified) => verified.toLowerCase() === host)) return host;
  return null;
}

function toEvidence(page: AccessEvidenceInput, now: Date): DestinationAccessEvidence {
  const host = new URL(page.url).hostname;
  return {
    authority: page.official ? host : `Unverified: ${host}`,
    sourceUrl: page.url,
    title: page.title,
    retrievedAt: now.toISOString(),
    ...(page.publishedAt ? { publishedAt: page.publishedAt } : {}),
    excerpt: (page.snippet || page.summary || page.title).slice(0, 280),
  };
}

/**
 * A candidate nobody could check is indistinguishable, downstream, from one that
 * was checked and found fine: both stay eligible. That is the right call for a
 * recommendation, and it is also how access checking stops happening at all
 * without anyone noticing, so the three cases where no check took place say so.
 * The reason is one of this module's own fixed strings, never the provider's
 * message, which can carry the API key.
 */
function unchecked(candidate: DestinationCandidate, reason: string): DestinationAccessResult {
  logger.warn({
    event: logEvents.destinationAccessUncertain,
    destination: candidate.name, region: candidate.region, reason,
  }, "Destination access could not be checked");
  return { status: "uncertain", reason };
}

export type OfficialAccessCheckerOptions = {
  readonly search: OfficialAccessSearch;
  readonly interpreter: DestinationAccessEvidenceInterpreter;
  readonly now?: () => Date;
  readonly verifiedInstitutionalHosts?: readonly string[];
};

export class OfficialDestinationAccessChecker implements DestinationAccessChecker {
  constructor(private readonly options: OfficialAccessCheckerOptions) {}

  async check(candidate: DestinationCandidate): Promise<DestinationAccessResult> {
    let pages: readonly OfficialAccessSearchResult[];
    try { pages = await this.options.search.search(buildOfficialAccessQuery(candidate)); }
    catch { return unchecked(candidate, "Access search is unavailable."); }
    if (!pages.length) return unchecked(candidate, "No access evidence found.");

    const now = this.options.now?.() ?? new Date();
    const evidence: AccessEvidenceInput[] = pages.slice(0, 8).map((page, index) => ({
      ...page,
      id: `e${index + 1}`,
      official: officialAuthorityForUrl(page.url, this.options.verifiedInstitutionalHosts) !== null,
    }));
    let interpretation;
    try {
      interpretation = validateAccessInterpretation(
        await this.options.interpreter.interpret(candidate, evidence), evidence,
      );
    } catch { return unchecked(candidate, "Access evidence could not be interpreted."); }

    const cited = evidence.filter((item) => interpretation.evidenceIds.includes(item.id));
    const mapped = cited.map((item) => toEvidence(item, now));
    if (interpretation.status === "blocked") {
      return { status: "blocked", reason: interpretation.reason,
        evidence: mapped as [DestinationAccessEvidence, ...DestinationAccessEvidence[]] };
    }
    if (interpretation.status === "clear") {
      return { status: "clear", reason: interpretation.reason,
        evidence: mapped as [DestinationAccessEvidence, ...DestinationAccessEvidence[]] };
    }
    return { status: "uncertain", reason: interpretation.reason,
      ...(mapped.length ? { evidence: mapped } : {}) };
  }
}

export function createOfficialDestinationAccessCheckerFromEnvironment(): DestinationAccessChecker {
  return new OfficialDestinationAccessChecker({
    search: createBochaOfficialAccessSearchFromEnvironment(),
    interpreter: createDestinationAccessEvidenceInterpreterFromEnvironment(),
  });
}
