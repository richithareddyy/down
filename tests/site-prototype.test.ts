import { describe, expect, test } from "vitest";
import { DEFAULT_ALEX, FRIENDS, VERSIONS, tryPlan as browserTry } from "../public/site/prototype.js";
import { tryPlan as serverTry, type TryAction } from "../src/server/plan-runtime";
import { friendTerms, planVersions } from "../src/demo/seed";
import type { TermsInput } from "../src/quorum/board";

type Shape = ReturnType<typeof serverTry>;
const project = (r: Shape) => ({
  stage: r.view.stage,
  option: r.view.option?.id,
  stretch: r.view.stretch,
  shareWords: r.view.shareWords,
  everyone: r.view.everyone,
  joined: r.view.joined,
  ownJoined: r.view.ownJoined,
  announcement: r.announcement && { words: r.announcement.words, everyone: r.announcement.everyone, option: r.announcement.option.id },
  trace: r.trace,
});

const alexes: TermsInput[] = [];
for (const wantsChange of [true, false])
  for (const maxPrice of [0, 5, 8, 10, 12, 15, 20])
    for (const endsBefore of ["22:00", "23:00", undefined])
      for (const minOthers of [1, 2, 3])
        alexes.push({ wantsChange, conditions: { activityTags: ["any"], maxPrice, ...(endsBefore ? { endsBefore } : {}) }, minOthers: wantsChange ? minOthers : 0 });

const scripts: TryAction[][] = [
  [],
  [{ type: "stretch", yes: true }],
  [{ type: "stretch", yes: true }, { type: "consent", yes: true }],
  [{ type: "stretch", yes: false }],
  [{ type: "stretch", yes: false }, { type: "consent", yes: true }],
  [{ type: "consent", yes: true }],
  [{ type: "consent", yes: false }],
  [{ type: "consent", yes: false }, { type: "consent", yes: false }, { type: "consent", yes: false }],
  [{ type: "stretch", yes: true }, { type: "consent", yes: false }, { type: "consent", yes: true }],
  [{ type: "consent", yes: true }, { type: "join" }],
  [{ type: "join" }],
  // declining the stretch, then passing twice: the others go ahead with early entry without Alex
  [{ type: "stretch", yes: false }, { type: "consent", yes: false }, { type: "consent", yes: false }],
  // saying yes to the stretch, then passing on every version: nothing is left, so it closes
  [{ type: "stretch", yes: true }, { type: "consent", yes: false }, { type: "consent", yes: false }, { type: "consent", yes: false }],
];

describe("the website's in-browser copy matches the prototype", () => {
  test("same scenario data", () => {
    expect(VERSIONS.map((v) => [v.id, v.start, v.end, v.price, v.activityTags])).toEqual(planVersions.map((v) => [v.id, v.start, v.end, v.price, v.activityTags]));
    for (const id of ["maya", "jay", "dev"] as const) expect(FRIENDS[id].terms).toEqual(friendTerms[id].terms);
    expect(DEFAULT_ALEX).toEqual(friendTerms.alex.terms);
  });

  test(`same outcome for ${alexes.length * scripts.length} combinations of terms and answers`, () => {
    for (const alex of alexes)
      for (const actions of scripts)
        expect(project(browserTry(alex, actions) as Shape), JSON.stringify({ alex, actions })).toEqual(project(serverTry(alex, actions)));
  });

  test("the default story reaches every stage the site shows", () => {
    const stages = new Set(scripts.map((a) => serverTry(friendTerms.alex.terms, a).view.stage));
    for (const s of ["stretch", "consent", "announced", "closed"]) expect(stages).toContain(s);
  });
});
