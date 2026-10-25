import { expect, test, vi } from "vitest";
import { RequestLanguage } from "../src/agents/language";

const reply = (text: string, stop_reason = "end_turn") =>
  vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "msg", type: "message", role: "assistant", model: "m", stop_reason, content: text ? [{ type: "text", text }] : [], usage: { input_tokens: 1, output_tokens: 1 } }));

const good = JSON.stringify({
  kind: "parsed", wantsChange: true, conditions: { activityTags: ["any"], maxPrice: 10, endsBefore: "23:00" },
  avoidTags: ["club"], minOthers: 2, majorityOnly: false, question: "",
});

test("the model's reading becomes terms, and the request carries only this student's message and the plan", async () => {
  const mock = reply(good);
  const r = await new RequestLanguage("test", mock).parseTerms("ngl $40 is a lot. under $10, home by 11, only if 2 others", "club night downtown · fri 10 pm · $40");
  expect(r).toEqual({ kind: "parsed", source: "model", terms: { wantsChange: true, conditions: { activityTags: ["any"], maxPrice: 10, endsBefore: "23:00" }, avoidTags: ["club"], minOthers: 2, majorityOnly: false } });
  const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
  expect(JSON.parse(body.messages[0].content)).toEqual({ text: "ngl $40 is a lot. under $10, home by 11, only if 2 others", groupPlan: "club night downtown · fri 10 pm · $40" });
  expect(body.output_config.format.type).toBe("json_schema");
});

test("someone happy with the plan never gets a threshold", async () => {
  const happy = JSON.stringify({ kind: "parsed", wantsChange: false, conditions: { activityTags: ["club"] }, avoidTags: [], minOthers: 3, majorityOnly: false, question: "" });
  expect(await new RequestLanguage("test", reply(happy)).parseTerms("i'm excited for it", "club night")).toMatchObject({ terms: { wantsChange: false, minOthers: 0 } });
});

test("malformed, refused or offline readings fall back to the rule-based reader", async () => {
  const bad = JSON.stringify({ kind: "parsed", wantsChange: true, conditions: { activityTags: ["any"], maxPrice: -5 }, avoidTags: [], minOthers: 1, majorityOnly: false, question: "" });
  const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
  for (const mock of [reply(bad), reply("", "refusal"), reply("not json"), offline]) {
    const r = await new RequestLanguage("test", mock).parseTerms("i'd rather skip, under $12", "club night");
    expect(r).toMatchObject({ kind: "parsed", source: "rules", terms: { conditions: { maxPrice: 12 } } });
  }
});

test("a model question is passed on as a question", async () => {
  const ask = JSON.stringify({ kind: "clarify", wantsChange: false, conditions: null, avoidTags: [], minOthers: 0, majorityOnly: false, question: "is this about friday's plan?" });
  expect(await new RequestLanguage("test", reply(ask)).parseTerms("what time", "club night")).toEqual({ kind: "clarify", question: "is this about friday's plan?" });
});
