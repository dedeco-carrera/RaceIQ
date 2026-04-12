# Welcome to SpeedHQ

## How We Use Claude

Based on Snazzie's usage over the last 30 days:

Work Type Breakdown:
```
  Build Feature    ██████████░░░░░░░░░░  47%
  Debug & Fix      ██████░░░░░░░░░░░░░░  27%
  Analyze Data     ██░░░░░░░░░░░░░░░░░░  10%
  Improve Quality  ██░░░░░░░░░░░░░░░░░░   8%
  Plan & Design    █░░░░░░░░░░░░░░░░░░░   7%
```

Top Skills & Commands:
```
  /clear    ████████████████████  127x/month
  /model    ████░░░░░░░░░░░░░░░░   27x/month
  /login    █░░░░░░░░░░░░░░░░░░░    9x/month
  /usage    █░░░░░░░░░░░░░░░░░░░    7x/month
```

Top MCP Servers:
```
  context-mode  ████████████████████  692 calls
  context7      █░░░░░░░░░░░░░░░░░░░   12 calls
  github        █░░░░░░░░░░░░░░░░░░░   setup
```

## Your Setup Checklist

### Codebases
- [ ] raceiq — github.com/speedhq/raceiq

### MCP Servers to Activate
- [ ] **context-mode** — Keeps large tool outputs out of your context window (saves 60-90% of tokens on heavy sessions). Install via `claude plugin add context-mode` or check the plugin marketplace.
- [ ] **context7** — Fetches current library/framework documentation on demand (React, Hono, Drizzle, Three.js, etc.). Install via `claude plugin add context7` or the marketplace. Use it instead of web search for API questions.
- [ ] **GitHub skill** — Enables Claude to interact with GitHub (create PRs, check CI, read issues). Activate via `claude skill add github` or the skill marketplace.
- [ ] **typescript-lsp** — Gives Claude access to TypeScript language server diagnostics (type errors, unused imports, missing types). Enable in Claude Code settings under MCP servers.

### Skills to Know About
- `/clear` — Resets conversation context. Use liberally between tasks to keep Claude focused and cheap. Snazzie uses it ~4x per session.
- `/model` — Switch between Opus (deep reasoning) and Sonnet (fast iteration). Use Sonnet for quick fixes, Opus for architecture and complex debugging.
- `/compact` — Compresses conversation history when context gets long. Use it mid-session if you're hitting limits.

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
