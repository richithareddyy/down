// What a message means, and what the agent says back. No Discord code here, so it can be tested.
// DMs are a student's private line to their own agent. Mentions in a server channel post a
// group's open seats.
import type { GroupIntake, SeekerIntake } from "../agents/language";
import type { SeatView } from "../seat/board";
import type { Version } from "../seat/engine";
import type { Hub } from "../seat/hub";
import { demoSetup } from "../seat/demo";
import { groupFrom } from "../seat/post";
import { clock } from "../seat/runtime";

export { clock };

const YES = /^(y|yes|yeah|yep|yup|ya|sure|ok|okay|down|i'?m down|i'?m in|in|go|let'?s go|do it|sounds good|bet|fine)\b/i;
const NO = /^(n|no|nah|nope|pass|not now|no thanks|can'?t)\b/i;
const HELP = /^(help|\?|what can you do|how does this work)\b/i;
const STATUS = /^(status|where are we|what'?s up|any updates?|what'?s open)\b/i;
const NEVER_MIND = /^(never ?mind|forget it|scratch that|cancel|stop looking)\b/i;
const DEMO = /^demo\b/i;
const CLOSE = /^(close|done|we'?re (full|done)|cancel)\b/i;
const DROP = /^(i )?(can'?t make it|cant make it|can'?t go|not coming|drop out|something came up)\b/i;

const LEVEL: Record<string, string> = { new: "beginner", casual: "casual", competitive: "competitive" };
const versionLine = (v: Version) => `**${v.label}** from ${clock(v.start)} to ${clock(v.end)}`;

export function describeTerms(t: { kinds: string[]; freeFrom: string; freeUntil: string; level: string; notAlone: boolean }): string {
  return [
    `• **join:** ${t.kinds.includes("any") ? "anything" : t.kinds.join(" or ")} · ${LEVEL[t.level]}`,
    `• **free:** ${clock(t.freeFrom)} to ${clock(t.freeUntil)}, hard stop`,
    `• **only if:** ${t.notAlone ? "you're not the only new one" : "anything that fits"}`,
  ].join("\n");
}

export const HELP_TEXT = [
  "**how open seat works**",
  "**want in on something?** dm me your terms, privately:",
  "> basketball, beginner, free till 2:30, not if i'm the only new one",
  "**got open seats?** mention me in your server:",
  "> @open seat 6 of us at court 2 playing 3v3 till 2:30, 4v4 if 2 more join. @dave can sub",
  "agents pair newcomers, reshape the plan and line up subs. you only hear from me when a complete seat is ready. names unlock when everyone confirms.",
  "",
  "dm anytime: **status** · **never mind**. in a server: **@open seat demo** adds demo players to try it alone.",
].join("\n");

/** One key per person across all their groups, so we know when to message them. */
export function viewKey(views: { record: { group: { id: string } }; view: SeatView }[]): string {
  return views.map(({ record, view: v }) => [record.group.id, v.stage, v.version?.id ?? "-", v.newcomers ?? "-", v.rotation?.at ?? "-"].join("|")).sort().join(";");
}

/** What the agent says on its own when this person's part changes. Null means stay quiet. */
export function noteFor(v: SeatView): string | null {
  const r = v.rotation;
  switch (v.stage) {
    case "rotate":
      return `✳ **can you sub in?**\n${v.group.title} at ${v.group.place} can go ${versionLine(v.version!)} with newcomers. one of them has to leave at ${clock(r!.at)}.\nrotate in then so it stays ${v.version!.label}?\nreply **yes** or **no**. a no just sends the agents to another arrangement.`;
    case "confirm":
      if (v.role === "captain")
        return `✳ **${v.newcomers} newcomer${v.newcomers === 1 ? "" : "s"} can fill your seats**\nswitch from ${v.group.now} to ${versionLine(v.version!)}?${r ? `\none of them leaves at ${clock(r.at)}, and your sub already agreed to rotate in.` : ""}\nyou learn who they are when everyone confirms, never why. reply **yes** or **pass**.`;
      return `✳ **a seat is open for you**\n${v.group.title} at ${v.group.place}: ${versionLine(v.version!)}.\n${v.newcomers ? `you won't be the only new one: ${v.newcomers} other newcomer${v.newcomers === 1 ? "" : "s"} join${v.newcomers === 1 ? "s" : ""} with you.` : "you're the newcomer they need."}${r ? (r.you ? `\nyou can leave at ${clock(r.at)}: someone rotates in for you.` : `\none newcomer leaves at ${clock(r.at)} and a sub rotates in.`) : ""}\nnames unlock when everyone confirms. reply **yes** to take your seat, or **pass**.`;
    case "seated":
      return `✳ **you're in**\n${v.group.place} · ${versionLine(v.version!)}\nwith: ${v.names!.join(", ")}.${r ? `\nrotation at ${clock(r.at)}.` : ""}${v.role === "seeker" ? "\nsomething came up? say **can't make it** and your seat goes to someone else." : ""}`;
    case "closed":
      return v.role === "captain" ? "**no arrangement for your open seats right now.** i'll keep looking while your post is up." : null;
    default:
      return null;
  }
}

const ADD_LINK = "https://discord.com/oauth2/authorize?client_id=1563729007642677338&scope=bot&permissions=68608";
export const NO_SERVER = `we don't share a server yet, so there are no open seats i can see for you.\n• add me to your club, dorm or friend group's server: ${ADD_LINK}\n• or join ours: https://discord.gg/f36rKZA5z\nyour terms stay saved; i'll look as soon as we share a server.`;

/** Model reads per person per minute, so a flood of DMs can't burn through the model. */
const readsByHub = new WeakMap<Hub, Map<string, number[]>>();
function allowRead(hub: Hub, id: string, nowMs = Date.now()) {
  if (!readsByHub.has(hub)) readsByHub.set(hub, new Map());
  const reads = readsByHub.get(hub)!;
  const recent = (reads.get(id) ?? []).filter((t) => nowMs - t < 60_000);
  if (recent.length >= 6) return false;
  recent.push(nowMs);
  reads.set(id, recent);
  return true;
}

export interface DmContext {
  userId: string;
  /** Servers this person shares with the bot. */
  guilds: string[];
  now: string;
  parse: (text: string, activity: string, now: string) => Promise<SeekerIntake>;
}

function statusText(hub: Hub, ctx: DmContext): string {
  const views = hub.views(ctx.userId);
  for (const { view } of views) {
    const note = noteFor(view);
    if (note && view.stage !== "closed") return note;
    if (view.stage === "waiting") return "**you said yes.** waiting on the others. names unlock when everyone confirms.";
  }
  const own = views.find(({ view }) => view.role === "captain" || view.role === "sub");
  if (own) return `**your group:** ${own.record.group.title} at ${own.record.group.place}. i'll message you only when there's something to decide.`;
  const t = hub.terms(ctx.userId);
  if (t && !t.approved) return `**kept between us (not locked in yet)**\n${describeTerms(t.input)}\n\nreply **yes** to lock it in.`;
  if (t) return `**quietly looking**\n${describeTerms(t.input)}\n\nyou won't get counteroffers or failed searches. only a complete seat.`;
  if (!ctx.guilds.length) return NO_SERVER;
  const open = hub.openIn(ctx.guilds);
  return open.length
    ? `**open seats in your servers:**\n${open.map((r) => `• ${r.group.title} at ${r.group.place} (${r.group.now} now)`).join("\n")}\nwant in? tell me privately what you'd join and on what terms.`
    : "no open seats in your servers right now. tell me what you'd join, and i'll quietly look as groups post.";
}

/** Handle one DM and include any news the sender's own message caused. */
export async function respondDM(hub: Hub, ctx: DmContext, raw: string): Promise<string[]> {
  const before = new Map(hub.views(ctx.userId).map(({ record, view }) => [record.group.id, viewKey([{ record, view }])]));
  const replies = await handleDM(hub, ctx, raw);
  for (const entry of hub.views(ctx.userId)) {
    if (before.get(entry.record.group.id) === viewKey([entry])) continue;
    const note = noteFor(entry.view);
    if (note && !replies.includes(note)) replies.push(note);
  }
  return replies;
}

export async function handleDM(hub: Hub, ctx: DmContext, raw: string): Promise<string[]> {
  const text = raw.trim();
  if (!text) return [];
  const id = ctx.userId;
  try {
    if (HELP.test(text)) return [HELP_TEXT];
    if (STATUS.test(text)) return [statusText(hub, ctx)];

    const pending = hub.pending(id);
    if (pending) {
      const { record, view } = pending;
      const gid = record.group.id;
      if (view.stage === "rotate") {
        if (YES.test(text)) {
          hub.act(gid, (b) => b.answerRotation(id, true));
          return [`**got it.** you'll rotate in at ${clock(view.rotation!.at)} if everyone confirms.`];
        }
        if (NO.test(text)) {
          hub.act(gid, (b) => b.answerRotation(id, false));
          return ["**no problem.** the agents are trying another arrangement. nobody else hears your answer."];
        }
        return ["one question is waiting on you: rotate in? reply **yes** or **no**."];
      }
      if (YES.test(text)) {
        hub.act(gid, (b) => b.confirm(id, true));
        // The last yes seats everyone; the "you're in" note says it all.
        return hub.groups.get(gid)?.board.stage === "seated" ? [] : ["**confirmed.** names unlock when everyone says yes."];
      }
      if (NO.test(text)) {
        hub.act(gid, (b) => b.confirm(id, false));
        return ["**passed.** the agents look for another arrangement. nobody learns it was you."];
      }
      return ["a complete arrangement is waiting on you. reply **yes** or **pass**."];
    }

    const seated = hub.views(id).find(({ view }) => view.stage === "seated");
    if (seated && DROP.test(text)) {
      hub.act(seated.record.group.id, (b) => b.dropOut(id));
      return ["**got it, your seat is released.** the agents are re-arranging for the others. nobody is told why."];
    }
    const captainOf = hub.views(id).find(({ view }) => view.role === "captain");
    if (captainOf && CLOSE.test(text)) {
      hub.removeGroup(captainOf.record.group.id);
      return [`**closed** ${captainOf.record.group.title} at ${captainOf.record.group.place}. thanks for opening seats.`];
    }

    const t = hub.terms(id);
    if (t && NEVER_MIND.test(text)) {
      hub.withdrawSeeker(id);
      return ["**dropped.** your terms are gone, and nobody ever saw them."];
    }
    if (t && !t.approved) {
      if (YES.test(text)) {
        hub.approveSeeker(id);
        return hub.pending(id) || hub.views(id).some(({ view }) => view.stage === "waiting")
          ? []
          : ["**locked in.** i'll stay quiet until a complete seat is ready. no counteroffers, no failed searches. say **never mind** anytime."];
      }
      if (NO.test(text)) return ["ok. tell me what to change, in your own words."];
    }
    if (hub.views(id).some(({ view }) => view.role === "captain" || view.role === "sub" || view.stage === "seated")) return [statusText(hub, ctx)];

    const open = hub.openIn(ctx.guilds).map((r) => `${r.group.title} at ${r.group.place}`).join("; ") || "none yet";
    if (!allowRead(hub, id)) return ["give me a minute to catch up, then send that again."];
    const read = await ctx.parse(text, open, ctx.now);
    if (read.kind === "clarify") return [read.question];
    const { freeFrom, freeUntil } = read.terms;
    if (freeUntil <= ctx.now) return [`${clock(freeUntil)} has already passed today. when are you free, from now on?`];
    if (freeUntil <= freeFrom) return ["i can only plan within today for now. when are you free, and when do you have to leave?"];
    hub.draftSeeker(id, read.terms, ctx.guilds);
    return [`**kept between us.**\n${describeTerms(read.terms)}\n\nnone of this leaves me. reply **yes** to lock it in, or tell me what to change.${ctx.guilds.length ? "" : `\n\n${NO_SERVER}`}`];
  } catch (error) {
    if (error instanceof Error && /^(nothing to|you're already)/.test(error.message)) return [error.message + "."];
    throw error;
  }
}

export interface PostContext {
  authorId: string;
  authorName: string;
  guildId: string;
  channelId: string;
  /** Other people mentioned in the post (the first one is the sub). */
  mentions: { id: string; name: string }[];
  now: string;
  parse: (text: string, now: string) => Promise<GroupIntake>;
}

/** A mention of the bot in a server channel. Returns the bot's reply in that channel. */
export async function handlePost(hub: Hub, ctx: PostContext, raw: string): Promise<string> {
  const text = raw.trim();
  hub.setName(ctx.authorId, ctx.authorName);
  if (!text || HELP.test(text)) return HELP_TEXT;
  if (DEMO.test(text)) {
    const record = demoSetup(hub, ctx.guildId, ctx.channelId, ctx.now);
    return `✳ **demo players added.** ${record.group.title} at ${record.group.place} is playing ${record.group.now} and needs ${record.group.versions[0].size - record.group.playing} more. two demo students are looking too.\nDM me your terms to try it, for example "basketball, beginner, free for an hour, not if i'm the only new one".`;
  }
  const mine = [...hub.groups.values()].find((r) => r.group.captainId === ctx.authorId && r.guildId === ctx.guildId);
  if (mine && CLOSE.test(text)) {
    hub.removeGroup(mine.group.id);
    return `**closed** ${mine.group.title} at ${mine.group.place}. thanks for opening seats.`;
  }
  const read = await ctx.parse(text, ctx.now);
  if (read.kind === "clarify") return read.question;
  const sub = ctx.mentions[0] ?? null;
  if (sub) hub.setName(sub.id, sub.name);
  const group = groupFrom(read.group, ctx.authorId, sub?.id ?? null, ctx.now);
  if (!group.versions.length) return "that ends too soon for anyone to join. post it again with a later end time.";
  if (mine) hub.removeGroup(mine.group.id);
  hub.addGroup(group, ctx.guildId, ctx.channelId);
  const need = group.versions[0].size - group.playing;
  return `✳ **open seat:** ${group.title} at ${group.place}\n${group.now} now → ${group.versions[0].label} if exactly ${need} more join · till ${clock(group.versions[0].end)}${sub ? ` · ${sub.name} can sub` : ""}\nwant in? **DM me your terms, privately.** nobody sees who asked until everyone confirms.`;
}
