// One open activity and the round around it.
// Stages: idle (agents hold terms quietly) -> asking (the sub is privately asked to rotate in)
// -> confirming (every party gets the complete bundle at once) -> seated (names and place unlock)
// or closed (nothing fits; nobody learns why).
import { arrange, hm, type Bundle, type OpenGroup, type ProtocolRow, type SearchState, type SeekerTerms, type Version } from "./engine";

export type Stage = "idle" | "asking" | "confirming" | "seated" | "closed";
export type SeekerInput = Omit<SeekerTerms, "studentId" | "approved" | "updatedAt">;

export interface People {
  name(id: string): string;
}

/** What one person may see. Never anyone else's terms, levels or reasons. */
export interface SeatView {
  role: "seeker" | "captain" | "sub" | "none";
  group: { title: string; place: string; now: string; kind: string };
  terms: Omit<SeekerTerms, "studentId"> | null;
  stage: "none" | "rotate" | "confirm" | "waiting" | "seated" | "closed";
  version?: Version;
  /** Newcomers in the bundle besides you (seekers), or in total (captain). Never who. */
  newcomers?: number;
  rotation?: { at: string; you: boolean } | null;
  /** Only after everyone confirmed. */
  names?: string[];
}

export class SeatBoard {
  private terms = new Map<string, SeekerTerms>();
  stage: Stage = "idle";
  bundle: Bundle | null = null;
  private search: SearchState = { excluded: new Set(), versionsPassed: new Set(), rotationDeclined: false };
  private rotationAnswer: "pending" | "yes" | null = null;
  private confirms = new Map<string, "pending" | "yes">();
  /** Parties whose agents answer by themselves (demo players). */
  readonly auto = new Set<string>();
  log: ProtocolRow[] = [];
  version = 0;
  /** When the current ask went out, so silence can expire. */
  private askedAt = 0;

  constructor(
    public group: OpenGroup,
    private people: People,
    private onChange: () => void = () => {},
    private now: () => Date = () => new Date(),
    /** False for a student already held by another group's arrangement. */
    private isFree: (id: string) => boolean = () => true,
  ) {}

  /** True while this board holds a student (asking, confirming or seated). */
  holds(id: string) {
    return this.stage !== "idle" && this.stage !== "closed" && !!this.bundle?.seekerIds.includes(id);
  }

  /** Look again after someone elsewhere became free. Returns true if something new happened. */
  refresh(): boolean {
    if (this.stage !== "idle") return false;
    this.run();
    return this.stage !== "idle";
  }

  private changed() {
    this.version += 1;
    this.onChange();
  }

  /** Save (or replace) a seeker's private terms. They count once approved. */
  draft(id: string, input: SeekerInput, approved = false) {
    this.draftMany([[id, input]], approved);
  }

  draftMany(entries: [string, SeekerInput][], approved = false) {
    for (const [id, input] of entries) {
      if (id === this.group.captainId || id === this.group.subId) throw new Error("you're already in this game");
      this.terms.set(id, { ...input, studentId: id, approved, updatedAt: this.now().toISOString() });
    }
    if (approved) this.restart(entries.map(([id]) => id));
    this.changed();
  }

  hasDraft(id: string) {
    const t = this.terms.get(id);
    return !!t && !t.approved;
  }

  approve(id: string) {
    const t = this.terms.get(id);
    if (!t) throw new Error("nothing to approve yet");
    t.approved = true;
    this.restart([id]);
    this.changed();
  }

  withdraw(id: string) {
    if (!this.terms.delete(id)) return;
    this.restart([id]);
    this.changed();
  }

  setAuto(id: string, on: boolean) {
    if (on) this.auto.add(id);
    else {
      this.auto.delete(id);
      if (this.terms.has(id)) this.withdraw(id);
    }
  }

  /**
   * Changed terms start a fresh search, unless people are already seated. Mid-round, only a
   * change from someone in the arrangement restarts it; a newcomer elsewhere doesn't disturb it.
   */
  private restart(who: string[] = []) {
    if (this.stage === "seated") return;
    const midRound = this.stage === "asking" || this.stage === "confirming";
    if (midRound && !who.some((id) => this.bundle?.seekerIds.includes(id))) return;
    this.search = { excluded: new Set(), versionsPassed: new Set(), rotationDeclined: false };
    this.run();
    if (midRound && this.stage === "idle") this.stage = "closed";
  }

  private run() {
    this.bundle = arrange(this.group, [...this.terms.values()].filter((t) => this.isFree(t.studentId)), this.search, this.log);
    this.rotationAnswer = null;
    this.confirms.clear();
    if (!this.bundle) {
      const tried = this.search.excluded!.size || this.search.versionsPassed!.size || this.search.rotationDeclined;
      this.stage = tried ? "closed" : "idle";
      return;
    }
    this.askedAt = this.now().getTime();
    if (this.bundle.rotation) {
      this.stage = "asking";
      this.rotationAnswer = "pending";
      this.log.push({ level: 2, from: `${this.group.captainId}'s agent`, to: `${this.group.subId}'s agent`, text: `rotate in at ${hm(this.bundle.rotation.at)}?`, ok: true });
    } else this.startConfirm();
    this.settleAuto();
  }

  private startConfirm() {
    this.stage = "confirming";
    this.askedAt = this.now().getTime();
    const parties = [...this.bundle!.seekerIds, this.group.captainId];
    this.confirms = new Map(parties.map((id) => [id, "pending"]));
  }

