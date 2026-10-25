import { expect, test } from "vitest";
import { planFromEvents, priceOf, tagsOf } from "../src/channels/discord-plan";

const at = (iso: string) => new Date(iso);
const events = [
  { id: "1", name: "Club night downtown", description: "#plan $40 cover", start: at("2026-10-31T05:00:00Z"), end: at("2026-10-31T08:00:00Z"), location: "downtown" },
  { id: "2", name: "Board game night", description: "free, bring snacks", start: at("2026-10-31T02:00:00Z"), end: at("2026-10-31T05:00:00Z"), location: "MU" },
  { id: "3", name: "Taco run", description: "split the bill", start: at("2026-10-31T01:00:00Z"), end: null, location: null },
];

test("the event marked #plan is the plan; priced events are versions; unpriced ones are skipped", () => {
  const r = planFromEvents(events)!;
  expect(r.plan).toMatchObject({ title: "club night downtown", day: "fri", start: "22:00", price: 40, source: "discord-event" });
  expect(r.versions.map((v) => v.title)).toEqual(["board game night"]);
  expect(r.versions[0]).toMatchObject({ day: "fri", start: "19:00", end: "22:00", price: 0, activityTags: ["games"] });
  expect(r.skipped).toEqual(["Taco run"]);
});

test("no events means the demo plan is used", () => {
  expect(planFromEvents([])).toBeNull();
});

test("prices and kinds come from plain words", () => {
  expect([priceOf("$12 at the door"), priceOf("FREE"), priceOf("ask maya")]).toEqual([12, 0, null]);
  expect(tagsOf("Open mic at the lounge")).toEqual(["open mic", "music"]);
  expect(tagsOf("study session")).toEqual(["other"]);
});
