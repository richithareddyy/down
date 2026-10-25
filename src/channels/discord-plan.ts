// The group's plan comes from where groups already make plans: the server's Discord events.
// The event marked "#plan" (or the soonest one) is the plan; the other events are versions the
// agents may try. A version needs a price in its description ("$12" or "free") so agents can judge it.
import { students } from "../demo/seed";
import type { CampusEvent, Day } from "../domain/types";
import type { GroupPlan } from "../quorum/engine";

export interface DiscordEventLike {
  id: string;
  name: string;
  description: string | null;
  start: Date;
  end: Date | null;
  location: string | null;
}

const ZONE = "America/Phoenix";
const TAGS: [RegExp, string][] = [
  [/\bclub|night ?club|party\b/i, "club"],
  [/\bdanc/i, "dance"],
  [/\bopen mic\b/i, "open mic"],
  [/\bmusic|concert|gig|karaoke|mic\b/i, "music"],
  [/\bgame|board ?game|trivia\b/i, "games"],
  [/\bfood|dinner|lunch|pizza|tacos?|boba|brunch|cafe|coffee\b/i, "food"],
  [/\bmovie|film|cinema\b/i, "movie"],
  [/\bhike|park|beach|outdoor|picnic\b/i, "outdoors"],
  [/\bclimb|bowling|basketball|soccer|gym|sport\b/i, "sports"],
];

function local(d: Date): { day: Day; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { day: get("weekday").toLowerCase().slice(0, 3) as Day, time: `${get("hour")}:${get("minute")}` };
}

export function priceOf(text: string | null): number | null {
  if (!text) return null;
  if (/\bfree\b/i.test(text)) return 0;
  const m = text.match(/\$\s?(\d{1,4}(?:\.\d{1,2})?)/);
  return m ? Number(m[1]) : null;
}

export function tagsOf(text: string): string[] {
  const tags = TAGS.filter(([re]) => re.test(text)).map(([, t]) => t);
  return tags.length ? [...new Set(tags)] : ["other"];
}

/** Turn the server's events into the group's plan and its versions. Null when there's nothing usable. */
export function planFromEvents(events: DiscordEventLike[]): { plan: GroupPlan; versions: CampusEvent[]; skipped: string[] } | null {
  if (!events.length) return null;
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const main = sorted.find((e) => /#plan\b/i.test(e.description ?? "")) ?? sorted[0];
  const when = (e: DiscordEventLike) => {
    const s = local(e.start);
    const end = local(e.end ?? new Date(e.start.getTime() + 3 * 3600_000));
    return { day: s.day, start: s.time, end: end.time };
  };
  const plan: GroupPlan = {
    id: `discord-${main.id}`,
    title: main.name.toLowerCase(),
    ...when(main),
    price: priceOf(main.description),
    location: main.location ?? undefined,
    circleId: "campus",
    memberIds: students.map((s) => s.id),
    source: "discord-event",
  };
  const versions: CampusEvent[] = [];
  const skipped: string[] = [];
  for (const e of sorted) {
    if (e === main) continue;
    const price = priceOf(e.description);
    const w = when(e);
    // Overnight versions would confuse "home by" limits; agents only try ones that end the same day.
    if (price == null || w.end <= w.start) {
      skipped.push(e.name);
      continue;
    }
    versions.push({
      id: `discord-${e.id}`,
      title: e.name.toLowerCase(),
      activityTags: tagsOf(`${e.name} ${e.description ?? ""}`),
      beginnerFriendly: true,
      ...w,
      price,
      location: e.location ?? undefined,
      timeZone: ZONE,
    });
  }
  return { plan, versions, skipped };
}
