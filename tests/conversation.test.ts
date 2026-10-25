import { describe, expect, test } from "vitest";
import { respond, viewKey } from "../src/channels/conversation";
import { PlanRuntime } from "../src/server/plan-runtime";
import { termsFallback } from "../src/agents/language";

// Stand-in for the language model: the rule-based reader, so tests never call the API.
const setup = () => new PlanRuntime(async (text) => termsFallback(text));
const say = (rt: PlanRuntime, id: string, text: string) => respond(rt, id, text);
const all = (lines: string[]) => lines.join("\n");

describe("plan over DMs", () => {
  test("how you feel is read back privately and does nothing until you say yes", async () => {
    const rt = setup();
    rt.claim("alex");
    const r = await say(rt, "alex", "honestly i'd rather skip, under $10, home by 11, only if 2 others feel the same");
    expect(all(r)).toMatch(/kept between us/);
    expect(all(r)).toMatch(/\$10 max · home by 11 pm/);
    expect(all(r)).toMatch(/at least 2 others/);
    expect(rt.board.stage).toBe("idle");
  });

  test("off-topic messages get a question, not invented terms", async () => {
    const rt = setup();
    rt.claim("alex");
    expect(all(await say(rt, "alex", "what's everyone wearing"))).toMatch(/how do you feel about the plan/);
    expect(rt.view("alex").terms).toBeNull();
  });

  test("the yes that starts a round brings the private ask in the same reply", async () => {
    const rt = setup();
    rt.claim("alex");
    await say(rt, "alex", "i'd rather skip, under $10, home by 11, only if 2 others feel the same");
    const r = await say(rt, "alex", "yes");
    expect(all(r)).toMatch(/one small ask, just for you/);
    expect(all(r)).toMatch(/\$12 instead of \$10/);
    expect(all(r)).toMatch(/nobody will know it was you/);
    expect(all(r)).not.toMatch(/maya|jay|dev/i);
  });

  test("yes to the ask, then yes to the version: everyone's in, and only then names appear", async () => {
    const rt = setup();
    rt.claim("alex");
    await say(rt, "alex", "i'd rather skip, under $10, home by 11, only if 2 others feel the same");
    await say(rt, "alex", "yes");
    const ask = await say(rt, "alex", "yes");
    expect(all(ask)).toMatch(/a version all of you can do/);
    expect(all(ask)).not.toMatch(/maya|jay|dev/i);
    const done = await say(rt, "alex", "yes");
    expect(all(done)).toMatch(/it's on/);
    expect(all(done)).toMatch(/alex, maya, jay, dev/);
  });

  test("no to the ask keeps the limit, and the agents bring a version for most of the group", async () => {
    const rt = setup();
    rt.claim("alex");
    await say(rt, "alex", "i'd rather skip, under $10, home by 11, only if 2 others feel the same");
    await say(rt, "alex", "yes");
    const r = await say(rt, "alex", "no");
    expect(all(r)).toMatch(/that limit stays/);
    expect(all(r)).toMatch(/open mic night/);
    expect(all(r)).toMatch(/original plan still stands/);
  });

  test("two real people: each one only ever hears their own ask", async () => {
    const rt = setup();
    rt.claim("alex");
    rt.claim("maya");
    await say(rt, "maya", "can't do $40, anything under $10 works");
    await say(rt, "maya", "yes");
    await say(rt, "alex", "i'd rather skip, under $10, home by 11, only if 2 others feel the same");
    await say(rt, "alex", "yes");
    // both have a $10 cap, so both get their own private ask; neither hears about the other's
    expect(rt.view("alex").stage).toBe("stretch");
    expect(rt.view("maya").stage).toBe("stretch");
    await say(rt, "alex", "yes");
    expect(rt.view("alex").stage).toBe("none"); // still waiting, and it doesn't say on whom
    expect(JSON.stringify(rt.view("alex"))).not.toMatch(/maya/i);
  });

  test("off-topic replies during a decision get a reminder, not a decision", async () => {
    const rt = setup();
    rt.claim("alex");
    await say(rt, "alex", "i'd rather skip, under $10, only if 2 others feel the same");
    await say(rt, "alex", "yes");
    const before = viewKey(rt.view("alex"));
    expect(all(await say(rt, "alex", "lol what"))).toMatch(/reply \*\*yes\*\* or \*\*no\*\*/);
    expect(viewKey(rt.view("alex"))).toBe(before);
  });

  test("never mind drops your terms", async () => {
    const rt = setup();
    rt.claim("alex");
    await say(rt, "alex", "i'd rather skip, under $15");
    expect(all(await say(rt, "alex", "never mind"))).toMatch(/dropped/);
    expect(rt.view("alex").terms).toBeNull();
  });
});

describe("rule-based reader (used when the model is unavailable)", () => {
  test("catches budget, curfew and threshold, and ignores the plan's own price", () => {
    expect(termsFallback("i said yes but $40 is a lot. under $10, home by 11, only if 2 others feel the same")).toMatchObject({
      kind: "parsed", terms: { wantsChange: true, conditions: { activityTags: ["any"], maxPrice: 10, endsBefore: "23:00" }, minOthers: 2 },
    });
  });

  test("happy people are read as happy, with no threshold", () => {
    expect(termsFallback("honestly i'm excited for it")).toMatchObject({ kind: "parsed", terms: { wantsChange: false, minOthers: 0 } });
  });

  test("'not a club person' rules clubs out; 'most of us' sets the majority rule", () => {
    expect(termsFallback("not a club person, i'd rather skip")).toMatchObject({ terms: { avoidTags: ["club"] } });
    expect(termsFallback("too expensive, only if most of us feel the same")).toMatchObject({ terms: { majorityOnly: true } });
  });

  test("without a key the reader falls back to the rules", async () => {
    const { RequestLanguage } = await import("../src/agents/language");
    expect(await new RequestLanguage("").parseTerms("i'd rather skip, under $10", "club night")).toMatchObject({ kind: "parsed", source: "rules", terms: { conditions: { maxPrice: 10 } } });
  });
});
