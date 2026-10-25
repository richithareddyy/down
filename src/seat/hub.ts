// Every open group in every server, and every student's private terms.
// A student's agent is matched against open seats in the servers that student belongs to, and a
// student is held by at most one arrangement at a time. State is in memory for this prototype.
import { SeatBoard, type SeatView, type SeekerInput } from "./board";
import type { OpenGroup } from "./engine";

export interface GroupRecord {
  group: OpenGroup;
  guildId: string;
  channelId: string;
  board: SeatBoard;
}

interface Seeker {
  input: SeekerInput;
  approved: boolean;
  guilds: Set<string>;
}

export class Hub {
  readonly groups = new Map<string, GroupRecord>();
  private seekers = new Map<string, Seeker>();
  private names = new Map<string, string>();
  /** Demo players whose agents answer by themselves in every group. */
  private autos = new Set<string>();
  private listeners = new Set<() => void>();
  private settling = false;
  readonly people = { name: (id: string) => this.names.get(id) ?? id };

  constructor(private now: () => Date = () => new Date()) {}

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  setName(id: string, name: string) {
    this.names.set(id, name);
  }

  /** Is this student free to be offered a seat in this group? */
  private isFree(id: string, groupId: string) {
    for (const [gid, r] of this.groups) if (gid !== groupId && (r.board.holds(id) || r.group.captainId === id || r.group.subId === id)) return false;
    return true;
  }

  /** A group posts its open seats. Approved students in that server are considered right away. */
  addGroup(group: OpenGroup, guildId: string, channelId: string, auto: string[] = []): GroupRecord {
    const board = new SeatBoard(group, this.people, () => {}, this.now, (id) => this.isFree(id, group.id));
    for (const id of [...auto, ...this.autos]) board.setAuto(id, true);
    const record = { group, guildId, channelId, board };
    this.groups.set(group.id, record);
    const ready = [...this.seekers].filter(([id, s]) => s.approved && s.guilds.has(guildId) && id !== group.captainId && id !== group.subId);
    if (ready.length) board.draftMany(ready.map(([id, s]) => [id, s.input]), true);
    this.settle();
    return record;
  }

  removeGroup(id: string) {
    this.groups.delete(id);
    this.settle();
  }

  /** Groups whose game is over are dropped. */
  sweep(nowHHMM: string) {
    for (const [id, r] of this.groups) if (r.group.versions.every((v) => v.end <= nowHHMM) && r.board.stage !== "seated") this.groups.delete(id);
  }

  draftSeeker(id: string, input: SeekerInput, guilds: string[]) {
    this.seekers.set(id, { input, approved: false, guilds: new Set(guilds) });
    this.notify();
  }

  hasDraft(id: string) {
    return this.seekers.get(id)?.approved === false;
  }

  terms(id: string) {
    return this.seekers.get(id) ?? null;
  }

  approveSeeker(id: string, auto = false) {
    const s = this.seekers.get(id);
    if (!s) throw new Error("nothing to approve yet");
    s.approved = true;
    if (auto) this.autos.add(id);
    for (const r of this.groups.values()) {
      if (!s.guilds.has(r.guildId) || r.group.captainId === id || r.group.subId === id) continue;
      if (auto) r.board.setAuto(id, true);
      r.board.draft(id, s.input, true);
    }
    this.settle();
  }

  withdrawSeeker(id: string) {
    this.seekers.delete(id);
    for (const r of this.groups.values()) r.board.withdraw(id);
    this.settle();
  }

  /** After anything changes, idle groups look again: someone may have just become free. */
  settle() {
    if (this.settling) return;
    this.settling = true;
    try {
      for (let pass = 0; pass < 4; pass += 1) {
        let moved = false;
        for (const r of this.groups.values()) moved = r.board.refresh() || moved;
        if (!moved) break;
      }
    } finally {
      this.settling = false;
    }
    this.notify();
  }

  /** Every group this person is part of, and what they may see in each. */
  views(id: string): { record: GroupRecord; view: SeatView }[] {
    const out: { record: GroupRecord; view: SeatView }[] = [];
    for (const r of this.groups.values()) {
      const view = r.board.view(id);
      if (view.role !== "none") out.push({ record: r, view });
    }
    return out;
  }

  /** The one thing waiting on this person, if any: a sub ask or a seat to confirm. */
  pending(id: string) {
    return this.views(id).find(({ view }) => view.stage === "rotate" || view.stage === "confirm") ?? null;
  }

  /** Open groups in these servers, for telling a student what's happening. */
  openIn(guilds: string[]) {
    return [...this.groups.values()].filter((r) => guilds.includes(r.guildId) && r.board.stage !== "seated");
  }

  /** Run an answer on a board, then let the rest of the hub catch up. */
  act(groupId: string, fn: (b: SeatBoard) => void) {
    const r = this.groups.get(groupId);
    if (!r) throw new Error("nothing to answer right now");
    fn(r.board);
    this.settle();
  }
}
