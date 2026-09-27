import type { DestinationAccessEvidence, DestinationAccessResult } from "@/domain/location/destination-access";
import type { DestinationCandidate } from "@/domain/location/destination-candidates";
import type { DestinationAccessChecker } from "./destination-access-filter";
import type { OfficialAccessSearch, OfficialAccessSearchResult } from "./official-access-search";

const MAX_EVIDENCE_AGE_MS = 365 * 24 * 60 * 60 * 1_000;
const RESTRICTED = /禁止(?:进入|通行|穿越|游览|攀登)|严禁(?:进入|通行|穿越|游览|攀登)|(?:路线|景区|区域|入口|步道|山道)(?:已)?(?:封闭|关闭|暂停开放|停止开放)|(?:封闭|关闭|暂停开放|停止开放)(?:路线|景区|区域|入口|步道|山道)/u;
const ALLOWED = /(?:正式|恢复|正常|现已|即日起)(?:对外)?开放|(?:允许|准许)(?:游客|公众|人员)?(?:进入|通行|游览|穿越)|(?:路线|景区|区域|入口|步道|山道)(?:已)?(?:开放|恢复通行)/u;

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
  // Non-government institutions require a separately verified, exact hostname.
  if (verifiedHosts.some((verified) => verified.toLowerCase() === host)) return host;
  return null;
}

function currentEvidence(page: OfficialAccessSearchResult, now: Date): boolean {
  if (!page.publishedAt) return false;
  const published = new Date(page.publishedAt).getTime();
  return Number.isFinite(published) && published <= now.getTime()
    && now.getTime() - published <= MAX_EVIDENCE_AGE_MS;
}

function accessSignal(page: OfficialAccessSearchResult, candidate: DestinationCandidate): "allowed" | "restricted" | null {
  if (!page.title.includes(candidate.name)) return null;
  const text = `${page.title} ${page.snippet} ${page.summary ?? ""}`;
  const restricted = RESTRICTED.test(text);
  const allowed = ALLOWED.test(text);
  if (restricted === allowed) return null;
  return restricted ? "restricted" : "allowed";
}

function evidenceFrom(page: OfficialAccessSearchResult, authority: string, now: Date): DestinationAccessEvidence {
  return {
    authority,
    sourceUrl: page.url,
    title: page.title,
    publishedAt: page.publishedAt,
    retrievedAt: now.toISOString(),
    excerpt: (page.snippet || page.summary || page.title).slice(0, 280),
  };
}

export type OfficialAccessCheckerOptions = {
  readonly search: OfficialAccessSearch;
  readonly now?: () => Date;
  readonly verifiedInstitutionalHosts?: readonly string[];
};

export class OfficialDestinationAccessChecker implements DestinationAccessChecker {
  constructor(private readonly options: OfficialAccessCheckerOptions) {}

  async check(candidate: DestinationCandidate): Promise<DestinationAccessResult> {
    let pages: readonly OfficialAccessSearchResult[];
    try { pages = await this.options.search.search(buildOfficialAccessQuery(candidate)); }
    catch { return { status: "unknown", reason: "Official access search failed." }; }

    const now = this.options.now?.() ?? new Date();
    const accepted: { status: "allowed" | "restricted"; evidence: DestinationAccessEvidence }[] = [];
    let officialCount = 0;
    for (const page of pages) {
      const authority = officialAuthorityForUrl(page.url, this.options.verifiedInstitutionalHosts);
      if (!authority) continue;
      officialCount++;
      if (!currentEvidence(page, now)) continue;
      const status = accessSignal(page, candidate);
      if (!status) continue;
      accepted.push({ status, evidence: evidenceFrom(page, authority, now) });
    }
    if (!accepted.length) return {
      status: "unknown",
      reason: officialCount ? "Official evidence is stale, ambiguous, or does not match the destination." : "No authoritative access evidence found.",
    };
    const evidence = accepted.map((item) => item.evidence);
    if (accepted.some((item) => item.status !== accepted[0].status)) {
      return { status: "unknown", reason: "Official access evidence conflicts.", evidence };
    }
    return accepted[0].status === "restricted"
      ? { status: "restricted", reason: "Current official source reports an access restriction.", evidence: evidence as [DestinationAccessEvidence, ...DestinationAccessEvidence[]] }
      : { status: "allowed", reason: "Current official source explicitly reports access is open.", evidence: evidence as [DestinationAccessEvidence, ...DestinationAccessEvidence[]] };
  }
}
