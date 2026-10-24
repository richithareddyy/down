export type StudentId = string;
export type AgentId = string;
export type CircleId = string;
export type EventId = string;
export type ProposalId = string;
export type ISODateTime = string;
export type LocalTime = string; // Validated HH:MM at runtime.
export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export interface Student {
  id: StudentId;
  name: string;
  circleId: CircleId;
  approvedFriendIds: StudentId[];
}
export interface Circle {
  id: CircleId;
  name: string;
  memberIds: StudentId[];
}
export interface CampusEvent {
  id: EventId;
  title: string;
  activityTags: string[];
  beginnerFriendly: boolean;
  day: Day;
  start: LocalTime;
  end: LocalTime;
  price: number;
}
export interface Conditions {
  activityTags: string[];
  maxPrice?: number;
  days?: Day[];
  endsBefore?: LocalTime;
  minGroupSize?: number;
  requireApprovedFriend?: boolean;
  beginnerOnly?: boolean;
}
export interface PrivateMessage {
  id: string;
  role: "student" | "agent";
  text: string;
  createdAt: ISODateTime;
}
export interface Interest {
  id: string;
  conditions: Conditions;
  discoveryApproved: boolean;
  discoveryExpiresAt: ISODateTime;
  circleId: CircleId;
}
export interface AgentState {
  studentId: StudentId;
  messages: PrivateMessage[];
  conditions: Conditions | null;
  discoveryApproved: boolean;
  discoveryExpiresAt: ISODateTime | null;
  activeInterestCount: number;
  interests: Interest[];
  revision: number;
}
export type ProposalStatus =
  | "evaluating"
  | "awaiting_reveal"
  | "revealed"
  | "awaiting_attendance"
  | "confirmed"
  | "closed";
export type RevealDecision = "approve" | "pass";
export type AttendanceDecision = "in" | "out";
export interface Proposal {
  id: ProposalId;
  version: number;
  eventId: EventId;
  eventSnapshot: CampusEvent;
  memberIds: StudentId[];
  status: ProposalStatus;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  revealApprovals: Record<StudentId, RevealDecision | "pending">;
  attendance: Record<StudentId, AttendanceDecision | "pending">;
  interestIds: Record<StudentId, string>;
  conditionRevisions: Record<StudentId, number>;
}
export interface Cooldown {
  memberSetHash: string;
  eventId: EventId;
  until: ISODateTime;
}
export type ReasonCode =
  | "GROUP_TOO_SMALL"
  | "NO_APPROVED_FRIEND"
  | "OVER_BUDGET"
  | "WRONG_DAY"
  | "ENDS_TOO_LATE"
  | "NOT_BEGINNER"
  | "ACTIVITY_MISMATCH";
export type Verdict =
  { verdict: "accept" } | { verdict: "reject"; reasonCode: ReasonCode };
export interface ProposalRef {
  proposalId: ProposalId;
  version: number;
}
export interface EventSummary {
  title: string;
  day: Day;
  start: LocalTime;
  end: LocalTime;
  price: number;
}
export interface ProtocolPayloads {
  INTEREST: {
    agentId: AgentId;
    activityTags: string[];
    expiresAt: ISODateTime;
  };
  EVALUATE: ProposalRef & {
    eventId: EventId;
    groupSize: number;
    memberIds: StudentId[];
  };
  EVAL_RESPONSE: ProposalRef & { agentId: AgentId } & Verdict;
  REVEAL_REQUEST: ProposalRef & {
    eventSummary: EventSummary;
    groupSize: number;
  };
  REVEAL_DECISION: ProposalRef & { agentId: AgentId; decision: RevealDecision };
  REVEAL: ProposalRef & { memberNames: string[] };
  ATTEND_REQUEST: ProposalRef & {
    eventSummary: EventSummary;
    groupSize: number;
  };
  ATTEND_DECISION: ProposalRef & {
    agentId: AgentId;
    decision: AttendanceDecision;
  };
  WITHDRAW: ProposalRef & { agentId: AgentId };
  RECHECK: {
    proposalId: ProposalId;
    newVersion: number;
    groupSize: number;
    memberIds: StudentId[];
  };
}
export type ProtocolType = keyof ProtocolPayloads;
export type ProtocolEvent = {
  [K in ProtocolType]: {
    id: string;
    ts: ISODateTime;
    from: string;
    to: string;
    type: K;
    payload: ProtocolPayloads[K];
  };
}[ProtocolType];

