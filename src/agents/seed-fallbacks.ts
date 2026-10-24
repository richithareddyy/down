import type { Conditions, IntakeResult } from "../domain/types";
import { seedMessages, seedConditions } from "../demo/seed";
export function seedFallback(
  text: string,
  ownConditions: Conditions | null,
): IntakeResult {
  const normalized = text.trim().toLowerCase();
  for (const [id, message] of Object.entries(seedMessages)) {
    const direct = normalized === message.toLowerCase(),
      contextual =
        normalized === `for beginner dance: ${message.toLowerCase()}`;
    if (direct || contextual) {
      if (
        (id === "maya" || id === "jay") &&
        !contextual &&
        !ownConditions?.activityTags.includes("dance")
      )
        return {
          kind: "clarify",
          question:
            "which activity do you mean? tell me, or choose it in the condition card.",
        };
      return {
        kind: "parsed",
        conditions: structuredClone(seedConditions[id]),
        source: "seed",
      };
    }
  }
  return {
    kind: "clarify",
    question:
      "i need a little more detail. which activity, budget, time, and group would work? you can also set your conditions below.",
  };
}
