# Down? website

The public website for down?, by Team Southside. Plain HTML, CSS and JavaScript: no build step, no keys, no login.

From the repository root:

```sh
python3 -m http.server 3001 --bind 127.0.0.1 --directory public/site
```

Open http://localhost:3001. The Next.js homepage also redirects here. To host it, publish this folder as static files. Fonts load from Google Fonts, with system fallbacks.

## What's on the page

- The story: everyone said yes to the group's $40 club night, but most of them would change something. Each student tells only their own agent. The agents try versions of the plan against everyone's private terms, privately ask anyone who'd need to stretch a little, and the group hears the version everyone said yes to, with no names.
- An illustrated hero scene (inline SVG), the research behind it, and a scroll-driven walkthrough of one negotiation.
- "Okay, are you not down?": the visitor plays Alex. Served by the app, it calls `/api/try` (the prototype's engine, plus the language model for free text). Hosted as static files, `prototype.js` runs the same rules in the browser.
- The live section links the Discord demo server.

All people, events and prices are fictional. The page stores nothing.

## Tests

```sh
npm test -- tests/site-prototype.test.ts
```

Checks that the in-browser rules give the same result as the prototype's engine for every combination of Alex's terms and answers.
