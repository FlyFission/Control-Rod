# Pattern notes: onboarding

> **Provenance.** Written on 2026-11-23 from the install sections of 15 public READMEs (the repositories listed in `docs/research/user-demand-2026-11/README.md`) and from the titles of their public issues. Only README install sections and issue titles were read; no source code and no other documentation. Some of these projects are AGPL or source-available, so this file records ideas only, in our own words. Counts come from `docs/research/user-demand-2026-11/repos/onboarding_count.py`.

## Answer first

The best installs in this set follow one shape: **one command or one download, no account, find the agents already on the machine, and ask nothing else until the person needs it.** Control Rod today needs four tools (through mise), four commands, and a passkey before the first screen. The target below is one command, a confirmed list of agents, one question, and the board.

## What breaks onboarding, counted

Across 29,938 issues, 5,505 titles (18.4%) match an install, sign-in, agent-detection, prerequisite, permission or first-run keyword. Keyword matching over-counts ("token", "path" and "package" are noisy), so read the ranking rather than the totals.

| Theme | Issues | Reactions |
| --- | --- | --- |
| Sign-in, login, auth, API keys | 1,628 | 486 |
| Windows and WSL | 1,442 | 428 |
| Agent or CLI not detected | 1,427 | 297 |
| Install fails or install method | 1,066 | 472 |
| Prerequisites and dependencies | 913 | 376 |
| Permissions and OS security prompts | 764 | 243 |
| Docs unclear | 436 | 205 |
| First run, setup wizard, onboarding | 405 | 130 |

Named examples, by reactions: "Make login non-required" (Paradev, 23), "Why do I need to log in to use features such as Kanban?" (Vibe Kanban, 10), "Disable Onboarding - I want to use local-only Models" (Paperclip, 11), "Embedded PostgreSQL failed" (Paperclip, 13), "Agent detection misses nix-wrapped Claude Code" (herdr, 15), "Installation guide contains prompt injection" (oh-my-openagent, 10).

## How the 15 install today

| Pattern | Who does it | Our version |
| --- | --- | --- |
| One shell line per OS (`curl … \| sh`, PowerShell `irm … \| iex`), plus Homebrew | herdr, herdr-app, oh-my-openagent, agent-of-empires, claude-squad, Mistral Vibe, Multica | A prebuilt binary with the web app embedded and the database bundled, installed by one line per OS and by `brew` |
| A desktop download for every OS, with the daemon run for you | Orchestrator, emdash, Nimbalyst, Paradev (macOS first) | The desktop shell in the plan's craft track, later; the one-line install comes first |
| `npx <name>` with nothing else | Vibe Kanban, Paperclip (`onboard --yes`), Kandev | Offer it, but only as a launcher for the binary, as Kandev does, so Node is not a hard requirement |
| "That's the whole setup": run it in a project and describe the job | oh-my-openagent | First run opens on the Planner box in the current folder's repository |
| Detect installed agent CLIs automatically | emdash, Orchestrator, herdr | Find every supported CLI on PATH and its sign-in state; seat them by default |
| The only prerequisite is one agent CLI you are already signed in to | Multica, Paradev (plus Git) | Same, and say so in one line on the install page |
| Migrate from the tool you used before in one command | oh-my-openagent (`omo setup`) | An importer for Vibe Kanban boards (already in the plan) |
| Rerun the install line to update | oh-my-openagent | Same line updates; the in-app update panel also works |
| Hand the install guide to your agent | Paperclip | Only if the guide is plain commands. oh-my-openagent's guide drew a prompt-injection complaint |

Not adopted: install-time analytics (Nimbalyst sends an anonymous ID, opt-out), a required account (Paradev's remote access needs a Pro plan), and Docker as a requirement (Multica self-host).

## Control Rod's onboarding, step by step

1. **Install.** One line per OS, or `brew install`. No Node, Rust, Go or Python for users; the developer path in `getting-started.md` stays for contributors. Signed and notarized on macOS and signed on Windows, so no OS warning screens.
2. **Open.** The command starts everything and opens the browser. No account and no login.
3. **Find the agents, then confirm them with the person.** This is the one step that is never skipped, because seating depends on it. It uses three-way communication: the app states what it found, the person confirms or corrects it, and the app repeats the result back before it saves anything.
   - **State.** One short list, one row per agent: name, version, where it was found, and sign-in state (signed in, signed out, or unknown). Example: "Claude Code 2.x, signed in. Codex, signed out. Antigravity, not found."
   - **Confirm or correct.** Each row has one control: use it, skip it, or fix it (point at a different binary, or sign in with the command shown). "Add an agent" covers a CLI it did not find, a local endpoint or a hosted router, with a name the person chooses.
   - **Repeat back.** "You're seating Claude Code and Codex. Codex will check Claude Code's work, and the reverse." Then **Looks right** or **Change**. Nothing is saved until the person presses Looks right.
   - **How detection works.** Look on PATH and in each CLI's documented install locations. Resolve symlinks and wrappers, so nix and version-manager installs are found. Run the CLI's own version command. Learn sign-in state only from the CLI's own status command, the way the daemon's subscription probe already does (`.nuclear/changes/subscriptions-page/basis.md`: its output is not stored). Never open a credential file, keychain entry or token, and never ask for an API key. If a check cannot tell, the row says "unknown" and shows the command to check by hand. It never guesses.
   - **Afterwards.** Settings has **Check again**, and the same check runs before each run, so a CLI that was updated, moved or signed out shows on the card that needs it. The existing `pnpm cr doctor` checks become this screen.
4. **One question.** "When should we check with you?" with the middle answer preselected (ADR 0024 decision 7).
5. **The board, with the Planner box.** It opens on the current repository. If no agent is found, a replay of a sample run shows what will happen, using the existing fake adapter.
6. **Ask for things only when they are needed.** The passkey is registered the first time the person signs something, not at install. An OS permission is explained in one sentence just before the OS asks.

**Budget:** one command, one confirmation of the agents, one question, zero required accounts, and under a minute from the command to the board on a machine that already has one signed-in agent. Skipping any step leaves working defaults.

## Owner questions

- Moving passkey registration from first run to first signature changes the setup flow in ADR 0013's identity design. Check whether it is a kernel or policy change before building.
- The 60-second target is a goal until a script measures it on a clean machine for each OS.
