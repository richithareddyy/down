import { expect, test } from "vitest";
import {
  conditionsSchema,
  timeSchema,
  commandSchema,
} from "../src/domain/schemas";
test("validates reviewed conditions and rejects malformed limits", () => {
  expect(
    conditionsSchema.safeParse({
      activityTags: ["dance"],
      maxPrice: 8,
      minGroupSize: 3,
    }).success,
  ).toBe(true);
  for (const value of [
    { activityTags: [] },
    { activityTags: ["dance"], maxPrice: -1 },
    { activityTags: ["dance"], minGroupSize: 1.5 },
  ])
    expect(conditionsSchema.safeParse(value).success).toBe(false);
  expect(timeSchema.safeParse("25:00").success).toBe(false);
  expect(
    commandSchema.safeParse({
      type: "reveal",
      proposalId: "p",
      version: 0,
      decision: "approve",
    }).success,
  ).toBe(false);
});
