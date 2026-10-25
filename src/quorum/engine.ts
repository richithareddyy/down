// down?: find the version of the group's plan everyone is actually down for.
//
// Each student's agent privately holds that student's terms for the plan: whether they'd rather
// change it, their limits (budget, curfew, things they'd rather avoid) and a threshold ("only if 2
// others feel the same"). When enough people privately want a change, the agents try versions of
// the plan against everyone's terms. Preference order:
//   1. a version everyone can do;
//   2. a version everyone can do if someone stretches a little (only that student is asked, privately);
//   3. otherwise the version the most people can do, with the original plan still standing.
// Agents answer only yes/no/"could stretch"; nobody's words, limits or thresholds leave their agent.
import { checkConditions } from "../domain/constraints";
import type { CampusEvent, Conditions, ISODateTime, Student, StudentId } from "../domain/types";

export interface GroupPlan {
  id: string;
  title: string;
  day: CampusEvent["day"];
  start: string;
  end: string;
  price: number | null;
  location?: string;
  circleId: string;
  memberIds: StudentId[];
  source: "discord-event" | "demo";
}

export interface MemberTerms {
  studentId: StudentId;
  /** Limits for any version of the plan. activityTags ["any"] means any kind of plan is fine. */
  conditions: Conditions;
  /** Kinds of plan this student would rather avoid ("not a club person"). */
  avoidTags: string[];
  /** True when the student privately wants the plan to change. */
  wantsChange: boolean;
  /** Only act on a wish to change if at least this many others want a change too. */
  minOthers: number;
  majorityOnly: boolean;
  approved: boolean;
  updatedAt: ISODateTime;
}

export type StretchField = "maxPrice" | "endsBefore";
export interface Stretch {
  studentId: StudentId;
  field: StretchField;
  from: number | string;
  to: number | string;
}

export interface Outcome {
  option: CampusEvent;
  memberIds: StudentId[];
  /** Private asks: each named student must agree to stretch one limit a little. */
  stretches: Stretch[];
  /** True when it's a version for everyone; false when it's the fallback for a subset. */
  everyone: boolean;
}

export interface TraceRow {
  step: "signal" | "trigger" | "option" | "result";
  agent?: StudentId;
  option?: string;
  verdict?: "fits" | "stretch" | "no" | "unknown";
  ok: boolean;
  groupSize?: number;
}

const ANY = "any";
/** How far an agent may suggest a stretch: a few dollars, or up to an hour later. */
export const STRETCH = { pricePct: 0.5, priceMax: 10, minutesMax: 60 };

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function forOption(conditions: Conditions, option: CampusEvent): Conditions {
  return conditions.activityTags.includes(ANY) || !conditions.activityTags.length
    ? { ...conditions, activityTags: option.activityTags }
    : conditions;
}

export function thresholdHolds(t: MemberTerms, wantersInGroup: number, circleSize: number): boolean {
  if (wantersInGroup - 1 < t.minOthers) return false;
  if (t.majorityOnly && wantersInGroup * 2 <= circleSize) return false;
  return true;
}

/** Does a student's agent accept this version, and if not, could a small stretch make it work? */
export function judge(
  terms: MemberTerms | undefined,
  option: CampusEvent,
  student: Student,
  firm: Set<StretchField> = new Set(),
): { verdict: "fits" | "stretch" | "no" | "unknown"; stretches: Stretch[] } {
  // A friend who never told their agent anything isn't assumed to say no; they'll be asked.
  if (!terms) return { verdict: "unknown", stretches: [] };
  if (terms.avoidTags.some((tag) => option.activityTags.includes(tag))) return { verdict: "no", stretches: [] };
  let c: Conditions = { ...forOption(terms.conditions, option), minGroupSize: undefined, requireApprovedFriend: undefined };
  const stretches: Stretch[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const v = checkConditions(c, option, [student.id], student);
    if (v.verdict === "accept") return { verdict: stretches.length ? "stretch" : "fits", stretches };
    if (v.reasonCode === "OVER_BUDGET" && !firm.has("maxPrice") && c.maxPrice != null) {
      const gap = option.price - c.maxPrice;
      if (gap > STRETCH.priceMax || option.price > c.maxPrice * (1 + STRETCH.pricePct) + 0.001) return { verdict: "no", stretches: [] };
      stretches.push({ studentId: student.id, field: "maxPrice", from: c.maxPrice, to: option.price });
      c = { ...c, maxPrice: option.price };
      continue;
    }
    if (v.reasonCode === "ENDS_TOO_LATE" && !firm.has("endsBefore") && c.endsBefore) {
      const gap = minutes(option.end) - minutes(c.endsBefore);
      if (gap > STRETCH.minutesMax) return { verdict: "no", stretches: [] };
      // endsBefore is strict, so the stretched limit is one minute after the option's end.
      const to = `${String(Math.floor((minutes(option.end) + 1) / 60)).padStart(2, "0")}:${String((minutes(option.end) + 1) % 60).padStart(2, "0")}`;
      stretches.push({ studentId: student.id, field: "endsBefore", from: c.endsBefore, to });
      c = { ...c, endsBefore: to };
      continue;
    }
    return { verdict: "no", stretches: [] };
  }
  return { verdict: "no", stretches: [] };
}

