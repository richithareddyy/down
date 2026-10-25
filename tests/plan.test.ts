import { describe, expect, test } from "vitest";
import { PlanBoard, type TermsInput } from "../src/quorum/board";
import { judge, negotiate, shareWords, thresholdHolds, triggerSize, type GroupPlan, type MemberTerms } from "../src/quorum/engine";
import { friendTerms, groupPlan, planVersions, students } from "../src/demo/seed";
import { tryPlan } from "../src/server/plan-runtime";
import type { CampusEvent, Conditions } from "../src/domain/types";

const any = (extra: Partial<Conditions> = {}): Conditions => ({ activityTags: ["any"], ...extra });
const terms = (studentId: string, input: Partial<MemberTerms> = {}): MemberTerms => ({
  studentId, conditions: any(), avoidTags: [], wantsChange: true, minOthers: 1, majorityOnly: false, approved: true, updatedAt: "2026-10-24T00:00:00Z", ...input,
});
const ev = (id: string, start: string, end: string, price: number, tags: string[]): CampusEvent => ({ id, title: id, activityTags: tags, beginnerFriendly: true, day: "fri", start, end, price });
const student = (id: string) => students.find((s) => s.id === id)!;
const friends = (): [string, TermsInput][] => ["maya", "jay", "dev"].map((id) => [id, friendTerms[id].terms]);
const alex = friendTerms.alex.terms;

describe("engine: each agent judges a version against its own student's terms", () => {
  const early = planVersions[0];
  test("a version that fits says fits; a small gap becomes a private stretch, a big one a no", () => {
    expect(judge(terms("jay", { conditions: { activityTags: ["club"] } }), early, student("jay")).verdict).toBe("fits");
    expect(judge(terms("alex", { conditions: any({ maxPrice: 10 }) }), early, student("alex"))).toEqual({
      verdict: "stretch", stretches: [{ studentId: "alex", field: "maxPrice", from: 10, to: 12 }],
    });
    expect(judge(terms("alex", { conditions: any({ maxPrice: 5 }) }), early, student("alex")).verdict).toBe("no");
  });

  test("a limit the student declined to stretch stays firm", () => {
    expect(judge(terms("alex", { conditions: any({ maxPrice: 10 }) }), early, student("alex"), new Set(["maxPrice"])).verdict).toBe("no");
  });

  test("things a student rules out are a no, and an agent with no terms is unknown, not a no", () => {
    expect(judge(terms("alex", { avoidTags: ["club"] }), early, student("alex")).verdict).toBe("no");
    expect(judge(undefined, early, student("alex")).verdict).toBe("unknown");
  });

  test("a late finish within an hour is a stretch; past that it's a no", () => {
    const late = ev("late", "21:00", "23:30", 0, ["games"]);
    expect(judge(terms("dev", { conditions: any({ endsBefore: "23:00" }) }), late, student("dev")).stretches[0]).toMatchObject({ field: "endsBefore", from: "23:00" });
    expect(judge(terms("dev", { conditions: any({ endsBefore: "22:00" }) }), late, student("dev")).verdict).toBe("no");
  });

  test("thresholds are private and depend on how many others want a change", () => {
    expect(thresholdHolds(terms("a", { minOthers: 2 }), 3, 4)).toBe(true);
    expect(thresholdHolds(terms("a", { minOthers: 2 }), 2, 4)).toBe(false);
    expect(thresholdHolds(terms("a", { minOthers: 0, majorityOnly: true }), 2, 4)).toBe(false);
    expect(triggerSize([terms("a", { minOthers: 3 }), terms("b"), terms("c")], 4)).toBe(2);
  });

  test("one person alone never starts a negotiation, so a change can't be traced to them", () => {
    const plan: GroupPlan = { ...groupPlan };
    expect(negotiate(plan, [terms("alex", { minOthers: 0 })], planVersions, students)).toBeNull();
  });

  test("prefers a version everyone can do, then one with the fewest stretches, then the most people", () => {
    const all = [terms("alex", { conditions: any({ maxPrice: 10, endsBefore: "23:00" }), minOthers: 2 }), terms("maya", { conditions: any({ maxPrice: 15 }) }), terms("jay", { wantsChange: false, conditions: { activityTags: ["club", "dance"] } }), terms("dev", { conditions: any({ endsBefore: "23:00" }) })];
    const near = negotiate(groupPlan, all, planVersions, students);
    expect(near).toMatchObject({ option: { id: "early" }, everyone: true, stretches: [{ studentId: "alex", field: "maxPrice", from: 10, to: 12 }] });
    const firm = negotiate(groupPlan, all, planVersions, students, new Map([["alex", new Set(["maxPrice" as const])]]));
    expect(firm).toMatchObject({ option: { id: "mic" }, everyone: false, memberIds: ["alex", "maya", "dev"] });
  });

  test("share words never give a count", () => {
    expect([shareWords(4, 4), shareWords(3, 4), shareWords(2, 4), shareWords(1, 4)]).toEqual(["all of you", "most of you", "half of you", "some of you"]);
  });
});

