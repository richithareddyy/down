// Open Seat on Discord. Add the bot to any server. Groups mention it in a channel to post open
// seats; anyone DMs it their terms, privately. Each person's DM thread is their own agent.
// Runs inside the Next.js server process (see instrumentation.ts).
import { ChannelType, Client, Events, GatewayIntentBits, PermissionFlagsBits, Partials, type Guild, type Message, type TextChannel } from "discord.js";
import { RequestLanguage } from "../agents/language";
import { isDemo } from "../seat/demo";
import { Hub } from "../seat/hub";
import { campusNow } from "../seat/post";
import { clock } from "../seat/runtime";
import { handlePost, noteFor, respondDM, viewKey } from "./conversation";

type Bridge = {
  client: Client;
  hub: Hub;
  /** Real people we've talked to, so we can message them when something changes. */
  users: Set<string>;
  /** `${user}:${group}` -> the last view we reacted to. */
  lastKey: Map<string, string>;
  queues: Map<string, Promise<void>>;
  announced: Set<string>;
  guildCache: Map<string, { at: number; ids: string[] }>;
};

const store = globalThis as unknown as { openSeatDiscord?: Bridge; openSeatHub?: Hub };
export const getHub = () => (store.openSeatHub ??= new Hub());

const language = () => new RequestLanguage();

const told = new Set<string>();

/** DM someone. If their DMs are closed, say so once in a channel where they're part of a group. */
async function send(bridge: Bridge, userId: string, lines: string[]) {
  if (!lines.length || isDemo(userId)) return;
  try {
    const user = await bridge.client.users.fetch(userId);
    for (const line of lines) await user.send(line);
  } catch (error) {
    console.error("[open-seat/discord] couldn't DM", userId, (error as Error).message);
    if (told.has(userId)) return;
    const where = bridge.hub.views(userId)[0]?.record.channelId;
    const channel = where ? await bridge.client.channels.fetch(where).catch(() => null) : null;
    if (channel && channel.type === ChannelType.GuildText) {
      told.add(userId);
      await (channel as TextChannel).send(`<@${userId}> i couldn't DM you. turn on DMs from server members (server menu → privacy settings) so your agent can reach you.`).catch(() => {});
    }
  }
}

const WELCOME = [
  "✳ **open seat is here.** it helps people join groups that are already happening, without the awkward ask.",
  "**got open seats?** mention me in any channel:",
  "> @Open Seat 6 of us at court 2 playing 3v3 till 2:30, 4v4 if 2 more join. @friend can sub",
  "**want in on something?** DM me your terms, privately:",
  "> basketball, beginner, free till 2:30, not if i'm the only new one",
  "i only read messages that mention me, and DMs. trying it alone? type **@Open Seat demo**.",
].join("\n");

/** When added to a server, say hello where people can see it. */
async function welcome(guild: Guild) {
  const me = guild.members.me;
  const channels = [guild.systemChannel, ...(await guild.channels.fetch()).values()].filter(
    (c): c is TextChannel => !!c && c.type === ChannelType.GuildText && !!me && c.permissionsFor(me).has(PermissionFlagsBits.SendMessages),
  );
  await channels[0]?.send(WELCOME).catch(() => {});
}

/** Serialize work per person so two quick messages never race each other. */
function enqueue(bridge: Bridge, key: string, job: () => Promise<void>) {
  const next = (bridge.queues.get(key) ?? Promise.resolve()).then(job).catch((error) => {
    console.error("[open-seat/discord]", error);
  });
  bridge.queues.set(key, next);
  return next;
}

/** The servers this person shares with the bot (cached for a few minutes). */
async function sharedGuilds(bridge: Bridge, userId: string): Promise<string[]> {
  const hit = bridge.guildCache.get(userId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.ids;
  const ids: string[] = [];
  for (const guild of bridge.client.guilds.cache.values()) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) ids.push(guild.id);
  }
  bridge.guildCache.set(userId, { at: Date.now(), ids });
  return ids;
}

function remember(bridge: Bridge, userId: string) {
  bridge.users.add(userId);
  for (const { record, view } of bridge.hub.views(userId)) bridge.lastKey.set(`${userId}:${record.group.id}`, viewKey([{ record, view }]));
}

async function onDM(bridge: Bridge, msg: Message) {
  const userId = msg.author.id;
  await enqueue(bridge, userId, async () => {
    const hub = bridge.hub;
    hub.setName(userId, msg.author.displayName ?? msg.author.username);
    const now = campusNow();
    hub.sweep(now);
    if ("sendTyping" in msg.channel) await msg.channel.sendTyping().catch(() => {});
    const guilds = await sharedGuilds(bridge, userId);
    const replies = await respondDM(hub, { userId, guilds, now, parse: (t, a, n) => language().parseSeeker(t, a, n) }, msg.content);
    // Replies already include news from the person's own message; don't send it twice.
    remember(bridge, userId);
    await send(bridge, userId, replies);
  });
}

