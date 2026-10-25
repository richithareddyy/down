// Discord DMs as the messaging surface: each person DMs the bot and talks to their own agent.
// Runs inside the Next.js server process (see instrumentation.ts).
import { ChannelType, Client, Events, GatewayIntentBits, Partials, type Guild, type Message, type TextChannel } from "discord.js";
import { students } from "../demo/seed";
import { getPlanRuntime } from "../server/plan-runtime";
import { eventCard, HELP_TEXT, noteFor, planLine, respond, viewKey } from "./conversation";
import { planFromEvents } from "./discord-plan";

type Bridge = {
  client: Client;
  links: Map<string, string>; // discord user id -> demo seat
  lastKey: Map<string, string>; // demo seat -> last view key we reacted to
  queues: Map<string, Promise<void>>;
  announced: string | null; // the announcement already posted to the group channel
};

const store = globalThis as unknown as { downDiscord?: Bridge };

const NAMES = new Map(students.map((s) => [s.name.toLowerCase(), s.id]));
const CLAIM = /^(?:i'?m |im |i am |join |as )?(alex|maya|jay|dev)\b/i;
const LEAVE = /^(leave|switch|unlink|reset me)\b/i;

function owner(bridge: Bridge, seat: string) {
  for (const [user, id] of bridge.links) if (id === seat) return user;
  return null;
}

function freeNames(bridge: Bridge) {
  return students.filter((s) => !owner(bridge, s.id)).map((s) => s.name.toLowerCase());
}

async function send(bridge: Bridge, userId: string, lines: string[]) {
  if (!lines.length) return;
  const user = await bridge.client.users.fetch(userId);
  for (const line of lines) await user.send(line);
}

/** Serialize work per person so two quick DMs never race each other. */
function enqueue(bridge: Bridge, key: string, job: () => Promise<void>) {
  const next = (bridge.queues.get(key) ?? Promise.resolve()).then(job).catch((error) => {
    console.error("[down/discord]", error);
  });
  bridge.queues.set(key, next);
  return next;
}

async function onMessage(bridge: Bridge, msg: Message) {
  if (msg.author.bot || msg.channel.type !== ChannelType.DM) return;
  const userId = msg.author.id;
  const text = msg.content.trim();
  await enqueue(bridge, userId, async () => {
    const rt = getPlanRuntime();
    const seat = bridge.links.get(userId);
    if (!seat) {
      const claim = text.match(CLAIM)?.[1]?.toLowerCase();
      const id = claim ? NAMES.get(claim) : undefined;
      if (!id) {
        const free = freeNames(bridge);
        await send(bridge, userId, [free.length
          ? `hey! this is a demo friend group of four. who are you today?\nreply ${free.map((n) => `**${n}**`).join(", ")}. anyone you don't pick is played by a demo friend.`
          : "all four seats are taken right now. try again later."]);
        return;
      }
      if (owner(bridge, id)) {
        await send(bridge, userId, [`${claim} is taken. free: ${freeNames(bridge).join(", ") || "none"}.`]);
        return;
      }
      bridge.links.set(userId, id);
      rt.claim(id);
      bridge.lastKey.set(id, viewKey(rt.view(id)));
      await send(bridge, userId, [
        `**hey ${claim}.** i'm your agent. only i see what you tell me here.`,
        HELP_TEXT,
        `**your group's plan:** ${planLine(rt.view(id))}\neveryone said yes. how do you really feel about it?`,
      ]);
      return;
    }
    if (LEAVE.test(text)) {
      bridge.links.delete(userId);
      rt.release(seat);
      await send(bridge, userId, ["unlinked. reply a name to pick a seat again."]);
      return;
    }
    if ("sendTyping" in msg.channel) await msg.channel.sendTyping().catch(() => {});
    const replies = await respond(rt, seat, text);
    // Replies already include news from the student's own action; don't send it twice.
    bridge.lastKey.set(seat, viewKey(rt.view(seat)));
    await send(bridge, userId, replies);
  });
}

/** The group channel: DISCORD_GROUP_CHANNEL_ID, else #plans, else #general, else the first text channel. */
async function groupChannel(client: Client): Promise<TextChannel | null> {
  const wanted = process.env.DISCORD_GROUP_CHANNEL_ID;
  if (wanted) {
    const ch = await client.channels.fetch(wanted).catch(() => null);
    return ch && ch.type === ChannelType.GuildText ? (ch as TextChannel) : null;
  }
  for (const guild of (await client.guilds.fetch()).values()) {
    const full = await guild.fetch();
    const channels = [...(await full.channels.fetch()).values()].filter((c): c is TextChannel => !!c && c.type === ChannelType.GuildText);
    const pick = channels.find((c) => c.name === "plans") ?? channels.find((c) => c.name === "general") ?? channels[0];
    if (pick) return pick;
  }
  return null;
}

/** Once a version is announced, the group hears it in its channel. No names, no counts, no reasons. */
async function announceToGroup(bridge: Bridge) {
  const rt = getPlanRuntime();
  const a = rt.board.announcement();
  if (!a) return;
  const key = `${rt.board.plan.id}:${a.option.id}:${a.size}`;
  if (bridge.announced === key) return;
  bridge.announced = key;
  const channel = await groupChannel(bridge.client);
  if (!channel) {
    console.error("[down/discord] no text channel to post the new version in");
    return;
  }
  const plan = planLine(rt.view(rt.board.plan.memberIds[0]));
  const bot = bridge.client.user?.username ?? "down?";
  await channel.send(a.everyone
    ? `✳ **new version of the plan: all of you are down**\ninstead of ${plan}:\n${eventCard(a.option)}\neveryone said yes privately. nobody had to go first, and nobody's limits were shared.`
    : `✳ **${a.words} are doing something else this time**\ninstead of ${plan}:\n${eventCard(a.option)}\nthe original plan still stands for anyone who wants it. DM **@${bot}** and say **in** to join.`);
}

/** When the plan changes, each linked student's agent tells them what's new for them. */
function notifyAll(bridge: Bridge) {
  const rt = getPlanRuntime();
  void enqueue(bridge, "group-channel", () => announceToGroup(bridge));
  for (const [userId, seat] of bridge.links) {
    void enqueue(bridge, userId, async () => {
      const view = rt.view(seat);
      const key = viewKey(view);
      if (bridge.lastKey.get(seat) === key) return;
      bridge.lastKey.set(seat, key);
      const note = noteFor(view);
      if (note) await send(bridge, userId, [note]);
    });
  }
}

/** Read the group's plan from the server's scheduled events, if there are any. */
async function loadPlan(guild: Guild) {
  const events = await guild.scheduledEvents.fetch().catch((error) => {
    console.error("[down/discord] couldn't read server events:", error.message);
    return null;
  });
  if (!events) return;
  const found = planFromEvents([...events.values()].map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    start: e.scheduledStartAt ?? new Date(),
    end: e.scheduledEndAt,
    location: e.entityMetadata?.location ?? null,
  })));
  if (!found) {
    console.log("[down/discord] no server events; using the demo plan.");
    return;
  }
  if (!found.versions.length) {
    console.log(`[down/discord] plan "${found.plan.title}" has no priced versions to try (skipped: ${found.skipped.join(", ") || "none"}); using the demo plan.`);
    return;
  }
  getPlanRuntime().usePlan(found.plan, found.versions);
  console.log(`[down/discord] plan from server events: "${found.plan.title}" with ${found.versions.length} versions${found.skipped.length ? `; skipped (no price): ${found.skipped.join(", ")}` : ""}.`);
}

export function startDiscord() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.log("[down/discord] DISCORD_BOT_TOKEN not set; Discord bridge is off.");
    return;
  }
  if (store.downDiscord) return; // already running (dev reloads)
  const client = new Client({
    intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.Guilds, GatewayIntentBits.GuildScheduledEvents],
    partials: [Partials.Channel], // DM channels arrive uncached
  });
  const bridge: Bridge = { client, links: new Map(), lastKey: new Map(), queues: new Map(), announced: null };
  store.downDiscord = bridge;

  let pending: ReturnType<typeof setTimeout> | null = null;
  getPlanRuntime().subscribe(() => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; notifyAll(bridge); }, 150);
  });

  client.on(Events.MessageCreate, (msg) => void onMessage(bridge, msg));
  client.once(Events.ClientReady, async (c) => {
    console.log(`[down/discord] ready as ${c.user.tag}. DM the bot to start.`);
    const guild = (await c.guilds.fetch()).first();
    if (guild) await loadPlan(await guild.fetch());
  });
  client.login(token).catch((error) => {
    console.error("[down/discord] login failed:", error.message);
    store.downDiscord = undefined;
  });
}
