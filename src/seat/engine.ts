// Open Seat: agents restructure an activity that's already happening so solo students can join it.
//
// A group's agent knows how the activity could change to take newcomers ("3v3 half court now,
// 4v4 full court if exactly 2 join") and whether someone on the sidelines could rotate in.
// Each solo student's agent knows its student's private terms: what they'd play, when they're free,
// when they must leave, their level, and whether they'd go as the only newcomer.
// No request is satisfiable alone. The agents look for a coalition of newcomers and a version of
// the activity that satisfies everyone at once, and only then ask anyone to confirm.

export type Level = "new" | "casual" | "competitive";

/** A way the group would restructure its activity. Preferred first. */
export interface Version {
  id: string;
  label: string; // "4v4 full court"
  start: string; // HH:MM, when the new format starts
  end: string;
  size: number; // players the new format needs in total
}

export interface OpenGroup {
  id: string;
  title: string; // "pickup basketball"
  place: string; // "Sun Devil Fitness Complex · Court 2"
  kind: string; // "basketball"
  vibe: "casual" | "competitive";
  beginnersWelcome: boolean;
  playing: number; // already playing now
  now: string; // the current format, "3v3 half court"
  captainId: string; // whose agent speaks for the group
  subId: string | null; // someone on the sidelines who could rotate in
  versions: Version[];
}

/** A solo student's private terms. Only their own agent holds these. */
export interface SeekerTerms {
  studentId: string;
  kinds: string[]; // ["basketball"] or ["any"]
  freeFrom: string; // HH:MM
  freeUntil: string; // hard stop, HH:MM
  level: Level;
  /** "I won't go if I'm the only new one." */
  notAlone: boolean;
  approved: boolean;
  updatedAt: string;
}

export interface Bundle {
  groupId: string;
  version: Version;
  seekerIds: string[];
  /** Someone has to leave early, so the sub rotates in then. */
  rotation: { leaverId: string; at: string } | null;
}

/** What crossed between agents, at which disclosure level. Never words, levels or reasons. */
export interface ProtocolRow {
  level: 1 | 2 | 3;
  from: string;
  to: string;
  text: string;
  ok: boolean;
}

export type Fit = { ok: true; leavesEarly: boolean } | { ok: false; why: "kind" | "level" | "late" | "window" };

/** One seeker's agent, judging one version privately. Only ok / not-ok leaves it. */
export function fits(t: SeekerTerms, g: OpenGroup, v: Version): Fit {
  if (!t.kinds.includes("any") && !t.kinds.includes(g.kind)) return { ok: false, why: "kind" };
  if (t.level === "new" && !g.beginnersWelcome) return { ok: false, why: "level" };
  if (t.level === "competitive" && g.vibe !== "competitive") return { ok: false, why: "level" };
  if (t.freeFrom > v.start) return { ok: false, why: "late" };
  // Must be able to play at least half the game to be worth a seat.
  const mins = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  const playable = Math.min(mins(t.freeUntil), mins(v.end)) - mins(v.start);
  if (playable < (mins(v.end) - mins(v.start)) / 2) return { ok: false, why: "window" };
  return { ok: true, leavesEarly: t.freeUntil < v.end };
}

function combos<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combos(rest, k - 1).map((c) => [first, ...c]), ...combos(rest, k)];
}

export interface SearchState {
  /** Seekers who passed on this group this round. */
  excluded?: Set<string>;
  /** Versions the captain passed on. */
  versionsPassed?: Set<string>;
  /** The sub said no to rotating in. */
  rotationDeclined?: boolean;
}

/**
 * Find the arrangement: the group's most preferred version that some coalition of newcomers can
 * fill exactly, with every seeker's terms holding. Among coalitions for that version, prefer one
 * that needs no rotation, then the students who asked first.
 */
export function arrange(g: OpenGroup, seekers: SeekerTerms[], s: SearchState = {}, log: ProtocolRow[] = []): Bundle | null {
  const pool = seekers.filter((t) => t.approved && !s.excluded?.has(t.studentId));
  for (const t of pool)
    log.push({ level: 1, from: `${agentOf(t.studentId)} (anonymous)`, to: "network", text: `looking for: ${t.kinds.join(", ")} · ${hm(t.freeFrom)}–${hm(t.freeUntil)}`, ok: true });
  log.push({ level: 1, from: agentOf(g.captainId), to: "network", text: `${g.place}: ${g.now} now · open to ${g.versions.map((v) => `${v.label} at ${hm(v.start)}`).join(" or ")}`, ok: true });

  for (const v of g.versions) {
    if (s.versionsPassed?.has(v.id)) continue;
    const need = v.size - g.playing;
    if (need < 1) continue;
    const ok = pool.filter((t) => {
      const f = fits(t, g, v);
      return f.ok;
    });
    const found = combos(ok, need)
      .map((c) => {
        const early = c.filter((t) => (fits(t, g, v) as { ok: true; leavesEarly: boolean }).leavesEarly);
        return { c, early };
      })
      // "Not alone" needs at least one other newcomer in the same coalition.
      .filter(({ c }) => c.every((t) => !t.notAlone || c.length >= 2))
      // At most one early leaver, and only if someone can rotate in.
      .filter(({ early }) => early.length === 0 || (early.length === 1 && g.subId && !s.rotationDeclined))
      .sort((a, b) => a.early.length - b.early.length || order(a.c, pool) - order(b.c, pool));
    if (!found.length) {
      log.push({ level: 2, from: "agents", to: agentOf(g.captainId), text: `${v.label} at ${hm(v.start)}: no group of ${need} works for everyone`, ok: false });
      continue;
    }
    const best = found[0];
    const leaver = best.early[0];
    const bundle: Bundle = {
      groupId: g.id,
      version: v,
      seekerIds: best.c.map((t) => t.studentId),
      rotation: leaver ? { leaverId: leaver.studentId, at: leaver.freeUntil } : null,
    };
    if (best.c.length >= 2)
      log.push({ level: 2, from: best.c.map((t) => agentOf(t.studentId)).join(" + "), to: "each other", text: `pair up: ${best.c.length} newcomers together${leaver ? `, one hard exit at ${hm(leaver.freeUntil)}` : ""}`, ok: true });
    log.push({ level: 2, from: `${best.c.length} newcomers`, to: agentOf(g.captainId), text: `${best.c.length} players for ${v.label} at ${hm(v.start)}${leaver ? ` · one leaves at ${hm(leaver.freeUntil)}, needs a sub` : ""}`, ok: true });
    return bundle;
  }
  return null;
}

const agentOf = (id: string) => `${id}'s agent`;
/** 13:35 -> 1:35 pm, for the protocol log. */
export function hm(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
function order(c: SeekerTerms[], pool: SeekerTerms[]) {
  return c.reduce((n, t) => n + pool.indexOf(t), 0);
}