async function onMention(bridge: Bridge, msg: Message) {
  const bot = bridge.client.user!;
  await enqueue(bridge, `channel:${msg.channelId}`, async () => {
    const hub = bridge.hub;
    const others = [...msg.mentions.users.values()].filter((u) => u.id !== bot.id && u.id !== msg.author.id && !u.bot);
    // Mentions arrive as <@id>; the reader sees names instead.
    let text = msg.content.replace(new RegExp(`<@!?${bot.id}>`, "g"), "").trim();
    for (const u of others) text = text.replace(new RegExp(`<@!?${u.id}>`, "g"), `@${u.displayName ?? u.username}`);
    const now = campusNow();
    hub.sweep(now);
    const reply = await handlePost(hub, {
      authorId: msg.author.id,
      authorName: msg.member?.displayName ?? msg.author.displayName ?? msg.author.username,
      guildId: msg.guildId!,
      channelId: msg.channelId,
      mentions: others.map((u) => ({ id: u.id, name: u.displayName ?? u.username })),
      now,
      parse: (t, n) => language().parseGroup(t, n),
    }, text);
    bridge.users.add(msg.author.id);
    for (const u of others) bridge.users.add(u.id);
    await msg.reply(reply);
  });
}

/** Once everyone confirms, the group's channel hears it. Names went only to the people in the game. */
async function announce(bridge: Bridge) {
  for (const record of bridge.hub.groups.values()) {
    const a = record.board.announcement();
    if (!a || bridge.announced.has(record.group.id)) continue;
    bridge.announced.add(record.group.id);
    const channel = await bridge.client.channels.fetch(record.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    const g = record.group;
    await (channel as TextChannel).send(`✳ **open seat filled**\n${g.title} at ${g.place}: ${g.now} → **${a.version.label}** from ${clock(a.version.start)}.\n${a.newcomers} newcomer${a.newcomers === 1 ? "" : "s"} joined${a.rotation ? `, with a rotation at ${clock(a.rotation.at)}` : ""}. nobody had to walk up and ask.`);
  }
}

/** When anything changes, each person's agent tells them what's new for them, once. */
function notifyAll(bridge: Bridge) {
  void enqueue(bridge, "announcements", () => announce(bridge));
  for (const userId of bridge.users) {
    void enqueue(bridge, userId, async () => {
      for (const { record, view } of bridge.hub.views(userId)) {
        const k = `${userId}:${record.group.id}`;
        const key = viewKey([{ record, view }]);
        if (bridge.lastKey.get(k) === key) continue;
        bridge.lastKey.set(k, key);
        const note = noteFor(view);
        if (note) await send(bridge, userId, [note]);
      }
    });
  }
}

export function startDiscord() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.log("[open-seat/discord] DISCORD_BOT_TOKEN not set; Discord bridge is off.");
    return;
  }
  if (store.openSeatDiscord) return; // already running (dev reloads)
  const client = new Client({
    // Message content arrives for DMs and for messages that mention the bot, without the privileged intent.
    intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel], // DM channels arrive uncached
  });
  const bridge: Bridge = { client, hub: getHub(), users: new Set(), lastKey: new Map(), queues: new Map(), announced: new Set(), guildCache: new Map() };
  store.openSeatDiscord = bridge;

  let pending: ReturnType<typeof setTimeout> | null = null;
  bridge.hub.subscribe(() => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; notifyAll(bridge); }, 150);
  });

  client.on(Events.GuildCreate, (guild) => void welcome(guild));
  // Every minute: drop finished games, refresh start times, expire unanswered asks.
  setInterval(() => bridge.hub.sweep(campusNow()), 60_000).unref?.();

  client.on(Events.MessageCreate, (msg) => {
    if (msg.author.bot) return;
    if (msg.channel.type === ChannelType.DM) void onDM(bridge, msg);
    else if (client.user && msg.mentions.users.has(client.user.id)) void onMention(bridge, msg);
  });
  client.once(Events.ClientReady, (c) => console.log(`[open-seat/discord] ready as ${c.user.tag} in ${c.guilds.cache.size} server(s). mention it in a channel to post open seats; DM it to join.`));
  client.login(token).catch((error) => {
    console.error("[open-seat/discord] login failed:", error.message);
    store.openSeatDiscord = undefined;
  });
}
