import { describe, expect, test, vi } from "vitest";
import { handlePost, noteFor, respondDM, type DmContext, type PostContext } from "../src/channels/conversation";
import { Hub } from "../src/seat/hub";
import { groupFallback, RequestLanguage, seekerFallback } from "../src/agents/language";
import { groupFrom } from "../src/seat/post";

const NOW = "13:30";
const all = (lines: string[]) => lines.join("\n");
const dm = (hub: Hub, userId: string, text: string, guilds = ["asu"]) =>
  respondDM(hub, { userId, guilds, now: NOW, parse: async (t, _a, n) => seekerFallback(t, n) } satisfies DmContext, text);
const post = (hub: Hub, authorId: string, text: string, opts: Partial<PostContext> = {}) =>
  handlePost(hub, { authorId, authorName: authorId, guildId: "asu", channelId: "c1", mentions: [], now: NOW, parse: async (t, n) => groupFallback(t, n), ...opts }, text);

const COURT = "6 of us on court 2 playing 3v3 till 2:30, we'd go 4v4 if exactly 2 more join, beginners welcome";
const ALEX = "basketball, beginner, free 1:30 to 2:30, won't go if i'm the only new one";
const JORDAN = "down to hoop, casual, free from 1:30, hard stop at 2:20 for lab";

