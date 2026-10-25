// Turning a group's post into an open group, and campus time (ASU is America/Phoenix).
import { addMinutes, type GroupInput } from "../agents/language";
import type { OpenGroup } from "./engine";

export const ZONE = "America/Phoenix";

/** The current time on campus, HH:MM. */
export function campusNow(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  return `${parts.find((p) => p.type === "hour")!.value}:${parts.find((p) => p.type === "minute")!.value}`;
}

const roundUp5 = (t: string) => {
  const m = Number(t.slice(3));
  return addMinutes(t, (5 - (m % 5)) % 5);
};

let counter = 0;

/**
 * A group's post becomes two versions of the bigger format: starting in a few minutes, or ten
 * minutes later so people finishing a class can make it.
 */
export function groupFrom(input: GroupInput, captainId: string, subId: string | null, now: string): OpenGroup {
  const first = addMinutes(roundUp5(now), 5);
  const second = addMinutes(first, 10);
  const size = input.playing + input.seats;
  counter += 1;
  return {
    id: `g${Date.now().toString(36)}${counter}`,
    title: input.title,
    place: input.place,
    kind: input.kind,
    vibe: input.vibe,
    beginnersWelcome: input.beginnersWelcome,
    playing: input.playing,
    now: input.current,
    captainId,
    subId,
    versions: [first, second]
      .filter((start) => start < input.until)
      .map((start, i) => ({ id: `v${i + 1}`, label: input.next, start, end: input.until, size })),
  };
}