  private settleAuto() {
    if (this.stage === "asking" && this.group.subId && this.auto.has(this.group.subId)) this.answerRotation(this.group.subId, true, true);
    if (this.stage === "confirming") {
      for (const [id, a] of this.confirms) if (a === "pending" && this.auto.has(id)) this.confirms.set(id, "yes");
      this.maybeSeat();
    }
  }

  /** The sub's private answer: rotate in when the early leaver goes? */
  answerRotation(id: string, yes: boolean, quiet = false) {
    if (this.stage !== "asking" || id !== this.group.subId || this.rotationAnswer !== "pending") throw new Error("nothing to answer right now");
    this.log.push({ level: 2, from: `${id}'s agent`, to: `${this.group.captainId}'s agent`, text: yes ? `will rotate in at ${hm(this.bundle!.rotation!.at)}` : "can't rotate in", ok: yes });
    if (yes) {
      this.rotationAnswer = "yes";
      this.startConfirm();
      this.settleAuto();
    } else {
      this.search.rotationDeclined = true;
      this.run();
    }
    if (!quiet) this.changed();
  }

  /** A party's answer to the complete bundle. A pass sends the agents to the next arrangement. */
  confirm(id: string, yes: boolean) {
    if (this.stage !== "confirming" || this.confirms.get(id) !== "pending") throw new Error("nothing to answer right now");
    if (yes) {
      this.confirms.set(id, "yes");
      this.settleAuto();
    } else if (id === this.group.captainId) {
      this.search.versionsPassed!.add(this.bundle!.version.id);
      this.run();
    } else {
      this.search.excluded!.add(id);
      this.run();
    }
    this.changed();
  }

  /**
   * Silence counts as no. An unanswered sub ask or confirmation expires after `ttlMs`, and the
   * agents move on without anyone having to chase. Returns true if something expired.
   */
  expire(nowMs: number, ttlMs: number): boolean {
    if ((this.stage !== "asking" && this.stage !== "confirming") || nowMs - this.askedAt < ttlMs) return false;
    if (this.stage === "asking" && this.group.subId) {
      this.log.push({ level: 2, from: "timer", to: `${this.group.captainId}'s agent`, text: "no answer from the sub in time", ok: false });
      this.answerRotation(this.group.subId, false, true);
    } else {
      const silent = [...this.confirms].find(([, a]) => a === "pending")?.[0];
      if (silent) {
        this.log.push({ level: 2, from: "timer", to: "agents", text: "a confirmation timed out", ok: false });
        this.confirm(silent, false);
      }
    }
    return true;
  }

  /** After seating, someone can't make it anymore: their seat reopens and the agents re-arrange. */
  dropOut(id: string) {
    if (this.stage !== "seated" || !this.bundle) throw new Error("nothing to drop out of");
    if (this.bundle.seekerIds.includes(id)) this.terms.delete(id);
    else if (id === this.group.subId) this.group = { ...this.group, subId: null };
    else throw new Error("nothing to drop out of");
    this.log.push({ level: 2, from: `${id}'s agent`, to: "agents", text: "can't make it anymore", ok: false });
    this.stage = "idle";
    this.search = { excluded: new Set(), versionsPassed: new Set(), rotationDeclined: false };
    this.run();
    if (this.stage === "idle") this.stage = "closed";
    this.changed();
  }

  private maybeSeat() {
    if (this.stage !== "confirming" || ![...this.confirms.values()].every((a) => a === "yes")) return;
    this.stage = "seated";
    this.log.push({ level: 3, from: "everyone", to: "everyone", text: `all confirmed: names and the court unlocked`, ok: true });
  }

  view(id: string): SeatView {
    const g = this.group;
    const role: SeatView["role"] = id === g.captainId ? "captain" : id === g.subId ? "sub" : this.terms.has(id) ? "seeker" : "none";
    const own = this.terms.get(id);
    const base: SeatView = {
      role,
      group: { title: g.title, place: g.place, now: g.now, kind: g.kind },
      terms: own ? (({ studentId: _s, ...rest }) => rest)(own) : null,
      stage: "none",
    };
    const b = this.bundle;
    if (!b) return this.stage === "closed" && (own || role === "captain") ? { ...base, stage: "closed" } : base;
    const inBundle = b.seekerIds.includes(id);
    const rotation = b.rotation ? { at: b.rotation.at, you: b.rotation.leaverId === id } : null;
    if (this.stage === "asking") {
      if (role === "sub" && this.rotationAnswer === "pending") return { ...base, stage: "rotate", version: b.version, rotation };
      return base; // nobody else learns that a rotation is being asked
    }
    if (this.stage === "confirming") {
      if (role === "captain" || inBundle) {
        return {
          ...base,
          stage: this.confirms.get(id) === "yes" ? "waiting" : "confirm",
          version: b.version,
          newcomers: role === "captain" ? b.seekerIds.length : b.seekerIds.length - 1,
          rotation,
        };
      }
      return base;
    }
    if (this.stage === "seated" && (role === "captain" || role === "sub" || inBundle)) {
      const ids = [g.captainId, ...(g.subId ? [g.subId] : []), ...b.seekerIds];
      return { ...base, stage: "seated", version: b.version, newcomers: b.seekerIds.length, rotation, names: ids.map((x) => this.people.name(x)) };
    }
    return base;
  }

  /** What the group's channel hears once seated. */
  announcement(): { version: Version; newcomers: number; rotation: Bundle["rotation"] } | null {
    if (this.stage !== "seated" || !this.bundle) return null;
    return { version: this.bundle.version, newcomers: this.bundle.seekerIds.length, rotation: this.bundle.rotation };
  }
}