describe("a real server: a group posts, two strangers DM, the agents arrange it", () => {
  test("a mention posts the open seat, with a sub picked by mention", async () => {
    const hub = new Hub();
    const reply = await post(hub, "sam", COURT, { mentions: [{ id: "dave", name: "Dave" }] });
    expect(reply).toMatch(/open seat:.*court 2/);
    expect(reply).toMatch(/4v4 if exactly 2 more join · till 2:30 pm · Dave can sub/);
    expect(reply).toMatch(/DM me your terms, privately/);
    expect([...hub.groups.values()][0].group).toMatchObject({ captainId: "sam", subId: "dave", playing: 6, kind: "basketball" });
  });

  test("one student alone gets nothing; the second one completes it; the sub is asked first", async () => {
    const hub = new Hub();
    await post(hub, "sam", COURT, { mentions: [{ id: "dave", name: "Dave" }] });
    await dm(hub, "alex", ALEX);
    expect(all(await dm(hub, "alex", "yes"))).toMatch(/locked in/);
    await dm(hub, "jordan", JORDAN);
    await dm(hub, "jordan", "yes");
    expect(noteFor(hub.views("dave")[0].view)).toMatch(/can you sub in\?[\s\S]*leave at 2:20 pm/);
    expect(hub.pending("alex")).toBeNull(); // nobody else hears while the sub decides
    await dm(hub, "dave", "yes");
    expect(noteFor(hub.pending("alex")!.view)).toMatch(/a seat is open for you[\s\S]*1 other newcomer/);
    expect(noteFor(hub.pending("sam")!.view)).toMatch(/2 newcomers can fill your seats/);
  });

  test("everyone confirms; names unlock only then", async () => {
    const hub = new Hub();
    for (const [id, name] of [["sam", "Sam"], ["dave", "Dave"], ["alex", "Alex"], ["jordan", "Jordan"]]) hub.setName(id, name);
    await post(hub, "sam", COURT, { authorName: "Sam", mentions: [{ id: "dave", name: "Dave" }] });
    for (const [id, text] of [["alex", ALEX], ["jordan", JORDAN]]) { await dm(hub, id, text); await dm(hub, id, "yes"); }
    await dm(hub, "dave", "yes");
    await dm(hub, "alex", "yes");
    await dm(hub, "jordan", "yes");
    const last = all(await dm(hub, "sam", "yes"));
    expect(last).toMatch(/you're in[\s\S]*with: Sam, Dave, (Alex, Jordan|Jordan, Alex)/);
    expect([...hub.groups.values()][0].board.announcement()).toMatchObject({ newcomers: 2 });
  });

  test("a student is only matched in servers they belong to", async () => {
    const hub = new Hub();
    await post(hub, "sam", COURT, { mentions: [{ id: "dave", name: "Dave" }] });
    await dm(hub, "alex", ALEX, ["other-server"]);
    await dm(hub, "alex", "yes", ["other-server"]);
    await dm(hub, "jordan", JORDAN);
    await dm(hub, "jordan", "yes");
    expect(hub.pending("alex")).toBeNull();
    expect(hub.views("dave")[0].view.stage).toBe("none");
  });

  test("two groups at once: a student is held by only one arrangement", async () => {
    const hub = new Hub();
    await post(hub, "sam", COURT, { mentions: [{ id: "dave", name: "Dave" }] });
    await post(hub, "kim", "6 of us at the rec center playing 3v3 till 2:30, 4v4 if exactly 2 more join", { channelId: "c2" });
    await dm(hub, "alex", ALEX); await dm(hub, "alex", "yes");
    await dm(hub, "casey", "basketball, casual, free 1:30 to 3"); await dm(hub, "casey", "yes");
    const holding = [...hub.groups.values()].filter((r) => r.board.holds("alex"));
    expect(holding).toHaveLength(1);
  });

  test("a student who passes is never told who else was in it, and the group keeps looking", async () => {
    const hub = new Hub();
    await post(hub, "sam", COURT, { mentions: [{ id: "dave", name: "Dave" }] });
    for (const [id, text] of [["alex", ALEX], ["jordan", JORDAN]]) { await dm(hub, id, text); await dm(hub, id, "yes"); }
    await dm(hub, "dave", "yes");
    expect(all(await dm(hub, "alex", "pass"))).toMatch(/nobody learns it was you/);
    expect(JSON.stringify(hub.views("alex").map(({ view }) => view))).not.toMatch(/jordan/i);
  });

  test("the captain can close their post", async () => {
    const hub = new Hub();
    await post(hub, "sam", COURT);
    expect(await post(hub, "sam", "done")).toMatch(/closed/);
    expect(hub.groups.size).toBe(0);
  });

  test("demo adds a labeled demo game and two demo students, so one person can try it", async () => {
    const hub = new Hub();
    expect(await post(hub, "you", "demo")).toMatch(/demo players added/);
    await dm(hub, "you", "basketball, beginner, free for an hour, not if i'm the only new one");
    const r = all(await dm(hub, "you", "yes"));
    expect(r).toMatch(/a seat is open for you/);
    await dm(hub, "you", "yes");
    expect(noteFor(hub.views("you")[0].view)).toMatch(/you're in[\s\S]*Sam \(demo\)/);
  });

  test("off-topic replies during a decision get a reminder, not a decision", async () => {
    const hub = new Hub();
    await post(hub, "x", "demo");
    await dm(hub, "alex", ALEX); await dm(hub, "alex", "yes");
    expect(all(await dm(hub, "alex", "lol what"))).toMatch(/reply \*\*yes\*\* or \*\*pass\*\*/);
  });

  test("never mind drops your terms everywhere", async () => {
    const hub = new Hub();
    await dm(hub, "alex", ALEX);
    expect(all(await dm(hub, "alex", "never mind"))).toMatch(/dropped/);
    expect(hub.terms("alex")).toBeNull();
  });
});

describe("the reader", () => {
  test("seeker rules: kind, window, hard stop, level, not-alone; times default to now", () => {
    expect(seekerFallback(ALEX)).toEqual({ kind: "parsed", source: "rules", terms: { kinds: ["basketball"], freeFrom: "13:30", freeUntil: "14:30", level: "new", notAlone: true } });
    expect(seekerFallback("down to hoop, casual. hard stop at 2:20 for chem lab", "13:00")).toMatchObject({ terms: { freeFrom: "13:00", freeUntil: "14:20", level: "casual" } });
    expect(seekerFallback("basketball whenever", "16:10")).toMatchObject({ terms: { freeFrom: "16:10", freeUntil: "17:10" } });
    expect(seekerFallback("what's for dinner")).toMatchObject({ kind: "clarify" });
  });

  test("group rules: count, formats, seats, end time, place", () => {
    expect(groupFallback(COURT, NOW)).toMatchObject({ kind: "parsed", group: { kind: "basketball", playing: 6, current: "3v3", next: "4v4", seats: 2, until: "14:30", place: "court 2", beginnersWelcome: true } });
    expect(groupFallback("anyone wanna hang", NOW)).toMatchObject({ kind: "clarify" });
  });

  test("a post becomes two versions: starting soon, and ten minutes later", () => {
    const g = groupFrom((groupFallback(COURT, "13:32") as { group: Parameters<typeof groupFrom>[0] }).group, "sam", "dave", "13:32");
    expect(g.versions.map((v) => v.start)).toEqual(["13:40", "13:50"]);
    expect(g.versions[0]).toMatchObject({ size: 8, end: "14:30" });
  });

  const reply = (text: string, stop_reason = "end_turn") =>
    vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "m", type: "message", role: "assistant", model: "m", stop_reason, content: text ? [{ type: "text", text }] : [], usage: { input_tokens: 1, output_tokens: 1 } }));

  test("model readings become terms; a bad, refused or failed reading falls back to the rules", async () => {
    const good = JSON.stringify({ kind: "parsed", terms: { kinds: ["basketball"], freeFrom: "13:30", freeUntil: "14:20", level: "new", notAlone: true }, question: "" });
    expect(await new RequestLanguage("k", reply(good)).parseSeeker("x", "court", NOW)).toMatchObject({ source: "model", terms: { freeUntil: "14:20" } });
    const bad = JSON.stringify({ kind: "parsed", terms: { kinds: ["basketball"], freeFrom: "15:00", freeUntil: "14:00", level: "new", notAlone: true }, question: "" });
    for (const mock of [reply(bad), reply("", "refusal"), vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"))])
      expect(await new RequestLanguage("k", mock).parseSeeker(ALEX, "court", NOW)).toMatchObject({ source: "rules" });
    const group = JSON.stringify({ kind: "parsed", group: { title: "pickup basketball", kind: "basketball", place: "court 2", playing: 6, current: "3v3 half court", seats: 2, next: "4v4 full court", until: "14:30", beginnersWelcome: true, vibe: "casual" }, question: "" });
    expect(await new RequestLanguage("k", reply(group)).parseGroup(COURT, NOW)).toMatchObject({ source: "model", group: { seats: 2, next: "4v4 full court" } });
  });
});