// A bound store capability exposes no caller-selected student ID.
export interface AgentStore {
  read(): Readonly<AgentState>;
  readStudent(): Readonly<Student>;
  update(expectedRevision: number, next: AgentState): void;
}
export interface EvaluationRequest extends ProposalRef {
  event: CampusEvent;
  memberIds: StudentId[];
}
export interface PersonalAgent {
  id: AgentId;
  evaluate(request: EvaluationRequest): Verdict;
  getInterestAdvertisements(now: ISODateTime): ProtocolPayloads["INTEREST"][];
}
export type IntakeResult =
  | { kind: "parsed"; conditions: Conditions; source: "model" | "seed" }
  | { kind: "clarify"; question: string };
export interface LanguageService {
  parse(text: string, ownConditions: Conditions | null): Promise<IntakeResult>;
  phrase(ownState: {
    conditions: Conditions;
    intent: "review" | "recheck";
  }): Promise<string>;
}
export interface RecheckPrompt {
  proposalId: ProposalId;
  version: number;
  groupSize: number;
  text: string;
  proposedConditions: Conditions;
}
export type StudentProposalView =
  | (ProposalRef & {
      stage: "evaluating";
      event: EventSummary;
      groupSize: number;
    })
  | (ProposalRef & {
      stage: "awaiting_reveal";
      event: EventSummary;
      groupSize: number;
      ownDecision: RevealDecision | "pending";
      expiresAt: ISODateTime;
    })
  | (ProposalRef & {
      stage: "revealed" | "awaiting_attendance" | "confirmed";
      event: EventSummary;
      memberNames: string[];
      ownAttendance: AttendanceDecision | "pending";
    })
  | (ProposalRef & { stage: "closed"; message: string });
export interface StudentView {
  self: { id: StudentId; name: string };
  circleName: string;
  draftText?: string;
  messages: PrivateMessage[];
  conditions: Conditions | null;
  discoveryApproved: boolean;
  discoveryExpiresAt: ISODateTime | null;
  proposal: StudentProposalView | null;
  recheck: RecheckPrompt | null;
  revision: number;
}
export type StudentCommand =
  | { type: "intake"; text: string }
  | { type: "edit_conditions"; conditions: Conditions }
  | {
      type: "approve_discovery";
      expectedRevision: number;
      expiresAt: ISODateTime;
    }
  | ({ type: "reveal"; decision: RevealDecision } & ProposalRef)
  | ({ type: "attendance"; decision: AttendanceDecision } & ProposalRef)
  | ({ type: "withdraw" } & ProposalRef)
  | ({
      type: "answer_recheck";
      decision: "approve_change" | "pass";
      expectedRevision: number;
      conditions: Conditions;
    } & ProposalRef);
export type DemoCommand = { type: "reset" | "run_script" | "withdraw_alex" };
export type ApiErrorCode =
  | "INVALID_INPUT"
  | "STALE_VERSION"
  | "EXPIRED"
  | "NOT_ALLOWED"
  | "INTEREST_LIMIT"
  | "NOT_FOUND";
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; code: ApiErrorCode; message: string };
export type StudentStreamEvent =
  | { type: "snapshot"; data: StudentView }
  | { type: "heartbeat"; ts: ISODateTime };
export interface DemoProtocolRow {
  id: string;
  ts: ISODateTime;
  type: ProtocolType;
  version?: number;
  fromAlias: string;
  toAlias: string;
  groupSize?: number;
  reasonCode?: ReasonCode;
}
export type DemoStreamEvent =
  | { type: "protocol"; data: DemoProtocolRow }
  | { type: "reset"; generation: number };
export interface Clock {
  now(): Date;
}
export interface DemoConfig {
  proposalTtlMs: number;
  cooldownMs: number;
  scriptedDelayMs: number;
}
