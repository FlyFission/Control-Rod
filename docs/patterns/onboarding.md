# Pattern notes: onboarding

> **Provenance.** Written on 2026-11-23. Install patterns come only from the README install sections of the permissively licensed projects in the set (Apache-2.0 or MIT: herdr, herdr-app, emdash, Orchestrator, Nimbalyst, Paradev, Vibe Kanban, Paperclip, Mistral Vibe, agent-of-empires). Kandev, claude-squad (AGPL), Multica and oh-my-openagent (source-available) fall under the clean-room rule (ADR 0019, `docs/patterns/README.md`), so nothing here comes from their documentation; they appear only in the issue-title counts. No source code was read. This file records ideas only, in our own words. Counts come from `docs/research/user-demand-2026-11/repos/onboarding_count.py`.

## Answer first

The best installs in this set follow one shape: **one command or one download, no account, find the agents already on the machine, and ask nothing else until the person needs it.** Control Rod today needs four tools (through mise), four commands, and a passkey before the first screen. Since #158 (`.nuclear/changes/first-run-setup/`), a first run already opens on a Setup page with the agents found, one switch each, Add an agent, the check-in question and a read-back; steps 3 and 4 below describe where that page should go next. The target below is one command, a confirmed list of agents, one question, and the board.

## What breaks onboarding, counted

Across 29,938 captured issue titles from all 15 repositories, 5,505 (18.4%) match an install, sign-in, agent-detection, prerequisite, permission or first-run keyword. Keyword matching over-counts ("token", "path" and "package" are noisy), so read the ranking rather than the totals.

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
| One shell line per OS (`curl … \| sh`, PowerShell `irm … \| iex`), plus Homebrew | herdr, herdr-app, agent-of-empires, Mistral Vibe | A prebuilt binary with the web app embedded and the database bundled, installed by one line per OS and by `brew` |
| A desktop download for every OS, with the daemon run for you | Orchestrator, emdash, Nimbalyst, Paradev (macOS first) | The desktop shell in the plan's craft track, later; the one-line install comes first |
| `npx <name>` with nothing else | Vibe Kanban, Paperclip | Optional, and only if it does not make Node a requirement for people who install the binary |
| Run it inside a project and start by describing the job | (idea from the issue titles; no README used) | First run opens on the Planner box in the current folder's repository |
| Detect installed agent CLIs automatically | emdash, Orchestrator, herdr | Find every supported CLI on PATH and its sign-in state; seat them by default |
| The one prerequisite is an agent CLI you are already signed in to | Paradev (plus Git) | Same, and say so in one line on the install page |
| Bring work over from the tool you used before | (idea, not from a README in this set) | An importer for Vibe Kanban boards (already in the plan) |
| Running the install line again updates it | (idea, not from a README in this set) | Same line updates; the in-app update panel also works |
| Hand the install guide to your agent | Paperclip | Only if the guide is plain commands. A captured issue title in another project reports a prompt-injection complaint about its install guide |

Not adopted: install-time analytics (Nimbalyst sends an anonymous ID, opt-out), a required account (Paradev's remote access needs a Pro plan), and Docker as a requirement.

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
