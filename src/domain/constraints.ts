import type {
  CampusEvent,
  Conditions,
  Student,
  StudentId,
  Verdict,
} from "./types";
export function checkConditions(
  conditions: Conditions,
  event: CampusEvent,
  members: StudentId[],
  student: Student,
): Verdict {
  const reject = (
    reasonCode: Extract<Verdict, { verdict: "reject" }>["reasonCode"],
  ): Verdict => ({ verdict: "reject", reasonCode });
  if (!conditions.activityTags.some((tag) => event.activityTags.includes(tag)))
    return reject("ACTIVITY_MISMATCH");
  if (conditions.days && !conditions.days.includes(event.day))
    return reject("WRONG_DAY");
  if (conditions.maxPrice !== undefined && event.price > conditions.maxPrice)
    return reject("OVER_BUDGET");
  if (conditions.endsBefore && event.end >= conditions.endsBefore)
    return reject("ENDS_TOO_LATE");
  if (conditions.beginnerOnly && !event.beginnerFriendly)
    return reject("NOT_BEGINNER");
  if (new Set(members).size < (conditions.minGroupSize ?? 1))
    return reject("GROUP_TOO_SMALL");
  if (
    conditions.requireApprovedFriend &&
    !members.some(
      (id) => id !== student.id && student.approvedFriendIds.includes(id),
    )
  )
    return reject("NO_APPROVED_FRIEND");
  return { verdict: "accept" };
}
