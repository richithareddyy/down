import { describe, expect, test } from "vitest";
import { arrange, fits, type SeekerTerms } from "../src/seat/engine";
import { SeatBoard, type SeekerInput } from "../src/seat/board";
import { court, people, seekerTerms } from "../src/seat/demo";
import { trySeat } from "../src/seat/runtime";

const t = (id: string, extra: Partial<SeekerTerms> = {}): SeekerTerms => ({
  studentId: id, ...seekerTerms[id].terms, approved: true, updatedAt: "2026-10-27T20:00:00Z", ...extra,
});
const all = () => ["alex", "jordan", "priya", "riley"].map((id) => t(id));
const [early, later] = court.versions;

describe("engine: each agent judges a version on its own student's terms", () => {
  test("level, kind, arrival and a hard stop are checked privately", () => {
    expect(fits(t("alex"), court, early)).toEqual({ ok: true, leavesEarly: false });
    expect(fits(t("jordan"), court, early)).toEqual({ ok: true, leavesEarly: true }); // leaves 2:20
    expect(fits(t("priya"), court, early)).toMatchObject({ ok: false, why: "late" }); // free from 1:45
    expect(fits(t("riley"), court, early)).toMatchObject({ ok: false, why: "level" }); // wants competitive
    expect(fits(t("alex", { kinds: ["volleyball"] }), court, early)).toMatchObject({ ok: false, why: "kind" });
    expect(fits(t("alex", { freeUntil: "13:50" }), court, early)).toMatchObject({ ok: false, why: "window" });
  });

  test("no single request is satisfiable alone", () => {
    expect(arrange(court, [t("alex")])).toBeNull(); // won't go as the only newcomer, and the game needs exactly 2
    expect(arrange(court, [t("jordan")])).toBeNull(); // 3v3 + 1 breaks the game
  });

  test("the four requests together: Alex and Jordan pair up for 4v4 now, with a rotation at 2:20", () => {
    expect(arrange(court, all())).toEqual({ groupId: court.id, version: early, seekerIds: ["alex", "jordan"], rotation: { leaverId: "jordan", at: "14:20" } });
  });

  test("if the sub can't rotate in, the game restructures to start at 1:45 with Priya instead", () => {
    expect(arrange(court, all(), { rotationDeclined: true })).toMatchObject({ version: later, seekerIds: ["alex", "priya"], rotation: null });
  });

  test("if Alex passes, Jordan and Priya fill it at 1:45 with the rotation", () => {
    expect(arrange(court, all(), { excluded: new Set(["alex"]) })).toMatchObject({ version: later, seekerIds: ["jordan", "priya"], rotation: { leaverId: "jordan" } });
  });

  test("never more than one early leaver, and never without a sub", () => {
    const two = [t("alex", { freeUntil: "14:20", notAlone: false }), t("jordan")];
    expect(arrange(court, two)).toBeNull();
    expect(arrange({ ...court, subId: null }, [t("alex"), t("jordan")])).toBeNull();
  });

  test("a group that doesn't welcome beginners never gets one (the others still fill it)", () => {
    const b = arrange({ ...court, beginnersWelcome: false }, all());
    expect(b?.seekerIds).not.toContain("alex");
    expect(b?.seekerIds).toEqual(["jordan", "priya"]);
  });

  test("what crosses between agents never includes a level, a reason or a word the student said", () => {
    const log: Parameters<typeof arrange>[3] = [];
    arrange(court, all(), {}, log);
    const text = log.map((r) => r.text).join(" | ");
    expect(text).not.toMatch(/beginner|\blevel\b|competitive|chem|lab|class|awkward|only new one|alone/i);
  });
});

describe("board: the sub's private ask, then everyone confirms the complete bundle at once", () => {
  const board = () => {
    const b = new SeatBoard(court, people);
    for (const id of ["jordan", "priya", "riley", "sam"]) b.setAuto(id, true);
    b.draftMany((["jordan", "priya", "riley", "alex"] as const).map((id): [string, SeekerInput] => [id, seekerTerms[id].terms]), true);
    return b;
  };

  test("only the sub is asked first; nobody else learns a rotation is being asked", () => {
    const b = board();
    expect(b.stage).toBe("asking");
    expect(b.view("dave")).toMatchObject({ stage: "rotate", rotation: { at: "14:20" } });
    expect(b.view("alex").stage).toBe("none");
    expect(b.view("sam").stage).toBe("none");
  });

  test("after the sub says yes, Alex gets one complete seat, with no names yet", () => {
    const b = board();
    b.answerRotation("dave", true);
    const v = b.view("alex");
    expect(v).toMatchObject({ stage: "confirm", newcomers: 1, version: { label: "4v4 full court", start: "13:35" }, rotation: { at: "14:20", you: false } });
    expect(v.names).toBeUndefined();
    expect(JSON.stringify(v)).not.toMatch(/jordan|dave|sam/i);
  });

  test("the last yes seats everyone and unlocks names for the people in the game", () => {
    const b = board();
    b.answerRotation("dave", true);
    b.confirm("alex", true);
    expect(b.stage).toBe("seated");
    expect([...b.view("alex").names!].sort()).toEqual(["Alex", "Dave", "Jordan", "Sam"]);
    expect(b.view("priya").names).toBeUndefined(); // not in this game
    expect(b.announcement()).toMatchObject({ newcomers: 2, rotation: { at: "14:20" } });
  });

  test("the sub saying no restructures the game instead of failing", () => {
    const b = board();
    b.answerRotation("dave", false);
    expect(b.view("alex")).toMatchObject({ stage: "confirm", version: { start: "13:45" }, rotation: null });
  });

  test("a pass from Alex re-forms the game without Alex, and Alex is told nothing more", () => {
    const b = board();
    b.answerRotation("dave", true);
    b.confirm("alex", false);
    expect(b.bundle?.seekerIds).toEqual(["jordan", "priya"]);
    expect(b.view("alex").stage).toBe("none");
  });

  test("terms count only once approved", () => {
    const b = new SeatBoard(court, people);
    b.draft("alex", seekerTerms.alex.terms);
    b.draft("jordan", seekerTerms.jordan.terms);
    expect(b.stage).toBe("idle");
  });
});

describe("website demo logic", () => {
  test("default: Dave rotates, Alex confirms, everyone is seated", () => {
    expect(trySeat(seekerTerms.alex.terms).view.stage).toBe("confirm");
    expect(trySeat(seekerTerms.alex.terms, {}, [{ type: "confirm", yes: true }]).announcement).toMatchObject({ newcomers: 2 });
  });

  test("with nobody else looking, Alex quietly waits", () => {
    expect(trySeat(seekerTerms.alex.terms, { others: [] }).view.stage).toBe("none");
  });

  test("if Dave can't sub, the game moves to 1:45 with Priya", () => {
    expect(trySeat(seekerTerms.alex.terms, { daveSubs: false }).view).toMatchObject({ stage: "confirm", version: { start: "13:45" } });
  });
});
