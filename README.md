<h1 align="center">Kokpit</h1>

<p align="center">
  A macOS desktop app for everything you do with <a href="https://claude.com/claude-code">Claude Code</a>.
</p>

<p align="center">
  <img src="build/icon.png" width="96" height="96" alt="Kokpit" />
</p>

Kokpit puts your Claude Code sessions, Jira tasks and pull requests in one window. See which session needs you, read what Claude did, answer it or start a new one, and edit your CLAUDE.md, skills, agents, commands, hooks, memory and MCP servers without opening a terminal. A menu bar panel shows the same state when the window is closed.

Built with Electron, React, TypeScript and the Claude Agent SDK. It uses your existing Claude Code login and settings.

![Kokpit overview](docs/screenshots/overview.png)

---

## Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Install](#install)
- [Development](#development)
- [Releasing](#releasing)
- [What it reads and writes](#what-it-reads-and-writes)

---

## Features

### Overview
- Sessions waiting for you at the top, with Allow and Open right in the row
- Sessions running now, with the step Claude is on
- Today's and last 7 days' cost, a cost-per-day chart, and your plan limits (5-hour session and weekly windows)
- Active Jira sprint and your pull requests at a glance

### Sessions
- Every Claude Code session on this Mac, read from your transcripts, filtered by state (needs you, running, error, done) and Jira task
- Jira and pull request chips on each row; hover one to see the task status or the PR's checks and reviews
- Unread dot on sessions that changed since you last looked
- Keyboard first: arrows to move, Enter to open, Y to allow, G W to jump to the next waiting session

### Session detail and chat
- The conversation as Claude Code shows it: your messages, Claude's answers, tool steps grouped and collapsible, slash command output
- A live "working" row while Claude runs, and a context meter, duration and cost in the header
- Continue the session from Kokpit with model and effort pickers; slash commands autocomplete
- Changes and Plan side panel: review the files Claude changed, edit or approve a plan, or attach it to a Jira task

### New session
- Pick a repository, an optional title and prompt, model and effort, then start (⌘N)
- Leave the prompt empty to open the session and write the first message there

### Jira tasks
- Your tasks in the active sprint, grouped by status, with linked sessions and pull requests
- Start a session for a task in one click

### Pull requests
- Your open pull requests and the ones waiting for your review
- CI checks (latest run per check) and reviews (approvals, changes requested) per PR

### Configure
- **CLAUDE.md**: edit the global and per-repo instructions
- **Skills, agents, commands**: create, edit and delete them, with frontmatter fields and a Markdown preview
- **Commands with arguments**: declare one or more arguments; Kokpit fills in `$ARGUMENTS` or `$0`, `$1`…
- **Hooks**: see and edit the hooks Claude Code runs
- **Memory**: browse and clean up Claude's memory files (⇧⌘M)
- **MCP servers**: global and per-project servers in one list

### Menu bar
- Plan usage and the number of sessions waiting, right in the menu bar
- A panel with waiting and running sessions; click one to open it in the main window

### Notifications
- macOS notifications when a session needs you, finishes or stops with an error
- When CI fails on your pull request, someone requests changes, or someone asks for your review
- Each event can be turned on or off; click a notification to jump to that session or PR

### Everywhere
- Search across sessions, skills, agents and rules (⌘K)
- Doctor: checks Claude Code, your login, git, node, python and connections, from the header or Settings
- Keep-awake toggle so your Mac doesn't sleep during long runs
- Light, dark or system theme
- Update check, with the update run in a terminal inside the app

---

## Screenshots

**Overview**: what needs you, what's running, usage and plan limits, sprint and pull requests.

![Overview](docs/screenshots/overview.png)

The same screen in dark mode.

![Overview, dark](docs/screenshots/overview-dark.png)

**Sessions**: every Claude Code session, filtered by state and Jira task.

![Sessions](docs/screenshots/sessions.png)

**Session detail**: the conversation, grouped tool steps, and the changes Claude made.

![Session detail](docs/screenshots/session.png)

**Plan review**: read or edit the plan, attach it to a Jira task, or approve and implement.

![Plan review](docs/screenshots/plan.png)

**New session**: repository, title, prompt, model and effort.

![New session](docs/screenshots/new-session.png)

**Search** across sessions, skills, agents and rules.

![Search](docs/screenshots/search.png)

**Jira tasks** in the active sprint, with linked sessions and pull requests.

![Jira tasks](docs/screenshots/jira.png)

**Pull requests** with CI checks and reviews.

![Pull requests](docs/screenshots/pull-requests.png)

**CLAUDE.md**: global and per-repo instructions.

![CLAUDE.md](docs/screenshots/claude-md.png)

**Skills**

![Skills](docs/screenshots/skills.png)

**Agents**

![Agents](docs/screenshots/agents.png)

**Commands**, with arguments.

![Commands](docs/screenshots/commands.png)

**Hooks**

![Hooks](docs/screenshots/hooks.png)

**Memory**

![Memory](docs/screenshots/memory.png)

**MCP servers**

![MCP servers](docs/screenshots/mcp.png)

**Connections**: GitHub and Jira accounts.

![Connections](docs/screenshots/connections.png)

**Menu bar panel**: plan usage, waiting and running sessions.

<p align="center">
  <img src="docs/screenshots/menu-bar.png" width="380" alt="Menu bar panel" />
</p>

**Settings**

| | |
|---|---|
| General ![General](docs/screenshots/settings-general.png) | Claude ![Claude](docs/screenshots/settings-claude.png) |
| Notifications ![Notifications](docs/screenshots/settings-notifications.png) | GitHub ![GitHub](docs/screenshots/settings-github.png) |
| Sessions ![Sessions](docs/screenshots/settings-sessions.png) | Doctor ![Doctor](docs/screenshots/settings-doctor.png) |
| About ![About](docs/screenshots/settings-about.png) | |

All screenshots use demo data.

---

## Install

### Homebrew (recommended)

```bash
brew update
brew install --cask imonursahin/tap/kokpit
```

Opens with no extra steps. The cask clears the quarantine flag on install.

To update later, use **Settings → About → Check for updates**, or run:

```bash
brew upgrade --cask kokpit
```

### Manual

Download the latest release from the [Releases](https://github.com/imonursahin/kokpit/releases) page and drag **Kokpit** into Applications. The app is unsigned, so the first launch needs **right-click → Open**, then confirm.

If macOS says **"Kokpit is damaged and can't be opened"**, Gatekeeper has quarantined the unsigned download. The app is fine. Clear the flag once, then open it:

```bash
xattr -cr /Applications/Kokpit.app
```

### Build from source

```bash
git clone https://github.com/imonursahin/kokpit.git && cd kokpit
npm install
npm run dist
```

This writes `dist/mac-arm64/Kokpit.app`, ad-hoc signed for this Mac. Drag it into Applications.

### Requirements

- macOS on Apple Silicon (arm64)
- A Claude Code login on this Mac. Claude Code ships inside the app; Settings → Claude can point Kokpit at another `claude` binary.
- To build from source: Node 20+ (arm64 build)

---

## Development

```bash
npm install      # install deps and set the dev app name
npm run dev      # start the app with hot reload
npm test         # unit tests (vitest)
npm run typecheck
npm run build    # build into out/
npm run dist     # build the .dmg and .zip into dist/
```

No API keys are needed to build or run. Jira and GitHub are connected from the Connections page.

---

## Releasing

Bump the version and push:

```bash
npm run ship 0.2.0
```

This bumps `package.json`, commits and pushes to `main`. The [Release workflow](.github/workflows/release.yml) then tests and builds the app, publishes the `.dmg` and `.zip` as a GitHub Release, and updates the cask in [imonursahin/homebrew-tap](https://github.com/imonursahin/homebrew-tap). Installed apps see the new version on their next update check.

The workflow needs one repository secret, `TAP_DEPLOY_KEY`: a deploy key with write access to the tap.

---

## What it reads and writes

- **Sessions**: `~/.claude/projects/**/*.jsonl`, read only. An index is cached in the app's data folder.
- **Skills, agents, commands, hooks, CLAUDE.md**: `~/.claude/` and the `.claude/` folder and `CLAUDE.md` of every repo your sessions worked in. Saving writes the file.
- **Kokpit's own assistant**: `~/Kokpit` (its CLAUDE.md, skills, agents and memory).
- **Jira and GitHub tokens**: encrypted with the macOS Keychain in the app's data folder. They never leave this Mac.
- **Plan usage**: read from your Claude Code login through the Claude Agent SDK.
