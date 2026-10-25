# Open Seat

**Walk into campus life that's already happening.**

The pickup game needs two more. The study table has empty chairs. A mutual friend's dinner has open seats. You'd join, just not as the only new one, and not by walking up to strangers alone. Open Seat gives everyone a private agent. The agents pair up newcomers, reshape the plan so it fits everyone, and ping you once: your seat is ready.

**[Live site](https://open-seat-asu.vercel.app) · [Add to your Discord server](https://discord.com/oauth2/authorize?client_id=1563729007642677338&scope=bot&permissions=68608) · [Try it on our server](https://discord.gg/f36rKZA5z)**

DevHacks S3 · Cubbie Hackathon · Track 02, Agent-to-Agent Coordination · Team Southside

![How Open Seat works](docs/architecture.svg)

## One afternoon at the gym

Court 2 is playing 3v3 and would switch to 4v4 if exactly two more joined. Alex would play but is a beginner and won't go as the only new one. Jordan wants a game but has to leave at 2:20 for chem lab. Dave is on the sideline.

None of these requests works on its own. Together, the agents find the arrangement:

1. **Pair up.** Alex's and Jordan's agents find each other, so neither is the only new one.
2. **Reshape.** 3v3 half court becomes 4v4 full court at 1:35.
3. **Ask only who's affected.** Dave is privately asked to sub in at 2:20. If he says no, the game starts at 1:45 with another student instead.
4. **Confirm once.** Everyone gets the complete arrangement and says yes. Then names unlock.

Nobody walks up and asks. Nobody sees a counteroffer, a failed search, or anyone's reasons.

## Try it

- **On the website:** play Alex. Type your terms in your own words and take your seat.
- **On Discord:** add Open Seat to any server: a club, a dorm, a friend group, a class.
  - Groups post open seats by mentioning it: `@Open Seat 6 of us at court 2 playing 3v3 till 2:30, 4v4 if 2 more join. @dave can sub`
  - Anyone joins by DMing it their terms: `basketball, beginner, free till 2:30, not if i'm the only new one`
  - Trying it alone? Type `@Open Seat demo` in any channel.

## What's shared, and when

| | |
|---|---|
| **Never** | your words, your level, why you leave early, that you'd rather not go alone |
| **Anonymous** | what you'd join, and when you're free |
| **As an offer** | "2 players for 4v4 at 1:35, one leaves at 2:20" |
| **After everyone says yes** | names and the place |

## Track 02 fit

| Requirement | Open Seat |
|---|---|
| Agents for different students | Every person has their own agent in DMs, and so does each group |
| Conflicting constraints | Exact seat counts, "not as the only new one", hard stops, arrival times, skill level |
| What agents share | The staged levels above, never words or reasons |
| When students confirm | Before their terms count, the sub before rotating, and everyone once on the complete arrangement |
| Shared outcome | A filled seat, announced in the group's channel |

## Run it locally

```sh
npm ci
cp .env.example .env.local   # add ANTHROPIC_API_KEY and DISCORD_BOT_TOKEN
npm run dev                  # website on http://localhost:3000, and the Discord bot
npm test                     # 39 tests
```

Built with Next.js, TypeScript, discord.js and Claude. Claude reads each message into structured terms, and plain, tested code decides every arrangement.

## Team

Team Southside: **Charith Kutikuppala** and **Richitha Rekula**. [MIT license](LICENSE).
