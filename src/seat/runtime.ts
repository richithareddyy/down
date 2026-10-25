// Shared helpers, and a fresh board for each website visitor.
import { SeatBoard, type SeatView, type SeekerInput } from "./board";
import { court, people, seekerTerms, groupSays, NAMES } from "./demo";
import type { OpenGroup, ProtocolRow, Version } from "./engine";

export function clock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}
export const activityLabel = (g: OpenGroup) => `${g.title} · ${g.place} · ${g.now} now`;

// ---- the website demo: a fresh board per request, replayed from the visitor's choices ----

export type TryAction = { type: "confirm"; yes: boolean };
export interface TryOptions {
  /** Which other students are looking right now. */
  others?: string[];
  /** Whether Dave says yes to rotating in. */
  daveSubs?: boolean;
}

export interface TryResult {
  view: SeatView;
  announcement: { version: Version; newcomers: number; rotation: { leaverId: string; at: string } | null } | null;
  log: ProtocolRow[];
  others: { id: string; name: string; says: string }[];
  group: { sam: string; dave: string };
}

/** Alex is the visitor; the others are demo players. Same rules as the live bot. */
export function trySeat(alex: SeekerInput, opts: TryOptions = {}, actions: TryAction[] = []): TryResult {
  const others = (opts.others ?? ["jordan", "priya", "riley"]).filter((id) => id in seekerTerms && id !== "alex");
  const board = new SeatBoard(court, people);
  board.setAuto("sam", true);
  if (opts.daveSubs !== false) board.setAuto("dave", true);
  for (const id of others) board.setAuto(id, true);
  board.draftMany([...others.map((id): [string, SeekerInput] => [id, seekerTerms[id].terms]), ["alex", alex]], true);
  // Dave said no: his agent answers no on his behalf in this replay.
  if (opts.daveSubs === false && board.stage === "asking") board.answerRotation("dave", false);
  for (const a of actions.slice(0, 8)) {
    try {
      board.confirm("alex", a.yes);
      if (opts.daveSubs === false && board.stage === "asking") board.answerRotation("dave", false);
    } catch {
      // An answer that no longer applies is ignored, as in the bot.
    }
  }
  const ann = board.announcement();
  return {
    view: board.view("alex"),
    announcement: ann,
    log: board.log,
    others: others.map((id) => ({ id, name: NAMES[id], says: seekerTerms[id].says })),
    group: groupSays,
  };
}
