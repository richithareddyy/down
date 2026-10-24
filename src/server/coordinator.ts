import type { CampusEvent, PersonalAgent, StudentId } from "../domain/types";
import type { Emit } from "./protocol";
export function subsets<T>(items: T[]): T[][] {
  return Array.from({ length: 2 ** items.length - 1 }, (_, i) =>
    items.filter((_, bit) => (i + 1) & (1 << bit)),
  ).sort((a, b) => b.length - a.length);
}
export interface Match {
  event: CampusEvent;
  memberIds: StudentId[];
  proposalId: string;
}
export function findGroup(
  agents: PersonalAgent[],
  events: CampusEvent[],
  now: Date,
  emit: Emit,
  blocked: (eventId: string, members: string[]) => boolean = () => false,
): Match | null {
  const adverts = agents.flatMap((agent) =>
    agent
      .getInterestAdvertisements(now.toISOString())
      .map((ad) => ({ agent, ad })),
  );
  for (const { ad } of adverts) emit("INTEREST", ad.agentId, "coordinator", ad);
  for (const event of events) {
    const eligible = agents.filter((agent) =>
      adverts.some(
        (x) =>
          x.agent.id === agent.id &&
          x.ad.activityTags.some((tag) => event.activityTags.includes(tag)),
      ),
    );
    if (!eligible.length) continue;
    const proposalId = crypto.randomUUID();
    const evaluate = (group: PersonalAgent[]) => {
      const members = group.map((a) => a.id);
      const verdicts = group.map((agent) => {
        emit("EVALUATE", "coordinator", agent.id, {
          proposalId,
          version: 1,
          eventId: event.id,
          groupSize: members.length,
          memberIds: members,
        });
        const result = agent.evaluate({
          proposalId,
          version: 1,
          event,
          memberIds: members,
        });
        emit("EVAL_RESPONSE", agent.id, "coordinator", {
          proposalId,
          version: 1,
          agentId: agent.id,
          ...result,
        });
        return result;
      });
      return verdicts.every((v) => v.verdict === "accept");
    };
    const demoPair = eligible.filter((a) => a.id === "jay" || a.id === "maya");
    if (
      demoPair.length === 2 &&
      !blocked(
        event.id,
        demoPair.map((a) => a.id),
      )
    )
      evaluate(demoPair);
    for (const group of subsets(eligible)) {
      const memberIds = group.map((a) => a.id);
      if (blocked(event.id, memberIds)) continue;
      if (evaluate(group)) return { event, memberIds, proposalId };
    }
  }
  return null;
}
