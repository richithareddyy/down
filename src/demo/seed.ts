// The demo friend group: four fictional students, their plan, the versions agents may try,
// and what each friend told their own agent. Nothing here is a real event, price or booking.
import type { CampusEvent, Student } from "../domain/types";
import type { GroupPlan } from "../quorum/engine";
import type { TermsInput } from "../quorum/board";
export const students: Student[] = [
  { id: "alex", name: "Alex", circleId: "campus", approvedFriendIds: ["maya"] },
  {
    id: "maya",
    name: "Maya",
    circleId: "campus",
    approvedFriendIds: ["alex", "jay", "dev"],
  },
  {
    id: "jay",
    name: "Jay",
    circleId: "campus",
    approvedFriendIds: ["alex", "maya", "dev"],
  },
  {
    id: "dev",
    name: "Dev",
    circleId: "campus",
    approvedFriendIds: ["alex", "maya", "jay"],
  },
];
// The group's plan and the versions of it the agents can try, in the order they try them.
export const groupPlan: GroupPlan = {
  id: "club-night",
  title: "club night downtown",
  day: "fri",
  start: "22:00",
  end: "01:00",
  price: 40,
  location: "Fictional downtown club",
  circleId: "campus",
  memberIds: students.map((s) => s.id),
  source: "demo",
};
const version = (e: Omit<CampusEvent, "beginnerFriendly" | "date" | "timeZone" | "synthetic" | "costSource" | "nextAction">): CampusEvent => ({
  beginnerFriendly: true,
  date: "2026-10-30",
  timeZone: "America/Phoenix",
  synthetic: true,
  costSource: "Synthetic fixture",
  nextAction: "Agree on a meeting spot; nothing is booked.",
  ...e,
});
export const planVersions: CampusEvent[] = [
  version({ id: "early", title: "same club, student early entry", activityTags: ["club", "dance"], day: "fri", start: "20:30", end: "22:30", price: 12, location: "Fictional downtown club" }),
  version({ id: "mic", title: "open mic night", activityTags: ["music", "open mic"], day: "fri", start: "20:00", end: "22:00", price: 5, location: "Fictional student lounge" }),
  version({ id: "games", title: "board game night", activityTags: ["games"], day: "fri", start: "19:00", end: "22:00", price: 0, location: "Fictional student union lounge" }),
];

/** What each demo friend told their own agent, and how their agent reads it. */
export const friendTerms: Record<string, { says: string; terms: TermsInput }> = {
  alex: {
    says: "i said yes but $40 + an uber home is a lot. under $10, home by 11, only if 2 others feel the same.",
    terms: { wantsChange: true, conditions: { activityTags: ["any"], maxPrice: 10, endsBefore: "23:00" }, minOthers: 2 },
  },
  maya: {
    says: "can't do $40 this week. anything under $15.",
    terms: { wantsChange: true, conditions: { activityTags: ["any"], maxPrice: 15 }, minOthers: 1 },
  },
  jay: {
    says: "honestly? i'm excited for the club. if it changes, keep it a club thing.",
    terms: { wantsChange: false, conditions: { activityTags: ["club", "dance"] } },
  },
  dev: {
    says: "i'd switch if anyone else does. early shift saturday, home by 11.",
    terms: { wantsChange: true, conditions: { activityTags: ["any"], endsBefore: "23:00" }, minOthers: 1 },
  },
};
