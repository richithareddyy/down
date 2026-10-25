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
  if (
    !Number.isFinite(event.price) ||
    event.price < 0 ||
    !event.day ||
    !event.start ||
    !event.end
  )
    return reject("UNKNOWN_EVENT_DETAILS");
  if (conditions.timeZone && event.timeZone !== conditions.timeZone)
    return reject("UNKNOWN_EVENT_DETAILS");
  if (conditions.dates && !event.date) return reject("UNKNOWN_EVENT_DETAILS");
  if (conditions.locations && !event.location)
    return reject("UNKNOWN_EVENT_DETAILS");
  if (conditions.accessibleOnly && event.accessible === undefined)
    return reject("UNKNOWN_EVENT_DETAILS");
  if (conditions.eventIds && !conditions.eventIds.includes(event.id))
    return reject("WRONG_EVENT");
  if (conditions.dates && !conditions.dates.includes(event.date!))
    return reject("WRONG_DATE");
  if (conditions.locations && !conditions.locations.includes(event.location!))
    return reject("WRONG_LOCATION");
  if (conditions.accessibleOnly && !event.accessible)
    return reject("NOT_ACCESSIBLE");
  if (conditions.startsAfter && event.start < conditions.startsAfter)
    return reject("STARTS_TOO_EARLY");
  if (
    conditions.maxGroupSize &&
    new Set(members).size > conditions.maxGroupSize
  )
    return reject("GROUP_TOO_LARGE");
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
