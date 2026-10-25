// What a student's DM means, and what their agent says back. No Discord code here, so it can be
// tested on its own. Every decision goes through the plan board's rules.
import type { CampusEvent } from "../domain/types";
import type { PlanView } from "../quorum/board";
import { clock, planLabel, type PlanRuntime } from "../server/plan-runtime";

export { clock };

const YES = /^(y|yes|yeah|yep|yup|ya|sure|ok|okay|down|i'?m down|approve|go|let'?s go|do it|sounds good|bet|fine)\b/i;
const NO = /^(n|no|nah|nope|pass|not now|no thanks|can'?t)\b/i;
const HELP = /^(help|\?|what can you do|how does this work)\b/i;
const STATUS = /^(status|where are we|what'?s up|any updates?)\b/i;
const JOIN = /^(in|i'?m in|join|count me in|yes|y|yeah|yep|down|bet)\b/i;
const NEVER_MIND = /^(never ?mind|forget it|scratch that|actually i'?m good|cancel)\b/i;

const DAYS: Record<string, string> = { mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat", sun: "sun" };

export function planLine(v: PlanView): string {
  return `**${v.plan.title}** (${DAYS[v.plan.day] ?? v.plan.day} ${clock(v.plan.start)}${v.plan.price != null ? ` · $${v.plan.price}` : ""})`;
}

/** A version of the plan as a quoted card, so it stands out in a Discord DM. */
export function eventCard(e: CampusEvent): string {
  const lines = [`> **${e.title}**`, `> ${DAYS[e.day] ?? e.day} · ${clock(e.start)}–${clock(e.end)} · ${e.price ? `$${e.price} each` : "free"}`];
  if (e.location) lines.push(`> ${e.location.toLowerCase()}`);
  return lines.join("\n");
}

/** A student's own terms, read back so they can check them. */
export function describeTerms(v: PlanView): string {
  const t = v.terms!;
  const c = t.conditions;
  const what = c.activityTags.includes("any") ? "anything" : c.activityTags.join(" or ");
  const limits = [c.maxPrice != null ? `$${c.maxPrice} max` : null, c.endsBefore ? `home by ${clock(c.endsBefore)}` : null].filter(Boolean);
  const lines = [
    `• **the plan:** ${t.wantsChange ? "you'd rather it change" : "you're happy with it"}`,
    `• **you could do:** ${[what, ...limits].join(" · ")}`,
  ];
  if (t.avoidTags.length) lines.push(`• **not:** ${t.avoidTags.join(", ")}`);
  if (t.wantsChange) {
    const only = [t.minOthers > 0 ? `at least ${t.minOthers} other${t.minOthers === 1 ? "" : "s"} want a change too` : null, t.majorityOnly ? "most of the group does" : null].filter(Boolean);
    lines.push(`• **only if:** ${only.length ? only.join(" and ") : "anyone else wants a change too"}`);
  }
  return lines.join("\n");
}

function stretchWords(v: PlanView): string {
  const s = v.stretch!;
  return s.field === "maxPrice" ? `**$${s.to} instead of $${s.from}**` : `**staying till ${clock(v.option!.end)}** instead of being home by ${clock(String(s.from))}`;
}

export const HELP_TEXT = [
  "**how this works**",
  "1. tell me how you really feel about the group's plan, in your own words:",
  "> honestly $40 is a lot. under $15, home by 11, only if 2 others feel the same",
  "2. your friends' agents and i try versions of the plan against everyone's terms. only yes / no / could-stretch answers leave me.",
  "3. if a version works for everyone, each of you says yes privately. nobody learns who wanted a change, or anyone's limits.",
  "",
  "anytime: **status** · **never mind**",
].join("\n");

/** The part of a view that decides which notification a student should get. */
export function viewKey(v: PlanView): string {
  return [v.stage, v.option?.id ?? "-", v.stretch?.field ?? "-", v.ownJoined ? "joined" : "-"].join("|");
}

/** What a student's agent tells them on its own when their part of the plan changes. */
export function noteFor(v: PlanView): string | null {
  const most = v.everyone ? "your whole group" : `${v.shareWords} (everyone whose terms fit)`;
  switch (v.stage) {
    case "stretch":
      return `✳ **one small ask, just for you**\nyour friends' agents found a version of ${planLine(v)} that works for ${most}:\n${eventCard(v.option!)}\nit works if you can do ${stretchWords(v)}. ok?\nnobody will know it was you. reply **yes** or **no**.`;
    case "consent":
      return v.everyone
        ? `✳ **a version all of you can do**\nyour friends' agents compared terms privately and found a version of ${planLine(v)} that fits everyone:\n${eventCard(v.option!)}\nwould you switch to it? nobody learns who wanted a change, or anyone's limits.\nreply **yes** or **pass**.`
        : `✳ **a version ${v.shareWords} can do**\nno version fits everyone, but this one fits ${v.shareWords}, you included:\n${eventCard(v.option!)}\nthe original plan still stands for anyone who wants it. switch to this?\nreply **yes** or **pass**.`;
    case "announced":
      if (v.ownJoined)
        return `✳ **it's on**\n${eventCard(v.option!)}\nyou're in with: ${v.joined!.join(", ").toLowerCase()}.\nnobody heard who asked for it, or anyone's limits.`;
      return `✳ **new version in your group**\n${v.shareWords} are doing this instead of ${planLine(v)}:\n${eventCard(v.option!)}\nthe original plan still stands. reply **in** to join.`;
    case "closed":
      return "**no version worked this time.**\nthe original plan stands, and nobody learns why. your terms stay private.";
    default:
      return null;
  }
}

function statusText(v: PlanView, rt: PlanRuntime, id: string): string {
  const note = noteFor(v);
  if (note && v.stage !== "closed") return note;
  if (v.stage === "waiting") return `**you said yes.** waiting on the others' private answers for:\n${eventCard(v.option!)}`;
  if (v.terms && rt.board.hasDraft(id)) return `**kept between us (not locked in yet)**\n${describeTerms(v)}\n\nreply **yes** to lock it in.`;
  if (v.terms) return `**your agent has your terms**\n${describeTerms(v)}\n\nnothing happens unless a version works.`;
  return `**your group's plan:** ${planLine(v)}\n\nhow do you really feel about it? tell me privately.`;
}

/** Handle one DM and include any news the sender's own message caused. */
export async function respond(rt: PlanRuntime, id: string, raw: string): Promise<string[]> {
  const before = viewKey(rt.view(id));
  const replies = await handleMessage(rt, id, raw);
  const after = rt.view(id);
  if (viewKey(after) !== before) {
    const note = noteFor(after);
    if (note && !replies.includes(note)) replies.push(note);
  }
  return replies;
}

/** Handle one DM from a linked student. Returns the agent's replies, in order. */
export async function handleMessage(rt: PlanRuntime, id: string, raw: string): Promise<string[]> {
  const text = raw.trim();
  if (!text) return [];
  const v = rt.view(id);
  try {
    if (HELP.test(text)) return [HELP_TEXT];
    if (STATUS.test(text)) return [statusText(v, rt, id)];

    // A decision waiting on this student comes first.
    if (v.stage === "stretch") {
      if (YES.test(text)) {
        rt.board.answerStretch(id, true);
        return ["**got it.** nobody will know it was you."];
      }
      if (NO.test(text)) {
        rt.board.answerStretch(id, false);
        return ["**no problem, that limit stays.** nobody learns you were asked. the agents are trying other versions."];
      }
      return [`one question is waiting on you: could you do ${stretchWords(v)}? reply **yes** or **no**.`];
    }
    if (v.stage === "consent") {
      if (YES.test(text)) {
        rt.board.consent(id, true);
        return ["**counted.** when everyone in it says yes, i'll tell you."];
      }
      if (NO.test(text)) {
        rt.board.consent(id, false);
        return ["**passed.** the agents try the next version. nobody learns it was you."];
      }
      return ["a version is waiting on you. reply **yes** to switch to it, or **pass**."];
    }
    if (v.stage === "announced") {
      if (!v.ownJoined && JOIN.test(text)) {
        rt.board.join(id);
        return [];
      }
      return [statusText(v, rt, id)];
    }
    if (v.terms && NEVER_MIND.test(text)) {
      rt.board.withdraw(id);
      return ["**dropped.** your terms are gone, and nobody ever heard them."];
    }
    if (v.terms && rt.board.hasDraft(id)) {
      if (YES.test(text)) {
        rt.approve(id);
        return rt.view(id).stage === "none" ? ["**locked in.** i'll stay quiet unless a version works for everyone. say **never mind** anytime."] : [];
      }
      if (NO.test(text)) return ["ok. tell me what to change, in your own words."];
    }

    // Anything else is how they feel about the plan, read by the language model.
    const read = await rt.parser(text, planLabel(v.plan));
    if (read.kind === "clarify") return [read.question];
    rt.board.draft(id, read.terms);
    return [`**kept between us.**\n${describeTerms(rt.view(id))}\n\nonly yes/no answers ever leave me. reply **yes** to lock it in, or tell me what to change.`];
  } catch (error) {
    // Board rule messages are written for students; pass them on.
    if (error instanceof Error && /^(nothing to|not in this group)/.test(error.message)) return [error.message + "."];
    throw error;
  }
}
