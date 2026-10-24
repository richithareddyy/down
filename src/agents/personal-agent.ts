import type {
  AgentStore,
  PersonalAgent,
  EvaluationRequest,
  Verdict,
  Conditions,
} from "../domain/types";
import { checkConditions } from "../domain/constraints";
import { DomainError } from "../domain/proposals";
export class StudentAgent implements PersonalAgent {
  readonly id: string;
  #store: AgentStore;
  constructor(
    store: AgentStore,
    private now: () => Date = () => new Date(),
  ) {
    this.#store = store;
    this.id = store.read().studentId;
  }
  getInterestAdvertisements(now: string) {
    return this.#store
      .read()
      .interests.filter(
        (i) =>
          i.discoveryApproved &&
          Date.parse(i.discoveryExpiresAt) > Date.parse(now),
      )
      .map((i) => ({
        agentId: this.id,
        activityTags: i.conditions.activityTags,
        expiresAt: i.discoveryExpiresAt,
      }));
  }
  evaluate(request: EvaluationRequest): Verdict {
    const state = this.#store.read();
    const interests = state.interests.filter(
      (i) =>
        i.discoveryApproved &&
        Date.parse(i.discoveryExpiresAt) > this.now().getTime(),
    );
    if (!interests.length)
      return { verdict: "reject", reasonCode: "ACTIVITY_MISMATCH" };
    const verdicts = interests.map((i) =>
      checkConditions(
        i.conditions,
        request.event,
        request.memberIds,
        this.#store.readStudent(),
      ),
    );
    return (
      verdicts.find((v) => v.verdict === "accept") ??
      verdicts[verdicts.length - 1]
    );
  }
  approveDiscovery(expectedRevision: number, expiresAt: string) {
    const state = this.#store.read();
    if (!state.conditions)
      throw new DomainError("INVALID_INPUT", "review conditions first");
    if (
      Date.parse(expiresAt) <= this.now().getTime() ||
      Date.parse(expiresAt) > this.now().getTime() + 7 * 86400000
    )
      throw new DomainError(
        "INVALID_INPUT",
        "choose a discovery expiry within the next seven days",
      );
    const active = state.interests.filter(
      (i) =>
        i.discoveryApproved &&
        Date.parse(i.discoveryExpiresAt) > this.now().getTime(),
    );
    if (active.length >= 3)
      throw new DomainError(
        "INTEREST_LIMIT",
        "you can have up to three active interests",
      );
    active.push({
      id: crypto.randomUUID(),
      conditions: structuredClone(state.conditions),
      discoveryApproved: true,
      discoveryExpiresAt: expiresAt,
      circleId: this.#store.readStudent().circleId,
    });
    this.#store.update(expectedRevision, {
      ...state,
      interests: active,
      activeInterestCount: active.length,
      discoveryApproved: true,
      discoveryExpiresAt: expiresAt,
    });
  }
  revoke() {
    const state = this.#store.read();
    this.#store.update(state.revision, {
      ...state,
      interests: [],
      activeInterestCount: 0,
      discoveryApproved: false,
      discoveryExpiresAt: null,
    });
  }
  replaceReviewedConditions(conditions: Conditions, expectedRevision: number) {
    const state = this.#store.read();
    this.#store.update(expectedRevision, {
      ...state,
      conditions,
      interests: state.interests.map((i) => ({
        ...i,
        conditions: structuredClone(conditions),
      })),
    });
  }
}
