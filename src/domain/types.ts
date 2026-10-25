export type StudentId = string;
export type ISODateTime = string;
export type LocalTime = string; // HH:MM, America/Phoenix
export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface Student {
  id: StudentId;
  name: string;
  circleId: string;
  approvedFriendIds: StudentId[];
}

/** A plan or a version of one: what agents judge against their student's terms. */
export interface CampusEvent {
  id: string;
  title: string;
  activityTags: string[];
  beginnerFriendly: boolean;
  day: Day;
  start: LocalTime;
  end: LocalTime;
  price: number;
  date?: string;
  timeZone?: string;
  location?: string;
  accessible?: boolean;
  synthetic?: boolean;
  costSource?: string;
  nextAction?: string;
}

/** A student's limits for any version of the plan. */
export interface Conditions {
  activityTags: string[];
  maxPrice?: number;
  days?: Day[];
  endsBefore?: LocalTime;
  startsAfter?: LocalTime;
  dates?: string[];
  timeZone?: string;
  eventIds?: string[];
  locations?: string[];
  accessibleOnly?: boolean;
  maxGroupSize?: number;
  minGroupSize?: number;
  requireApprovedFriend?: boolean;
  beginnerOnly?: boolean;
}

export type ReasonCode =
  | "UNKNOWN_EVENT_DETAILS"
  | "WRONG_EVENT"
  | "WRONG_LOCATION"
  | "WRONG_DATE"
  | "STARTS_TOO_EARLY"
  | "GROUP_TOO_LARGE"
  | "NOT_ACCESSIBLE"
  | "GROUP_TOO_SMALL"
  | "NO_APPROVED_FRIEND"
  | "OVER_BUDGET"
  | "WRONG_DAY"
  | "ENDS_TOO_LATE"
  | "NOT_BEGINNER"
  | "ACTIVITY_MISMATCH";
export type Verdict = { verdict: "accept" } | { verdict: "reject"; reasonCode: ReasonCode };
