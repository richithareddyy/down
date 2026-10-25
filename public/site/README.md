# Down? website

The public website for Open Seat, by Team Southside. Plain HTML, CSS and JavaScript: no build step, no keys, no login.

From the repository root:

```sh
python3 -m http.server 3001 --bind 127.0.0.1 --directory public/site
```

Open http://localhost:3001. The Next.js homepage also redirects here. To host it, publish this folder as static files. Fonts load from Google Fonts, with system fallbacks.

## What's on the page

- The idea in one line, an illustrated hero, the research behind the walk-up problem, and a scroll-driven walkthrough of one arrangement (two solo students, a game that needs exactly two more, a sub on the sideline).
- "Want in? You're Alex": type your terms (Claude reads them) or use the controls, and take your seat. The what-ifs show the agents reshaping the game. It calls `/api/try`, the same engine as the Discord bot, on a fresh board for each visitor.
- How to add the bot to any Discord server, and what to type.

All people in the demo are fictional. The page stores nothing.
