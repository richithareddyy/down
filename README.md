# Open Seat

**Walk into campus life that's already happening.**

Groups on campus have empty seats: the pickup game that needs two more, the study table with open chairs, a mutual friend's dinner. The people who'd fill them stay home, because walking in alone is the hard part. With Open Seat, everyone tells their own agent their terms privately. The agents pair up newcomers, reshape the plan so it fits everyone, line up a sub, and ping each person once: your seat is ready.

> Four individual requests. None satisfiable alone. One arrangement that satisfies all four.

Built for the Cubbie Hackathon at DevHacks S3, Track 02 (agent-to-agent coordination), by Team Southside.

**[Live site](https://open-seat-asu.vercel.app) · [Add Open Seat to your Discord server](https://discord.com/oauth2/authorize?client_id=1563729007642677338&scope=bot&permissions=68608) · [Our demo server](https://discord.gg/f36rKZA5z)**

## How it works

![How Open Seat works: solo students and a group each tell their own agent their terms; the agents pair newcomers, reshape the game, privately ask the sub, and everyone confirms at once before names unlock](docs/architecture.svg)

The working demo is a pickup game at the Sun Devil Fitness Complex, because its rules are the strictest:

| Who | What they tell their own agent |
|---|---|
| **Court 2** (captain Sam) | "6 of us playing 3v3 till 2:30. We'd go 4v4 full court if exactly 2 more join." |
| **Alex** | "Beginner. Free 1:30 to 2:30. Won't go if I'm the only new one." |
| **Jordan** | "Down to hoop, but hard stop at 2:20 for chem lab." |
| **Dave** (on the sideline) | "Happy to sub in if someone has to leave." |

None of these works alone. One newcomer breaks 3v3, Alex won't go solo, and Jordan leaving early would leave 4v4 a player short. The agents:

1. **Pair up.** Alex's and Jordan's agents find each other, so neither is the only new one.
2. **Make a conditional offer.** "2 players for 4v4, one leaves at 2:20." No names, levels or reasons.
3. **Reshape the plan.** 3v3 half court becomes 4v4 full court at 1:35.
4. **Ask only the person affected.** Dave is asked privately to rotate in at 2:20. If he says no, the agents reshape it differently: start at 1:45 with Priya, who's free after class.
5. **Confirm at once.** Alex, Jordan and Sam each get one message with the complete arrangement. Names and the court unlock only after everyone says yes. Nobody ever sees a counteroffer or a failed search.

### Staged disclosure

| Level | What crosses between agents |
|---|---|
| L0, never | Your words, your level, that you're nervous, why you leave early |
| L1, anonymous | What you'd join and when you're free; a group's open seats |
| L2, conditional offer | "2 players for 4v4 at 1:35, one leaves at 2:20, needs a sub" |
| L3, after everyone confirms | Names and the place |

## Track 02 fit

| Requirement | How Open Seat meets it |
|---|---|
| Personal agents for different students | Every Discord user has their own agent in DMs; groups have a captain's agent and a sub's agent |
| Conflicting constraints | Exact seat counts ("needs exactly 2"), "not as the only newcomer", hard stops, arrival times, level and vibe |
| What agents share | Staged disclosure (L1 to L3 above); never words or reasons |
| When agents ask their students | Before terms count, the sub before rotating, and everyone once, on the complete arrangement |
| Shared outcome | A seated game, announced in the group's channel |

## Use it on Discord

Open Seat isn't limited to our server. **[Add it to any server](https://discord.com/oauth2/authorize?client_id=1563729007642677338&scope=bot&permissions=68608)**: a club, a dorm, a friend group, a class. Then everyone just talks to their own agent.

- **Post open seats:** mention the bot in a channel. Mention a friend and they become the sub.
  > @Open Seat 6 of us on court 2 playing 3v3 till 2:30, we'd go 4v4 if exactly 2 more join, beginners welcome. @dave can sub
- **Join privately:** DM the bot your terms. Your agent is matched against open seats in every server you share with it.
  > basketball, beginner, free till 2:30, not if i'm the only new one
- **Try it alone:** type `@Open Seat demo` in a channel. It adds a demo game and two labeled demo students.
- Many groups and many servers can run at once, and a student is held by only one arrangement at a time. Captains can close a post with `@Open Seat done`.

Claude reads every post and DM into structured terms, with a rule-based reader if the model is unavailable. Plain code decides every arrangement; the model never does. Times are campus time (America/Phoenix).

## Getting started

Requires Node.js 22 or later.

```sh
npm ci
cp .env.example .env.local   # add ANTHROPIC_API_KEY and DISCORD_BOT_TOKEN
npm run dev
```

- **Website:** http://localhost:3000. In "want in? you're alex", type your terms (Claude reads them) or use the controls, then take your seat. The what-ifs show the agents reshaping the game.
- **Bot:** it starts with the app when `DISCORD_BOT_TOKEN` is set. It needs the Guilds, Guild Messages and Direct Messages intents, and no privileged intents.

## Testing

```sh
npm test
npm run typecheck
```

31 tests cover:
- the engine (seat counts, "not alone", hard stops, rotations, restructuring)
- the board (who sees what, when names unlock)
- many groups across servers, with a student held by one arrangement at a time
- the Discord DM and post flows, and the demo command
- both readers, model and fallback paths

## Project structure

- `src/seat/engine.ts`: each agent's private judgment, and the search for an arrangement that fills a version exactly.
- `src/seat/board.ts`: one group's round: the sub's private ask, everyone's confirmation, staged disclosure.
- `src/seat/hub.ts`: every open group in every server, and each student's terms.
- `src/seat/post.ts`: turning a group's post into an open group, and campus time.
- `src/agents/language.ts`: Claude readers for students' terms and groups' posts, with rule-based fallbacks.
- `src/channels/`: the DM and post conversation, and the Discord bridge.
- `app/api/try` and `public/site/`: the website and its live demo.

## Tech stack

Next.js 16 and TypeScript · discord.js · Claude (`claude-opus-5-5`) through the Anthropic SDK, with strict JSON output · Vercel for the website · Vitest.

## Privacy model

This is a prototype's privacy model, not a security guarantee. Our server sees the agents' messages. Names unlock only for the people in the arrangement, after everyone confirms. A captain learns that someone leaves at 2:20, never why. State is kept in memory, and the demo's people are fictional.

## Team

Team Southside: **Charith Kutikuppala** and **Richitha Rekula**.

## License

[MIT](LICENSE)
