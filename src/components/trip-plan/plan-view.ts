/**
 * The shape of a plan as the plan page shows it, and the rules that decide what the page
 * can show yet. Pure, so the rules are tested without a browser.
 *
 * Design-stage only (1.1000): the page runs on sample data (plan-sample.ts). The fields
 * are the ones the Planner will have to return; when it exists, this view is filled from
 * the saved plan instead.
 */

/** Text the Planner writes, in both interface languages. Place names are data and are not translated. */
export interface Localized {
  readonly zh: string;
  readonly en: string;
}

/** Longitude, latitude. */
export type LonLat = readonly [number, number];

/** Whether a fact came from a tool result Meri can point to, decided by code, not by the model. */
export type Verification =
  | { readonly state: "verified"; readonly source: Localized; readonly url: string; readonly checkedAt: string }
  | { readonly state: "unverified"; readonly reason: Localized };

export interface PlanPhoto {
  readonly file: string;
  readonly artist: string;
}

export interface PlanStop {
  readonly id: string;
  readonly kind: "sight" | "meal" | "stay";
  readonly name: string;
  readonly nameEn: string;
  readonly time: string;
  readonly minutes: number;
  readonly point: LonLat;
  readonly hours?: { readonly text: Localized; readonly verification: Verification };
  readonly note?: Localized;
  /** Other places the name could mean: "I picked X", with the rest one click away. */
  readonly alternatives?: readonly string[];
}

export interface PlanLeg {
  readonly mode: "drive" | "walk";
  readonly minutes: number;
  readonly km: number;
}

export type Sky = "sunny" | "cloudy" | "overcast" | "rain";

export interface PlanWeather {
  readonly morning: Sky;
  readonly afternoon: Sky;
  readonly low: number;
  readonly high: number;
}

export interface PlanHotel {
  readonly name: string;
  readonly price: number;
  readonly rating: number;
}

export interface PlanDay {
  readonly day: number;
  readonly date: string;
  readonly city: string;
  readonly cityEn: string;
  readonly title: Localized;
  readonly photo: PlanPhoto;
  readonly weather: PlanWeather;
  readonly stops: readonly PlanStop[];
  /** legs[i] runs from stops[i] to stops[i + 1]. */
  readonly legs: readonly PlanLeg[];
  readonly feasibility: { readonly roadMinutes: number; readonly endsAt: string; readonly sunset: string };
  readonly unknowns: readonly Localized[];
  readonly stay: { readonly area: Localized; readonly hotels: readonly PlanHotel[] };
}

export interface PlanJourneyOption {
  readonly mode: "flight" | "train";
  readonly number: string;
  readonly from: string;
  readonly to: string;
  readonly date: string;
  readonly depart: string;
  readonly arrive: string;
  readonly price: number;
  readonly provider: string;
  readonly checkedAt: string;
  readonly recommended?: boolean;
}

export interface PlanMemory {
  readonly id: string;
  readonly label: Localized;
  /** The user's own words it came from, checked against the conversation. */
  readonly quote: string;
}

export interface PlanRun {
  readonly seconds: number;
  readonly toolCalls: number;
  readonly costYuan: number;
}

export interface SamplePlan {
  readonly province: string;
  readonly cities: readonly { readonly name: string; readonly nameEn: string }[];
  readonly days: readonly PlanDay[];
  readonly outbound: readonly PlanJourneyOption[];
  readonly homebound: readonly PlanJourneyOption[];
  readonly memories: readonly PlanMemory[];
  readonly run: PlanRun;
  readonly origin: string;
  readonly startDate: string;
}

/** The facts the page asks for by click; the destination is fixed before the page opens. */
export type FactKey = "days" | "startDate" | "origin" | "transport";
export type Transport = "flight" | "train" | "drive";

export interface PlanFacts {
  readonly days: number | null;
  readonly startDate: string | null;
  readonly origin: string | null;
  readonly transport: Transport | null;
}

export type Section = "firstDay" | "otherDays" | "gettingThere" | "weather" | "stays";

/** What each section needs before it can be planned. The first day needs only the destination. */
const requirements: Readonly<Record<Section, readonly FactKey[]>> = {
  firstDay: [],
  otherDays: ["days"],
  gettingThere: ["origin", "transport"],
  weather: ["startDate"],
  stays: ["startDate"],
};

/** The facts a section is still waiting for; empty when it can be planned. */
export function missingFor(section: Section, facts: PlanFacts): readonly FactKey[] {
  return requirements[section].filter((key) => facts[key] === null);
}

export const sections: readonly Section[] = ["firstDay", "gettingThere", "weather", "stays", "otherDays"];

/** Sections that depend on a fact, so changing it re-plans only those. */
export function sectionsUsing(fact: FactKey): readonly Section[] {
  return sections.filter((section) => requirements[section].includes(fact));
}

/** One step of a run, in the order the page lights them up. */
export type StepId = "places" | "candidates" | "hours" | "routes" | "weather" | "firstDay" | "gettingThere" | "stays" | "otherDays";

/**
 * The steps a run takes for the facts it has: the first day always, and each further
 * section only once it is unlocked. The first day goes first so something real appears soon.
 */
export function runSteps(facts: PlanFacts): readonly StepId[] {
  const steps: StepId[] = ["places", "candidates", "hours", "routes"];
  if (missingFor("weather", facts).length === 0) steps.push("weather");
  steps.push("firstDay");
  if (missingFor("gettingThere", facts).length === 0) steps.push("gettingThere");
  if (missingFor("stays", facts).length === 0) steps.push("stays");
  if (missingFor("otherDays", facts).length === 0) steps.push("otherDays");
  return steps;
}

/** Whether a section's content has arrived, given how many steps of the run are done. */
export function sectionReady(section: Section, steps: readonly StepId[], done: number): boolean {
  const step: StepId = section === "firstDay" ? "firstDay" : section;
  const index = steps.indexOf(step);
  return index !== -1 && index < done;
}

/** How many of the clickable facts are still missing, for the one-line overview. */
export function missingFacts(facts: PlanFacts): readonly FactKey[] {
  return (["days", "startDate", "origin", "transport"] as const).filter((key) => facts[key] === null);
}

/** Minutes as "1 h 25 min" / "1 小时 25 分钟". */
export function duration(minutes: number, units: { readonly hour: string; readonly minute: string }): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} ${units.minute}`;
  return rest === 0 ? `${hours} ${units.hour}` : `${hours} ${units.hour} ${rest} ${units.minute}`;
}

/** How many facts in the shown days were checked against a source, and how many could not be. */
export function verificationCount(days: readonly PlanDay[]): { readonly verified: number; readonly unverified: number } {
  let verified = 0;
  let unverified = 0;
  for (const day of days) {
    for (const stop of day.stops) {
      if (!stop.hours) continue;
      if (stop.hours.verification.state === "verified") verified += 1;
      else unverified += 1;
    }
  }
  return { verified, unverified };
}

/** The calendar date `days` after an ISO date ("2026-11-14"), so sample days follow the chosen start. */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
