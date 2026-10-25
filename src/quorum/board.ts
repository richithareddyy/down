// State for one group plan while the agents look for a version everyone is down for.
// Stages:
//   idle      agents quietly hold each student's terms
//   asking    a version works if someone stretches a little; only they are asked, privately
//   consent   every person in the version is asked privately if they'd switch
//   announced the group hears the new version; nobody learns who asked for it or who stretched
//   closed    nothing worked; the original plan stands and nobody learns why
import type { CampusEvent, Conditions, Student, StudentId } from "../domain/types";
import { negotiate, shareWords, type GroupPlan, type MemberTerms, type Outcome, type Stretch, type StretchField, type TraceRow } from "./engine";

export type BoardStage = "idle" | "asking" | "consent" | "announced" | "closed";

export interface TermsInput {
  conditions: Conditions;
  avoidTags?: string[];
  wantsChange: boolean;
  minOthers?: number;
  majorityOnly?: boolean;
}

export interface PlanView {
  plan: Omit<GroupPlan, "memberIds">;
  /** This student's own terms; never anyone else's. */
  terms: Omit<MemberTerms, "studentId"> | null;
  stage: "none" | "stretch" | "waiting" | "consent" | "announced" | "closed";
  version: number;
  option?: CampusEvent;
  /** Only for this student, only while their stretch is being asked. */
  stretch?: Omit<Stretch, "studentId">;
  /** "all of you" or, for a smaller group, "most of you" / "some of you". */
  shareWords?: string;
  everyone?: boolean;
  /** Names, only once the version is announced and this student is in it. */
  joined?: string[];
  ownJoined?: boolean;
}

export class PlanBoard {
  private terms = new Map<StudentId, MemberTerms>();
  stage: BoardStage = "idle";
  outcome: Outcome | null = null;
  /** Limits a student declined to stretch, for this round. */
  private firm = new Map<StudentId, Set<StretchField>>();
  /** Versions somebody passed on, for this round. */
  private passed = new Set<string>();
  private stretchAnswers = new Map<StudentId, "pending" | "yes">();
  private consents = new Map<StudentId, "pending" | "yes">();
  private joined = new Set<StudentId>();
  /** Students whose agent answers on its own (synthetic friends in the demo). */
  readonly auto = new Set<StudentId>();
  version = 0;
  trace: TraceRow[] = [];

  constructor(
    public plan: GroupPlan,
    readonly options: CampusEvent[],
    private students: Student[],
    private onChange: () => void = () => {},
    private now: () => Date = () => new Date(),
  ) {}

  private changed() {
    this.version += 1;
    this.onChange();
  }

  private isMember(id: StudentId) {
    return this.plan.memberIds.includes(id);
  }

  /** A new plan for the group (for example, a Discord event). Starts a fresh round. */
  setPlan(plan: GroupPlan) {
    this.plan = plan;
    this.resetRound();
    this.stage = "idle";
    this.run();
    this.changed();
  }

  /** Save (or replace) a student's private terms. Nothing happens until they're approved. */
  draft(id: StudentId, input: TermsInput, approved = false) {
    this.draftMany([[id, input]], approved);
  }

  /** Several students' terms at once; approved ones count together in a single round. */
  draftMany(entries: [StudentId, TermsInput][], approved = false) {
    for (const [id, input] of entries) {
      if (!this.isMember(id)) throw new Error("not in this group");
      this.terms.set(id, {
        studentId: id,
        conditions: input.conditions,
        avoidTags: input.avoidTags ?? [],
        wantsChange: input.wantsChange,
        minOthers: Math.max(0, Math.floor(input.minOthers ?? 1)),
        majorityOnly: !!input.majorityOnly,
        approved,
        updatedAt: this.now().toISOString(),
      });
    }
    if (approved) this.afterTermsChange();
    this.changed();
  }

  hasDraft(id: StudentId) {
    const t = this.terms.get(id);
    return !!t && !t.approved;
  }

  approve(id: StudentId) {
    const t = this.terms.get(id);
    if (!t) throw new Error("nothing to approve yet");
    t.approved = true;
    t.updatedAt = this.now().toISOString();
    this.afterTermsChange();
    this.changed();
  }

  /** Drop a student's terms. A round under way starts over without them. */
  withdraw(id: StudentId) {
    if (!this.terms.delete(id)) return;
    this.afterTermsChange();
    this.changed();
  }

  /** Turn a student's self-answering demo agent on or off. Off also forgets its terms. */
  setAuto(id: StudentId, on: boolean) {
    if (on) this.auto.add(id);
    else {
      this.auto.delete(id);
      this.withdraw(id);
    }
  }

  /** Changed terms restart the search, unless a version was already announced. */
  private afterTermsChange() {
    if (this.stage === "announced") return;
    const midRound = this.stage === "asking" || this.stage === "consent";
    this.stage = "idle";
    this.resetRound();
    this.run();
    // A round that was under way and now finds nothing closes quietly, so nobody is left waiting.
    if (midRound && this.stage === "idle") this.stage = "closed";
  }

  private resetRound() {
    this.outcome = null;
    this.firm.clear();
    this.passed.clear();
    this.stretchAnswers.clear();
    this.consents.clear();
    this.joined.clear();
  }

