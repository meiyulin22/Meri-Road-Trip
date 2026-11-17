import type { PlanProgressEnvelope } from "@/domain/plan/plan-progress";
import type { PlanRun, PlanRunFinish, PlanVersion } from "@/domain/plan/plan-run";
import type { FilledPlanFacts, PlanRunRepository } from "@/platform/persistence/plan-run-repository";

/** Plan runs kept in memory, for tests. */
export class InMemoryPlanRunRepository implements PlanRunRepository {
  readonly runs = new Map<string, PlanRun>();
  readonly events: PlanProgressEnvelope[] = [];
  readonly versions: PlanVersion[] = [];

  async createRun(run: PlanRun): Promise<void> {
    this.runs.set(run.id, run);
  }

  async moveRun(runId: string, from: "running" | "suspended", to: "running" | "suspended"): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run || run.status !== from) return false;
    this.runs.set(runId, { ...run, status: to });
    return true;
  }

  async finishRun(runId: string, finish: PlanRunFinish): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run || run.status !== "running") return false;
    this.runs.set(runId, { ...run, ...finish });
    return true;
  }

  async findRun(tripId: string, runId: string): Promise<PlanRun | null> {
    const run = this.runs.get(runId);
    return run && run.tripId === tripId ? run : null;
  }

  async findLatestRun(tripId: string): Promise<PlanRun | null> {
    return [...this.runs.values()].filter((run) => run.tripId === tripId).at(-1) ?? null;
  }

  async appendEvent(envelope: PlanProgressEnvelope): Promise<void> {
    this.events.push(envelope);
  }

  async listEvents(runId: string, afterSeq: number): Promise<PlanProgressEnvelope[]> {
    return this.events.filter((envelope) => envelope.runId === runId && envelope.seq > afterSeq)
      .sort((left, right) => left.seq - right.seq);
  }

  async createVersion(version: Omit<PlanVersion, "version">): Promise<PlanVersion> {
    const latest = Math.max(0, ...this.versions.filter(({ tripId }) => tripId === version.tripId).map((saved) => saved.version));
    const saved = { ...version, version: latest + 1 };
    this.versions.push(saved);
    return saved;
  }

  async findVersionByRun(runId: string): Promise<PlanVersion | null> {
    return this.versions.find((version) => version.runId === runId) ?? null;
  }

  async findLatestVersion(tripId: string): Promise<PlanVersion | null> {
    return this.versions.filter((version) => version.tripId === tripId).at(-1) ?? null;
  }

  async fillPlanFacts(filled: FilledPlanFacts): Promise<boolean> {
    const index = this.versions.findIndex(({ id }) => id === filled.versionId);
    const run = this.runs.get(filled.runId);
    if (index < 0 || !run) return false;
    this.versions[index] = { ...this.versions[index], tripState: filled.tripState, plan: filled.plan };
    this.runs.set(run.id, { ...run, handoff: filled.handoff, handoffKey: filled.handoffKey });
    return true;
  }
}