/** The largest group of people who want a change whose thresholds all hold, or 0 if none. */
export function triggerSize(terms: MemberTerms[], circleSize: number): number {
  const wanters = terms.filter((t) => t.approved && t.wantsChange);
  for (let size = wanters.length; size >= 1; size -= 1) {
    // Agents with the lowest thresholds join first, so check the most permissive `size` of them.
    const group = [...wanters].sort((a, b) => a.minOthers - b.minOthers).slice(0, size);
    if (group.every((t) => thresholdHolds(t, size, circleSize))) return size;
  }
  return 0;
}

export function negotiate(
  plan: GroupPlan,
  terms: MemberTerms[],
  options: CampusEvent[],
  students: Student[],
  firm: Map<StudentId, Set<StretchField>> = new Map(),
  trace: TraceRow[] = [],
): Outcome | null {
  const byId = new Map(students.map((s) => [s.id, s]));
  const termsOf = new Map(terms.filter((t) => t.approved).map((t) => [t.studentId, t]));
  for (const id of plan.memberIds) trace.push({ step: "signal", agent: id, ok: !!termsOf.get(id)?.wantsChange });
  const size = triggerSize([...termsOf.values()], plan.memberIds.length);
  trace.push({ step: "trigger", ok: size >= 2, groupSize: size });
  if (size < 2) return null;

  let nearMiss: Outcome | null = null;
  let fallback: Outcome | null = null;
  let fallbackWanters = 0;
  for (const option of options) {
    const judged = plan.memberIds.map((id) => {
      const j = judge(termsOf.get(id), option, byId.get(id)!, firm.get(id));
      trace.push({ step: "option", option: option.id, agent: id, verdict: j.verdict, ok: j.verdict !== "no" });
      return { id, ...j };
    });
    const noes = judged.filter((j) => j.verdict === "no");
    const stretches = judged.flatMap((j) => j.stretches);
    if (!noes.length && !stretches.length) {
      trace.push({ step: "result", option: option.id, ok: true, groupSize: plan.memberIds.length });
      return { option, memberIds: [...plan.memberIds], stretches: [], everyone: true };
    }
    if (!noes.length && (!nearMiss || stretches.length < nearMiss.stretches.length))
      nearMiss = { option, memberIds: [...plan.memberIds], stretches, everyone: true };
    // Fallback: everyone this version fits without a stretch, as long as the wish to change holds.
    const fitIds = judged.filter((j) => j.verdict === "fits").map((j) => j.id);
    const wantersIn = fitIds.filter((id) => termsOf.get(id)?.wantsChange);
    const thresholdsOk = wantersIn.every((id) => thresholdHolds(termsOf.get(id)!, wantersIn.length, plan.memberIds.length));
    // The original plan still stands for people happy with it, so a smaller version is for the
    // people who wanted a change: most of them first, then most people overall.
    const better = !fallback || wantersIn.length > fallbackWanters || (wantersIn.length === fallbackWanters && fitIds.length > fallback.memberIds.length);
    if (wantersIn.length >= 2 && thresholdsOk && better) {
      fallback = { option, memberIds: fitIds, stretches: [], everyone: false };
      fallbackWanters = wantersIn.length;
    }
  }
  const outcome = nearMiss ?? fallback;
  trace.push({ step: "result", option: outcome?.option.id, ok: !!outcome, groupSize: outcome?.memberIds.length });
  return outcome;
}

/** How the group hears a partial result, without a count. */
export function shareWords(groupSize: number, circleSize: number): string {
  if (groupSize === circleSize) return "all of you";
  if (groupSize * 2 > circleSize) return "most of you";
  if (groupSize * 2 === circleSize) return "half of you";
  return "some of you";
}
