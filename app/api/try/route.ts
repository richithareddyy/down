// The website's "try it" demo. Each request builds a fresh board (the visitor is Alex, the others
// are demo players), so visitors never share state. Same reader and rules as the Discord bot.
import { z } from "zod";
import { RequestLanguage } from "../../../src/agents/language";
import { court } from "../../../src/seat/demo";
import { activityLabel, trySeat } from "../../../src/seat/runtime";
import { sameOrigin } from "../../../src/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const terms = z
  .object({
    kinds: z.array(z.string().max(30)).min(1).max(5),
    freeFrom: time,
    freeUntil: time,
    level: z.enum(["new", "casual", "competitive"]),
    notAlone: z.boolean(),
  })
  .strict();
const options = z.object({ others: z.array(z.enum(["jordan", "priya", "riley"])).max(3).optional(), daveSubs: z.boolean().optional() }).strict();
const action = z.object({ type: z.literal("confirm"), yes: z.boolean() }).strict();
const body = z.union([
  z.object({ text: z.string().trim().min(1).max(280), options: options.optional() }).strict(),
  z.object({ terms, options: options.optional(), actions: z.array(action).max(8).default([]) }).strict(),
]);

// Reading words calls the language model; keep it to a few reads per visitor per minute.
const reads = new Map<string, number[]>();
function allowRead(key: string) {
  const now = Date.now();
  const recent = (reads.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 8) return false;
  recent.push(now);
  reads.set(key, recent);
  return true;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "cross-origin requests aren't allowed" }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "that request didn't look right" }, { status: 400 });
  const input = parsed.data;
  if ("text" in input) {
    const who = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!allowRead(who)) return Response.json({ error: "slow down a little. try again in a minute." }, { status: 429 });
    const read = await new RequestLanguage().parseSeeker(input.text, activityLabel(court));
    if (read.kind === "clarify") return Response.json({ clarify: read.question });
    return Response.json({ terms: read.terms, source: read.source, result: trySeat(read.terms, input.options) }, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ result: trySeat(input.terms, input.options, input.actions) }, { headers: { "Cache-Control": "no-store" } });
}
