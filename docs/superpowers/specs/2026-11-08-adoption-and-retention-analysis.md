# Adoption and retention: why an end user would not install, not use, or leave

- **Date:** 2026-11-08
- **Owner:** Ben Huffer
- **Status:** Draft for owner review
- **Change record:** `.nuclear/changes/program-gap-analysis/`
- **Companion:** [Program gap analysis](2026-11-08-program-gap-analysis.md) (SWOT, capability matrix, ranked gaps). This document takes the other chair: the person who hears about Control Rod, installs it, and six weeks later either tells a colleague or deletes `~/.controlrod`.

## 1. Method and limits

The questions are the funnel's: what stops it spreading, what makes someone install it and never use it, what makes them stop after a week, what makes them uninstall, what keeps it out of the working day. Each answer is tied to something in the repository as it is today (`main` at `2d1886d` plus slice M4), to the failure patterns the field's users reported (research file 03, section D8), or to a plain inference about a named persona. Inferences are marked. No user was interviewed; the owner validation in the gap analysis (P-01) is the test of this document too.

## 2. The four people

| Persona | How they arrive | What they want in the first ten minutes | What they will not tolerate |
|---|---|---|---|
| **Solo developer** running Claude Code or Codex all day | Hacker News, a friend's link, a roundup of Vibe Kanban alternatives | Type a task, watch an agent, see a diff, merge | Ceremony on a one-line fix; a second account; a tool that dies when the terminal closes |
| **Small software team lead** (two to eight engineers) | Burned by an agent PR that "passed" and broke production | Know who checked what before it merged | A second board beside Linear or GitHub; evidence they cannot show their own boss |
| **Engineer in responsible charge** at a small firm (the owner's own world) | Word of mouth from another firm; a regulator's question | A calculation package or a scope of work drafted, checked by someone else, and signed by them | Any number that appeared from nowhere; a record they cannot hand to a client or an auditor |
| **Consultant with client data** | Searching for "run Claude Code on client files safely" | Know what left the machine and what did not | A cloud account; a data lane that says "stays on this computer" with nothing on the computer to run it |

## 3. What stops it spreading

| # | What a person meets | Why, in the repository | Countermeasure | Owner decision? |
|---|---|---|---|---|
| V-01 | **Nothing to look at.** The README has no screenshot, no recording, and no live demo. The fifteen office worlds, the one asset in this product that stops a thumb mid-scroll, are invisible until after a build. | `README.md` carries one image, the Codespaces badge. `apps/web/themes.html` renders the worlds with no API, and nobody can reach it. | Publish the themes page and a read-only board on fake data as a static site (GitHub Pages or any host) and put a 20-second recording and three screenshots at the top of the README. Munder Difflin went to 270 points on Hacker News on its office floor; this product has fifteen. | No |
| V-02 | **Nothing to share.** When a card is accepted, nothing leaves Control Rod. No link to a proof page, no status check on the pull request, no trailer on the commit, no badge. The person who would spread it has nothing to paste. | No pull-request or push path (gap G-04); the proof view at `/packages/:id/proof` is behind the local passkey. | A shareable **acceptance receipt**: a static HTML page per accepted revision (who did, who checked, who signed, the digests, the sandbox attestation) that can be attached to a PR, emailed to a client, or hosted. This is the viral object. It needs ADR 0009's verifier to be checkable, but an unverifiable receipt is still shareable and honest if it says so. | Yes (ADR 0009 scope) |
| V-03 | **The pitch is a warning, not a wish.** "Agents can't mark their own homework" is a reason to stay, not a reason to click. Nobody shares a seatbelt. | `README.md` lead. | Lead with the wish and keep the warning as the second sentence: "Hand work to your agents, watch them at their desks, and sign off on what you can prove." The name and the nuclear framing are an asset with engineers and a cold wall for developers; the README needs both doors. | Yes (voice) |
| V-04 | **The first try fails on the platform most people have.** Install succeeds on a Mac and the first run is refused by the sandbox preflight. The Codespaces badge, the one zero-install path, leads to a place where agents cannot run at all. | `status.md`: qualified on WSL2 only; `getting-started.md` says the dev container is "not yet for real agent runs". | Qualify native Linux first (it unblocks Codespaces, CI and every Linux dev), then macOS. Until then, the README must say in the first screen which platforms run agents today, so a Mac user tries the board on fake data instead of hitting a refusal. | No |
| V-05 | **Contributions are closed.** "Outside code contributions open after Phase 1" and a contributor license agreement to come. An open-source project that cannot take a pull request does not get the people who spread open-source projects. | `CONTRIBUTING.md` | Open it. Keep the trust surfaces behind CODEOWNERS, which already works. Publish the CLA or drop the need for one. | Yes |
| V-06 | **No place to talk.** No Discussions, no chat, no issues (zero open). A curious person has nowhere to ask "does it do X". | GitHub issues list; README | Turn on Discussions, seed it with the known rough edges from `status.md`, and answer within a day for the first months. | No |
| V-07 | **Not in any package manager.** `brew`, `winget`, `npx`, `docker run`: none. Every competitor has at least one. | No `deploy/`, no installer | `npx controlrod` that runs `doctor` and `start` from a published package, then a Compose file, then signed desktop builds. | No |

## 4. Install, then never use

| # | What a person meets | Why | Countermeasure | Owner decision? |
|---|---|---|---|---|
| I-01 | **A passkey before anything.** The first screen demands a passkey registration. Passkeys on `localhost` are flaky on Linux and in some browsers; the credential is bound to the origin, so changing the port or host later strands it; a person who only wants to look will not enroll a hardware key to do so. | `SignIn.tsx`; `auth.ts` | A **look-around mode**: the board on sample data with every signing action shown but disabled, reachable before registration ("Set up this machine" stays the real door). Record the origin binding rule in the UI before enrollment, and offer a recovery path (a second credential) on the first sign-in. | Yes (sample data in the product) |
| I-02 | **Four toolchains and a multi-minute first build.** Node 22, pnpm, Go, uv, an embedded Postgres that refuses to run as root; a first `pnpm cr start` that builds for minutes with no progress to speak of. | `README.md` Try it; `scripts/cr.mjs` | Ship built artifacts (the web bundle, the daemon binary, the kernel WASM is already prebuilt) so the first start is seconds; print one progress line per build stage; `doctor` already does the diagnosis well, keep it. | No |
| I-03 | **The headline flow is behind two environment variables.** Guided preparation and prepared release, the thing the README describes, are off by default. | `server.ts` reads `CONTROLROD_GUIDED_PREPARATION` and `CONTROLROD_PREPARED_RELEASE` | Default them on once the owner pilot has passed, or make them a first-run choice in the UI with one sentence each. A flag nobody can find is a feature nobody has. | Yes |
| I-04 | **Where is my repository?** Binding a repository is an administrator command signed with a passkey on the Policies page, and pinning a source needs a config file named by an environment variable. A developer expects to paste a path or pick a folder on the first card. | `admin.ts` `repo.bind`; `CONTROLROD_PREPARATION_CONFIG` | Ask for the repository on the first code card (path or URL, base branch) and run the bind command for the person, with the signature it needs. Keep the admin command as the thing it calls. | No |
| I-05 | **Without Codex, every task needs a signed override.** The checker must run on a different runtime from the author; with Claude Code alone, each pre-check waits for a written reason and a passkey. | `getting-started.md` prerequisites; `work.ts` independence rules | Say it before install, not in `doctor` after. Then make the second runtime easy: a local model (gap G-06) is the independent runtime that costs nothing and leaks nothing, and it is the natural checker for the restricted lanes. | Yes (G-06 priority) |
| I-06 | **An empty board with jargon around it.** Ten places in the navigation, named Packages, Registers, Rungs, Lanes, Grades, SCRAM, Custody, Basis. The vocabulary is a nuclear QA program's, and it is right for the third persona and a wall for the first two. | `places.ts`; the package page | A glossary tooltip on first hover is the small fix. The real fix is two vocabularies on one record: "task, check, sign-off" for software mode and "work package, verification, acceptance" for capital projects, chosen by mode (ADR 0015 already separates modes). Slice M4's empty state now explains the first step; the sample project in I-01 shows the rest. | Yes (vocabulary by mode) |
| I-07 | **The first card takes an agent run to exist.** Typing a title creates a capture; a package appears only after an intake agent drafts it. If intake fails or the runtime is not ready, the person waits on nothing. | `Captures.tsx`, `CaptureCard.tsx` intake states | Keep intake, but let a person **draft the package by hand** from the capture card when intake is slow or failed (title, objective, criteria, kind), so there is always a path to a card you can release. | No |

## 5. Used for a week, then stopped

| # | What a person meets | Why | Countermeasure | Owner decision? |
|---|---|---|---|---|
| W-01 | **The ceremony tax on small work.** A one-line fix is capture, lane, intake, read the draft, release with a passkey, author run, pre-check run, read the results, accept with a passkey. Two signatures and three agent runs for what a competitor does in one prompt and one merge. Grade already says General service means light review (O3), but light is not light yet. | `work.ts`; `DecisionBar.tsx`; the plan's O3 mapping | A **light path for General service** that keeps every record but removes waiting: release at creation as one signed decision ("create and release"), the author and pre-check queued together, accept from the board (M3). Count the signatures per card in the owner validation and set a target of one for General service. | Yes (combined intent needs a kernel decision) |
| W-02 | **Three runs' worth of tokens for one task.** Intake, author and checker each consume the person's own subscription, inside the same five-hour windows, and the app says "cost not reported". The person feels the burn and cannot see it. | Research D8 item 5; `budgets.ts` | Per-card token roll-up (M5), a per-period token budget that refuses the next dispatch (as minutes do today), and a cheap or local runtime for intake and pre-check. Show "about N tokens so far" live during a run. | No |
| W-03 | **It dies when the terminal closes.** `pnpm cr start` is a foreground process. Close the laptop lid, close the tab, and the office is dark; there is no service, no tray icon, no "it is still running". The product's picture is an always-on office; the reality is a dev server. | `scripts/cr.mjs` | A background service (`controlrod service install` on each platform) with a tray or menu-bar indicator and the daemon's state. Until then, `start` should survive the terminal (detach) and `cr status` should say what is running. | No |
| W-04 | **The honest states look broken.** "Status unknown since 10:42", "outcome unknown", "cost not reported", "needs a second qualified person" are all correct, and a new user reads them as bugs. | Board M1 rulings | Pair every honest state with the one action that resolves it and the one sentence that says why it is honest ("the stream dropped; nothing here is claimed as current"). Most already have the action; add the sentence. In the owner validation, count how many times a person asked "is it broken". | No |
| W-05 | **Cannot correct a running agent.** Watching an agent go wrong, the only move is Stop, then Return with a reason, then Release again: two signatures and a wait. | ADR 0020 | Make it one motion in M5 (Stop, note, "Return and release"). Then measure how often it was needed before revisiting ADR 0020. | Yes (ADR 0020 later) |
| W-06 | **The agent CLI updated and runs are refused.** Pinned runtime versions and a preflight that refuses an unknown version are right for a QA program and brutal for a solo developer who updates Claude Code weekly. | Roster pins; ADR 0021 qualification | Show the refusal on the board with the one command to pin the new version (the roster already has pins), and publish qualified versions within days of each CLI release. This is a maintenance commitment, and it has to be staffed. | Yes (staffing) |
| W-07 | **Nothing tells me it finished.** No notification outside the tab, so a run that took twenty minutes finishes into silence and the person has moved on. | Gap G-05 | Browser notifications for Inbox items first; a Slack or Teams bridge through `connectors/` later. | No |

## 6. Uninstall

| # | What a person meets | Why | Countermeasure | Owner decision? |
|---|---|---|---|---|
| U-01 | **My records are stuck inside it.** Evidence lives in a Postgres under `~/.controlrod`; the verifiable export (ADR 0009) is parked. A person who is leaving wants the signed record of what was accepted, and a person who fears leaving wants to know they could get it. | ADR 0009; `preparation-recovery.md` is a database dump, not an export | A plain export now: one folder per package with the outputs, decisions, verifications, run events and digests as files, plus a README that says how to check a digest by hand. The verifier can follow. Lock-in fear is a reason not to start, not only a reason to leave. | Yes (ADR 0009 scope) |
| U-02 | **It ate my disk, or my battery.** An embedded Postgres, a daemon, per-job workspaces that are never swept. The field's third most reported failure is worktree and disk mess (one user at 26 GB in two days). | Research D8 item 3; parked "worktree retention" | A retention default (sweep finished workspaces after seven days, keep the retained outputs), a Usage line that shows disk and a one-click sweep. | No |
| U-03 | **It got in the way more than it caught.** If, after a month, the person can name no mistake Control Rod caught, the ceremony is all cost. | No measurement exists | Show the **catches**: a count on the Usage page of pre-checks that disputed, returns with a reason, and refusals that stopped a stale or unsandboxed run. The product has to prove its own worth with its own records. | No |
| U-04 | **Nothing happened for weeks.** No release, no changelog, no version, held dependency bumps, one maintainer. The field's eighth failure is "project seems abandoned". | Gap P-07, P-08; research D8 item 8 | Tag releases, write a changelog per slice, show the version in the app, and answer in Discussions. | Yes (P-07) |

## 7. Why it stays out of the working day

| # | What a person meets | Why | Countermeasure | Owner decision? |
|---|---|---|---|---|
| D-01 | **It is another window.** Developers live in a terminal, an editor and GitHub. Control Rod is a browser tab with no CLI to add a card, no editor command, no GitHub status, no issue import. | The capture contract has `source: "cli"`; no CLI exists; `sdk/python` is a client library | A `controlrod` CLI (`add`, `board`, `open`, `review` as the review-panel spec already proposes), a GitHub check that posts the acceptance receipt, and tracker import (parked, promote after M3). | No |
| D-02 | **The output is a patch file.** Accepted code must be applied by hand. The last mile is the one that decides whether it is used tomorrow. | Gap G-04 | "Open pull request" after Accept, recorded as a run. | No |
| D-03 | **The team cannot share it.** One machine, one person; passkeys bind to the origin; `deploy/` is a placeholder. The second and third personas are teams. | `status.md` | The single-server deployment (gap P-04) and an invitation flow that works across machines. | No |
| D-04 | **The documents I review are elsewhere.** The engineer's day is PDFs, DOCX and markup. The review tab does not exist yet. | Slice M7 | M7 as planned; it is the moat for the third persona. | No |
| D-05 | **I cannot see it from my phone.** The owner who signs is often away from the desk; a passkey bound to `localhost` cannot be used from a phone. | Origin binding | Follows from D-03: a stable origin makes a phone a signing device. | No |

## 8. Questions the owner should ask that nobody has yet

1. **Who is the user and who is the buyer?** In a firm, the drafter does the ceremony and the engineer in responsible charge gets the value. If the drafter hates it, it dies quietly. The light path (W-01) is for the drafter.
2. **What does a person say to a colleague?** One sentence, repeatable. "It shows me what the agent did, who checked it, and I sign it" is the candidate. Test it in the owner validation by asking each participant to describe the product afterward.
3. **What did it catch?** If the records cannot answer this (U-03), the trust story has no evidence of its own.
4. **Would an auditor or a client accept the receipt?** Show one acceptance receipt to one QA manager and one client and write down what they asked for. That is the specification for ADR 0009.
5. **What is open and what is paid?** `CONTRIBUTING.md` mentions open-core. Until the line is drawn, teams hesitate to adopt and contributors hesitate to contribute.
6. **How many signatures per card is the right number?** Measure it; set a target per grade.
7. **What happens on the day Claude Code changes its flags?** Who re-qualifies, how fast, and how does a user learn it is done?
8. **Which door is the front door, the engineer's or the developer's?** The product can serve both with two vocabularies on one record (I-06), but the README, the demo and the first release have to choose which person they speak to first.

## 9. The five moves that change the curve

In order, each one small enough for one change record:

1. **Show it.** Static demo site (themes page plus a read-only board on sample data), three screenshots and a recording in the README (V-01). Zero risk, highest leverage.
2. **Let people look before they enroll.** Look-around mode on sample data, passkey only when they sign something (I-01), with the platform line on the first screen (V-04).
3. **Make small work light.** One signature for General service, actions on the card (M3), the next-run note in one motion (W-01, W-05).
4. **Give them something to keep and something to share.** Plain evidence export and the acceptance receipt (U-01, V-02).
5. **Get out of the way of the day.** A CLI to add a card, a pull request out of Accept, a service that survives the terminal (D-01, D-02, W-03).

Then measure, in the owner validation: time to first card, signatures per card, "is it broken" questions, and whether each participant can say the one sentence.

## 10. Not claimed

No user was interviewed; the personas and their reactions are inferences from the repository, the field's recorded failures and the owner's stated users. Nothing here is a compliance, certification or safety claim.
