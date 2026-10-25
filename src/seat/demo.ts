// The demo: a pickup game already happening at the gym, and four students looking for a game.
// All people are fictional. Nothing is booked.
import type { OpenGroup } from "./engine";
import type { SeekerInput } from "./board";

export const NAMES: Record<string, string> = {
  alex: "Alex", jordan: "Jordan", priya: "Priya", riley: "Riley", sam: "Sam", dave: "Dave",
};
export const SEEKERS = ["alex", "jordan", "priya", "riley"] as const;
export const people = { name: (id: string) => NAMES[id] ?? id };

export const court: OpenGroup = {
  id: "sdfc-court-2",
  title: "pickup basketball",
  place: "Sun Devil Fitness Complex · Court 2",
  kind: "basketball",
  vibe: "casual",
  beginnersWelcome: true,
  playing: 6,
  now: "3v3 half court",
  captainId: "sam",
  subId: "dave",
  versions: [
    { id: "full-1335", label: "4v4 full court", start: "13:35", end: "14:30", size: 8 },
    { id: "full-1345", label: "4v4 full court", start: "13:45", end: "14:30", size: 8 },
  ],
};

/** What each demo student told their own agent, and how their agent reads it. */
export const seekerTerms: Record<string, { says: string; terms: SeekerInput }> = {
  alex: {
    says: "i want to play but i'm a beginner and i won't go if i'm the only new one. free 1:30 to 2:30.",
    terms: { kinds: ["basketball"], freeFrom: "13:30", freeUntil: "14:30", level: "new", notAlone: true },
  },
  jordan: {
    says: "down to hoop between classes, casual. hard stop at 2:20 for chem lab.",
    terms: { kinds: ["basketball"], freeFrom: "13:30", freeUntil: "14:20", level: "casual", notAlone: false },
  },
  priya: {
    says: "my class ends at 1:40, so i can play from 1:45 till 3. casual.",
    terms: { kinds: ["basketball"], freeFrom: "13:45", freeUntil: "15:00", level: "casual", notAlone: false },
  },
  riley: {
    says: "looking for a competitive run, 1:30 to 3.",
    terms: { kinds: ["basketball"], freeFrom: "13:30", freeUntil: "15:00", level: "competitive", notAlone: false },
  },
};

export const groupSays = {
  sam: "6 of us on court 2 playing 3v3 half court till 2:30. we'd go 4v4 full court if exactly 2 more join. beginners fine.",
  dave: "i'm on the sideline, happy to sub in if someone has to leave.",
};

// ---- demo players for a real server: the same scenario, moved to start now ----

import type { Hub } from "./hub";
import { addMinutes } from "../agents/language";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** "@open seat demo" in a server: a demo game starting now, plus two demo students looking. */
export function demoSetup(hub: Hub, guildId: string, channelId: string, now: string) {
  const delta = toMin(now) - toMin("13:30");
  const shift = (t: string) => addMinutes(t, delta);
  const tag = `demo-${guildId}`;
  const id = (name: string) => `${tag}:${name}`;
  // Two demo students: Jordan fits, Riley doesn't. Neither can fill the game alone, so it needs you.
  for (const name of ["sam", "dave", "jordan", "riley"]) hub.setName(id(name), `${NAMES[name]} (demo)`);
  for (const r of [...hub.groups.values()]) if (r.group.id === `${tag}:court`) hub.removeGroup(r.group.id);
  const group = {
    ...court,
    id: `${tag}:court`,
    captainId: id("sam"),
    subId: id("dave"),
    versions: court.versions.map((v) => ({ ...v, start: shift(v.start), end: shift(v.end) })),
  };
  const record = hub.addGroup(group, guildId, channelId, [id("sam"), id("dave")]);
  for (const name of ["jordan", "riley"]) {
    const t = seekerTerms[name].terms;
    hub.draftSeeker(id(name), { ...t, freeFrom: shift(t.freeFrom), freeUntil: shift(t.freeUntil) }, [guildId]);
    hub.approveSeeker(id(name), true);
  }
  return record;
}

export const isDemo = (id: string) => id.startsWith("demo-");
