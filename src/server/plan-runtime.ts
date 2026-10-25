// The live group plan for the Discord demo, plus a fresh, throwaway board for each website visitor.
import { RequestLanguage, type TermsIntake } from "../agents/language";
import { friendTerms, groupPlan, planVersions, students } from "../demo/seed";
import type { CampusEvent, StudentId } from "../domain/types";
import { PlanBoard, type PlanView, type TermsInput } from "../quorum/board";
import type { GroupPlan, TraceRow } from "../quorum/engine";

export type TermsParser = (text: string, plan: string) => Promise<TermsIntake>;

const DAYS: Record<string, string> = { mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat", sun: "sun" };
export function clock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}
export const planLabel = (p: Pick<GroupPlan, "title" | "day" | "start" | "price">) =>
  `${p.title} · ${DAYS[p.day] ?? p.day} ${clock(p.start)}${p.price != null ? ` · $${p.price}` : ""}`;

export class PlanRuntime {
  board: PlanBoard;
  private listeners = new Set<() => void>();
  /** Seats a real person has claimed; the rest are demo friends whose agents answer by themselves. */
  readonly humans = new Set<StudentId>();

  constructor(
    readonly parser: TermsParser = (text, plan) => new RequestLanguage().parseTerms(text, plan),
    private plan: GroupPlan = groupPlan,
    private versions: CampusEvent[] = planVersions,
    private now: () => Date = () => new Date(),
  ) {
    this.board = this.fresh();
  }

  private fresh() {
    return new PlanBoard(this.plan, this.versions, students, () => this.notify(), this.now);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  notify() {
    for (const l of this.listeners) l();
  }

  /** A new plan and versions (for example, from the server's Discord events). */
  usePlan(plan: GroupPlan, versions: CampusEvent[]) {
    this.plan = plan;
    this.versions = versions;
    this.reset();
  }

  reset() {
    this.board = this.fresh();
    this.notify();
  }

  claim(id: StudentId) {
    this.humans.add(id);
    this.board.setAuto(id, false);
  }

  release(id: StudentId) {
    this.humans.delete(id);
    this.board.withdraw(id);
  }

  /**
   * When a person's terms first count, every unclaimed seat gets its demo friend: the terms that
   * friend told their agent, answered automatically. Seats people claim stay theirs.
   */
  approve(id: StudentId) {
    const friends: [StudentId, TermsInput][] = [];
    for (const s of students) {
      if (this.humans.has(s.id) || this.board.auto.has(s.id)) continue;
      this.board.setAuto(s.id, true);
      friends.push([s.id, friendTerms[s.id].terms]);
    }
    if (friends.length) this.board.draftMany(friends, false);
    const own = this.board.view(id).terms;
    if (!own) throw new Error("nothing to approve yet");
    // Everything counts together in one round: the demo friends and this person.
    this.board.draftMany([...friends, [id, own]], true);
  }

  view(id: StudentId): PlanView {
    return this.board.view(id);
  }
}

const store = globalThis as unknown as { downPlan?: PlanRuntime };
export const getPlanRuntime = () => (store.downPlan ??= new PlanRuntime());

// ---- the website demo: one fresh board per request, replayed from the visitor's choices ----

export type TryAction = { type: "stretch" | "consent"; yes: boolean } | { type: "join" };

export interface TryResult {
  view: PlanView;
  /** What the group channel heard, if anything. */
  announcement: { words: string; everyone: boolean; option: CampusEvent } | null;
  /** What crossed between agents: per version, each agent's one-word answer. Never a limit or a reason. */
  trace: { option?: string; agent?: string; verdict?: TraceRow["verdict"]; step: TraceRow["step"]; ok: boolean; groupSize?: number }[];
  /** Only what each friend said to their own agent. Shown because the friends are fictional. */
  friends: { id: string; name: string; says: string }[];
}

/** Alex is the visitor; Maya, Jay and Dev are demo friends. Same rules as the live bot. */
export function tryPlan(alex: TermsInput, actions: TryAction[] = []): TryResult {
  const board = new PlanBoard(groupPlan, planVersions, students);
  const friends = ["maya", "jay", "dev"].map((id): [StudentId, TermsInput] => [id, friendTerms[id].terms]);
  for (const [id] of friends) board.setAuto(id, true);
  board.draftMany([...friends, ["alex", alex]], true);
  for (const a of actions.slice(0, 12)) {
    try {
      if (a.type === "stretch") board.answerStretch("alex", a.yes);
      else if (a.type === "consent") board.consent("alex", a.yes);
      else board.join("alex");
    } catch {
      // An answer that no longer applies (the round moved on) is ignored, as in the bot.
    }
  }
  const ann = board.announcement();
  return {
    view: board.view("alex"),
    announcement: ann && { words: ann.words, everyone: ann.everyone, option: ann.option },
    trace: board.trace.map(({ step, option, agent, verdict, ok, groupSize }) => ({ step, option, agent, verdict, ok, groupSize })),
    friends: ["maya", "jay", "dev"].map((id) => ({ id, name: students.find((s) => s.id === id)!.name, says: friendTerms[id].says })),
  };
}