  /** The agents try versions of the plan. Only fits / could-stretch / no answers are compared. */
  private run() {
    const trace: TraceRow[] = [];
    const options = this.options.filter((o) => !this.passed.has(o.id));
    const outcome = negotiate(this.plan, [...this.terms.values()], options, this.students, this.firm, trace);
    this.trace.push(...trace);
    this.outcome = outcome;
    this.stretchAnswers.clear();
    this.consents.clear();
    if (!outcome) {
      // Before any round started, nothing happens. Mid-round, it closes quietly.
      this.stage = this.passed.size || this.firm.size ? "closed" : "idle";
      if (this.stage === "closed") this.resetRound();
      return;
    }
    if (outcome.stretches.length) {
      this.stage = "asking";
      for (const s of outcome.stretches) this.stretchAnswers.set(s.studentId, "pending");
    } else this.startConsent();
    this.settleAuto();
  }

  private startConsent() {
    this.stage = "consent";
    this.consents = new Map(this.outcome!.memberIds.map((id) => [id, "pending"]));
  }

  /** Demo friends' agents answer by themselves: yes to a small stretch, yes to a version that fits. */
  private settleAuto() {
    if (this.stage === "asking") {
      for (const [id, a] of this.stretchAnswers) if (a === "pending" && this.auto.has(id)) this.stretchAnswers.set(id, "yes");
      if ([...this.stretchAnswers.values()].every((a) => a === "yes")) this.startConsent();
    }
    if (this.stage === "consent") {
      for (const [id, a] of this.consents) if (a === "pending" && this.auto.has(id)) this.consents.set(id, "yes");
      this.maybeAnnounce();
    }
  }

  /** The private answer to "could you do $12 instead of $10?" */
  answerStretch(id: StudentId, yes: boolean) {
    if (this.stage !== "asking" || this.stretchAnswers.get(id) !== "pending") throw new Error("nothing to answer right now");
    if (yes) {
      this.stretchAnswers.set(id, "yes");
      if ([...this.stretchAnswers.values()].every((a) => a === "yes")) this.startConsent();
      this.settleAuto();
    } else {
      // That limit is firm now; the agents try again without asking it of them.
      const fields = this.firm.get(id) ?? new Set<StretchField>();
      for (const s of this.outcome!.stretches) if (s.studentId === id) fields.add(s.field);
      this.firm.set(id, fields);
      this.run();
    }
    this.changed();
  }

  /** "Would you switch to this version?" A pass sends the agents to the next version. */
  consent(id: StudentId, yes: boolean) {
    if (this.stage !== "consent" || this.consents.get(id) !== "pending") throw new Error("nothing to answer right now");
    if (yes) {
      this.consents.set(id, "yes");
      this.settleAuto();
    } else {
      this.passed.add(this.outcome!.option.id);
      this.run();
    }
    this.changed();
  }

  private maybeAnnounce() {
    if (this.stage !== "consent" || ![...this.consents.values()].every((a) => a === "yes")) return;
    this.stage = "announced";
    this.joined = new Set(this.outcome!.memberIds);
    this.trace.push({ step: "result", option: this.outcome!.option.id, ok: true, groupSize: this.joined.size });
  }

  /** Anyone in the group can join a smaller version once it's announced. */
  join(id: StudentId) {
    if (this.stage !== "announced" || !this.isMember(id) || this.joined.has(id)) throw new Error("nothing to join right now");
    this.joined.add(id);
    this.changed();
  }

  /** What the group channel hears. Never names, never counts, never who stretched or asked. */
  announcement(): { words: string; everyone: boolean; option: CampusEvent; size: number } | null {
    if (this.stage !== "announced" || !this.outcome) return null;
    const o = this.outcome;
    return { words: shareWords(o.memberIds.length, this.plan.memberIds.length), everyone: o.everyone, option: o.option, size: o.memberIds.length };
  }

  view(id: StudentId): PlanView {
    const own = this.terms.get(id);
    const { memberIds: _members, ...plan } = this.plan;
    const base: PlanView = {
      plan,
      terms: own ? (({ studentId: _s, ...rest }) => rest)(own) : null,
      stage: "none",
      version: this.version,
    };
    const o = this.outcome;
    if (!o) return this.stage === "closed" && own ? { ...base, stage: "closed" } : base;
    const words = shareWords(o.memberIds.length, this.plan.memberIds.length);
    if (this.stage === "asking") {
      const mine = o.stretches.find((s) => s.studentId === id);
      if (mine && this.stretchAnswers.get(id) === "pending") {
        const { studentId: _s, ...stretch } = mine;
        return { ...base, stage: "stretch", option: o.option, stretch, everyone: o.everyone, shareWords: words };
      }
      // Nobody else learns that a stretch is being asked.
      return base;
    }
    if (this.stage === "consent" && this.consents.has(id)) {
      return { ...base, stage: this.consents.get(id) === "yes" ? "waiting" : "consent", option: o.option, everyone: o.everyone, shareWords: words };
    }
    if (this.stage === "announced") {
      const ownJoined = this.joined.has(id);
      const names = this.students.filter((s) => this.joined.has(s.id)).map((s) => s.name);
      return { ...base, stage: "announced", option: o.option, everyone: o.everyone, shareWords: words, ownJoined, ...(ownJoined ? { joined: names } : {}) };
    }
    return base;
  }
}