describe("board: private asks, private yeses, anonymous result", () => {
  const board = () => {
    const b = new PlanBoard(groupPlan, planVersions, students);
    for (const [id] of friends()) b.setAuto(id, true);
    b.draftMany([...friends(), ["alex", alex]], true);
    return b;
  };

  test("only the person who'd stretch is asked, and nobody else sees that a stretch exists", () => {
    const b = board();
    expect(b.stage).toBe("asking");
    expect(b.view("alex")).toMatchObject({ stage: "stretch", stretch: { field: "maxPrice", from: 10, to: 12 }, option: { id: "early" } });
    for (const id of ["maya", "jay", "dev"]) {
      const v = b.view(id);
      expect(v.stage).toBe("none");
      expect(JSON.stringify(v)).not.toMatch(/stretch|alex/i);
    }
  });

  test("yes to the stretch moves everyone to a private yes; the last yes announces it", () => {
    const b = board();
    b.answerStretch("alex", true);
    expect(b.view("alex").stage).toBe("consent"); // demo friends already said yes
    b.consent("alex", true);
    expect(b.stage).toBe("announced");
    expect(b.announcement()).toMatchObject({ words: "all of you", everyone: true, option: { id: "early" } });
    expect(b.view("jay").joined).toEqual(["Alex", "Maya", "Jay", "Dev"]);
  });

  test("no to the stretch keeps that limit firm and the agents try the next version", () => {
    const b = board();
    b.answerStretch("alex", false);
    expect(b.view("alex")).toMatchObject({ stage: "consent", option: { id: "mic" }, everyone: false, shareWords: "most of you" });
    b.consent("alex", true);
    expect(b.announcement()).toMatchObject({ words: "most of you", everyone: false });
    // Jay wasn't in this version; Jay sees it but no names until joining.
    expect(b.view("jay")).toMatchObject({ stage: "announced", ownJoined: false });
    expect(b.view("jay").joined).toBeUndefined();
    b.join("jay");
    expect(b.view("jay").joined).toContain("Jay");
  });

  test("a pass sends the agents to the next version; nobody learns who passed", () => {
    const b = board();
    b.answerStretch("alex", true);
    b.consent("alex", false);
    expect(b.view("alex").option?.id).toBe("mic");
    expect(JSON.stringify(b.view("maya"))).not.toMatch(/pass/);
  });

  test("when nothing is left to try, it closes quietly and the original plan stands", () => {
    const b = board();
    b.answerStretch("alex", true);
    b.consent("alex", false); // not early
    b.consent("alex", false); // not mic
    b.consent("alex", false); // not games
    expect(b.stage).toBe("closed");
    expect(b.announcement()).toBeNull();
  });

  test("a friend who never told their agent anything is asked, not assumed", () => {
    const b = new PlanBoard(groupPlan, planVersions, students);
    b.draftMany([["maya", friendTerms.maya.terms], ["dev", friendTerms.dev.terms]], true);
    // alex and jay are unknown: the club early entry fits everyone who answered, so all four are asked.
    expect(b.view("alex").stage).toBe("consent");
    expect(b.view("jay").stage).toBe("consent");
  });

  test("terms count only after the student approves them", () => {
    const b = new PlanBoard(groupPlan, planVersions, students);
    b.draft("maya", friendTerms.maya.terms);
    b.draft("dev", friendTerms.dev.terms);
    expect(b.stage).toBe("idle");
    b.approve("maya");
    b.approve("dev");
    expect(b.stage).toBe("consent");
  });

  test("views never carry anyone else's terms or the member list", () => {
    const b = board();
    const v = JSON.stringify(b.view("maya"));
    expect(v).not.toMatch(/memberIds|minOthers":2|maxPrice":10/);
  });
});

describe("website demo endpoint logic", () => {
  test("the default story: one private ask, then all of you", () => {
    expect(tryPlan(alex).view.stage).toBe("stretch");
    const done = tryPlan(alex, [{ type: "stretch", yes: true }, { type: "consent", yes: true }]);
    expect(done.announcement).toMatchObject({ words: "all of you", everyone: true });
  });

  test("a tighter budget gets a different version, never a bigger ask", () => {
    const r = tryPlan({ ...alex, conditions: { ...alex.conditions, maxPrice: 5 } });
    expect(r.view).toMatchObject({ stage: "consent", option: { id: "mic" }, shareWords: "most of you" });
  });

  test("what crossed between agents is one word per version, never a limit", () => {
    const r = tryPlan(alex);
    expect(r.trace.some((t) => t.verdict === "stretch")).toBe(true);
    expect(JSON.stringify(r.trace)).not.toMatch(/maxPrice|endsBefore|minOthers|\$/);
  });

  test("stale answers are ignored instead of breaking the replay", () => {
    expect(tryPlan(alex, [{ type: "join" }, { type: "consent", yes: true }]).view.stage).toBe("stretch");
  });
});
