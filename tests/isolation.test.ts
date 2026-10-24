import { expect, test } from "vitest";
import { createAgentStore } from "../src/server/store";
import { StudentAgent } from "../src/agents/personal-agent";
import { students, seedConditions, events } from "../src/demo/seed";
test("bound stores cannot read or modify another student and snapshots are defensive", () => {
  const a = createAgentStore(students[0]),
    b = createAgentStore(students[1]);
  expect(() => Reflect.apply(a.read, a, ["maya"])).toThrow();
  expect(() => a.update(0, { ...b.read() })).toThrow();
  const snapshot = a.read();
  snapshot.messages.push({
    id: "x",
    role: "student",
    text: "secret",
    createdAt: new Date().toISOString(),
  });
  expect(a.read().messages).toHaveLength(0);
  expect(b.read().messages).toHaveLength(0);
  const person = a.readStudent();
  person.approvedFriendIds.push("jay");
  expect(a.readStudent().approvedFriendIds).toEqual(["maya"]);
});
test("discovery needs reviewed conditions, expires, and caps active interests", () => {
  let now = new Date("2026-10-24T00:00:00Z");
  const store = createAgentStore(students[0]);
  const agent = new StudentAgent(store, () => now);
  expect(() => agent.approveDiscovery(0, "2026-10-25T00:00:00Z")).toThrow();
  store.update(0, { ...store.read(), conditions: seedConditions.alex });
  for (let i = 0; i < 3; i++)
    agent.approveDiscovery(store.read().revision, "2026-10-25T00:00:00Z");
  expect(() =>
    agent.approveDiscovery(store.read().revision, "2026-10-25T00:00:00Z"),
  ).toThrow(/three/);
  expect(agent.getInterestAdvertisements(now.toISOString())).toHaveLength(3);
  now = new Date("2026-10-26T00:00:00Z");
  expect(agent.getInterestAdvertisements(now.toISOString())).toHaveLength(0);
  expect(
    agent.evaluate({
      proposalId: "p",
      version: 1,
      event: events[0],
      memberIds: ["alex", "maya"],
    }),
  ).toEqual({ verdict: "reject", reasonCode: "ACTIVITY_MISMATCH" });
});
