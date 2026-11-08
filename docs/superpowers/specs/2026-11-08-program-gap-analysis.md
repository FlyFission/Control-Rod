# Program gap analysis: Control Rod against the agent-board field

- **Date:** 2026-11-08
- **Owner:** Ben Huffer
- **Status:** Draft for owner review
- **Change record:** `.nuclear/changes/program-gap-analysis/`
- **Companion:** [Adoption and retention analysis](2026-11-08-adoption-and-retention-analysis.md), the same evidence read from the end user's chair across the funnel.
- **Question answered:** where Control Rod falls short of the tools people use today to run AI agents from a board, for the end user and for the program that builds it, and what to do about it in what order.

## 1. Method and limits

Three sources were used, in this order of weight:

1. **The repository as it is on `main` at `2d1886d`**: every web page, the board code, the API client surface, the daemon, the plan and status documents, and the open pull requests. Claims about Control Rod below were checked against code, not against the plans.
2. **The repository's own competitive research** in `.nuclear/changes/board-redesign/evidence/` (files 01 to 07, 2026-11-05), which profiles twenty products, ranks the most reacted feature requests across their repositories, and records the failures users hit most.
3. **A live read on 2026-11-08** of the public READMEs of Multica and Munder Difflin, the two products the owner named, plus two third-party roundups of Vibe Kanban alternatives. README claims are what the vendor says, not what was tested; they are labeled as such.

Not done: no product was installed and run; no user was interviewed; no pricing or traffic data was checked. Strength grades follow the decision ledger's scale (Strong, Moderate, Weak, Ours, Hypothesis).

## 2. The field in one table

| Product | What it is | License | Where it is going | Source |
|---|---|---|---|---|
| **Multica** | A web, desktop and mobile issue board where agents are named teammates. Self-hosted or cloud. 27 agent CLIs, squads, skills, cron "autopilots", steering of a running agent, execution log, cost per agent and issue, review gates, Slack and chat bridges, GitHub, GitLab, Gitea and Forgejo. | "Multica License": Apache 2.0 text plus conditions on hosted use, embedding and branding. Not OSI open source. | Releases most weekdays; SSO, audit log and compliance reporting are on its roadmap, not shipped. | README 2026-11-08; third-party comparison |
| **Munder Difflin** | A desktop "office of your clones": a central agent delegates to persistent agents that run real CLIs in pseudo-terminals; a 2D office floor; kanban with dependencies and drag; steer or stop mid-run; token budgets per period; circuit breaker; memory "palace"; Slack, webhooks, voice; a built-in editor and git views; a Pro tier. | MIT for code; bundled tileset under a separate art license. | Pre-release (0.5.x); its own release notes record fixes for wrong cost reports and unreliable agent-to-agent messaging. | README 2026-11-08; news coverage |
| **Vibe Kanban** (community fork) | The original agent kanban: each card runs an agent in its own git worktree; diff review in the browser; about ten agents. The company closed 2026-04-10 and the board feature was removed from the product before that; the local tool still works. | Apache-2.0 | Community maintained, slower fixes. | Research 03, 05; roundup |
| **Paperclip** | Simulates an AI company: org chart, roles, approvals, budgets, heartbeats. Single operator, OpenClaw first. | Open source | Active; the second most reacted request across the field is its "local LLMs via Ollama" (81 reactions). | Research 05; comparison |
| **Conductor, Nimbalyst, Claude Squad, Paradev, Orca, Emdash** | Parallel-agent workspaces (desktop or terminal), each card or session in a worktree; most have no board or a thin one. Conductor was acquired and is winding down; Nimbalyst replaced Crystal; Claude Squad is AGPL. | Mixed | Consolidating. Terragon, Conductor, Jules and the standalone Codex app all closed or folded in 2026. | Research 03 section 0 |
| **Linear for Agents, GitHub Agent HQ** | The incumbents' answer: assign an issue to an agent in the tracker you already use. | Proprietary | The default for teams that already live in those trackers. | Research 03 |

**What the field has settled on (Strong):** no account for local use; existing CLI logins, no API keys; local execution with code staying on the machine; a worktree per card; a diff reviewed in the browser; a human review gate before anything lands; an execution log; a kanban as the front door. **What is still contested:** steering a running agent, cost visibility, multi-agent comparison, and whether agents may talk to each other without a person in the loop.

## 3. SWOT

### Strengths (true today, checked in code)

- **The only product where "done" is a signed human decision.** Release, accept, return and reject need a passkey; the checker never sees the author's transcript; the deciding logic is a Rust kernel agents cannot touch; every state change is in an append-only event chain with seals and proofs. Nobody in section 2 has any of this.
- **Engineering documents are first class.** Grades (Safety, Material, General service), disciplines, qualified checkers, person verification, criterion-based acceptance, data lanes. Every competitor is code only.
- **Honest screens.** The board shows "status unknown since" rather than stale state, "cost not reported" rather than $0, and never offers Accept the record does not support. The three adversarial reviews in the board record hammered this into the spec; it is a habit now, not a feature.
- **Sandboxes with a preflight and no unsandboxed fallback** (ADR 0021), recorded per run.
- **Clean license and no telemetry.** Apache-2.0, a license gate in CI, an SBOM, and nothing phoned home. Multica's license is not open source and both Multica and Munder Difflin send telemetry by default.
- **Discipline the project can point at.** Change records, contract-first TypeSpec, red-team catalog, CODEOWNERS on trust surfaces, three-model adversarial review. This is the product's own argument made visible.
- **Fifteen office worlds and a floor view** that make watching agents pleasant rather than a terminal grid.

### Weaknesses (true today, checked in code)

- **The board was read-only until this record.** Before slice M4 a person could not add work from the home screen; the empty board sent them to another page. A card still cannot be acted on from the board (M3 not built), filtered or grouped (M2 not built), and the card view is the function-first package page (M5 to M7 not built).
- **Two runtimes, one qualified platform.** Claude Code and Codex only, and agent runs start only on WSL2. A macOS or native Linux user can install everything and then have every run refused by the preflight. Multica lists 27 CLIs; Munder Difflin lists 12 plus any command plus local models.
- **No packaged distribution.** Running it needs Node, pnpm, Go and uv on the path and a multi-minute first build. Competitors ship a desktop app, a Docker Compose file, a winget package or a one-line installer. `pnpm cr doctor` is good; it is still a developer's path.
- **Code never leaves as a pull request.** Outputs are retained as patches and files; nothing pushes a branch or opens a pull request, and nothing imports from a tracker. For software work the last mile is manual.
- **No steering, no mid-run questions, no pause.** By design (ADR 0020, one-shot print mode) and recorded honestly, but it is the feature users ask for most loudly in this field after local models, and both named competitors have it.
- **Nothing reaches a person outside the tab.** No OS notification, no email, no Slack or Teams bridge. The Inbox badge only works while the app is open.
- **One machine, one person.** Tenancy, members and invitations exist in the API, but `deploy/` and `connectors/` are placeholders, so a "small team" cannot share a board yet.
- **No user has validated the board.** The design record's owner validation (E-04, one real code task and one real document task by the owner and one engineer) is still open, and the strategy rests on an owner hypothesis (S1) that the ledger itself labels as untested.

### Opportunities

- **The standalone boards are dying and the survivors are converging on features Control Rod already has by construction** (review gate, local execution, no account). The vacancy is "a board you can trust", not "another board".
- **Local models for the restricted lanes.** The data lanes already say proprietary, client-confidential and restricted work "stays on this computer until a provider is approved for this lane". A local runtime (Ollama, LM Studio, vLLM) is the provider that satisfies that sentence, and "local LLMs" is the second most reacted request across every repository in the research. No competitor ties local models to a data classification.
- **The review panel** (`2026-11-06-review-panel-design.md`): several models review one frozen snapshot, every finding is checked against the code before it counts, and agreement is shown as "N of M seats, K vendors". Nothing else in the field verifies a reviewer's claims deterministically.
- **Engineering firms and regulated software** are not served by any of these tools. Grades, disciplines and signatures are the moat; a domain pack per discipline (the `packs/` directory is mostly placeholders) is how it compounds.
- **Verifiable evidence export** (ADR 0009, parked) would let a customer or auditor check a record without Control Rod. Nobody else can offer it.

### Threats

- **Linear and GitHub absorb the board.** Teams that already live in a tracker assign issues to agents there; Control Rod must import from and export to them or be a second board nobody opens.
- **The owner's attention is the single point of failure.** One maintainer, no open issues, every slice waiting on one review. Research D8 ranks "maintainer bandwidth" among the top eight failures users hit in this field.
- **Agent CLIs change weekly.** Each runtime adapter and each sandbox qualification is a moving target; Vibe Kanban's fork is already noted for "slower fixes as agent CLIs change".
- **Honesty reads as weakness in a demo.** "Cost not reported", "status unknown", "outcome unknown" and a refused run on macOS are correct, and they lose a side-by-side with a product that shows a confident number.
- **A design that parks steering** may be read as "the agent cannot be corrected", when the real answer is "corrections are recorded decisions". The next-run note (M5) has to feel as fast as steering or the point is lost.

## 4. Capability gap matrix

Columns: **CR** is Control Rod on `main` after this record; **M** is Multica; **MD** is Munder Difflin; **VK** is the Vibe Kanban fork. Values: ● has it, ◐ partial, ○ no, ✕ deliberately not (with the reason). Competitor cells come from their READMEs and the research files, not from testing.

| Capability | CR | M | MD | VK | Control Rod disposition |
|---|---|---|---|---|---|
| Local use with no cloud account | ● passkey | ◐ cloud default, self-host possible | ● | ● | Keep. Strong signal in the field. |
| Board as home with derived columns | ● | ● | ● | ● (removed from product) | Built (M1). |
| Add work from the board, paste many | ● (M4, this record) | ● | ● | ● | Built in this record. |
| Act on a card from the board (release, return, accept, stop) | ○ | ● | ● | ● | **M3, next.** |
| Filters, search, group by, saved views | ○ (Packages page has find) | ● | ◐ | ◐ | **M2, next.** |
| Drag a card to change its status | ✕ status is derived from signed decisions | ● | ● | ● | Keep. Drag within a column later. |
| Live run feed with tool calls and files | ◐ run log and events per run on the package page | ● execution log | ● live terminal per desk | ● | **M5**: one Activity tab per card. |
| Steer a running agent, answer its questions | ✕ ADR 0020 one-shot runs | ● | ● | ◐ | Parked. Make the next-run note fast (M5); revisit ADR 0020 after owner validation. |
| Stop a run with a recorded outcome | ● | ● | ● | ● | Built. |
| Diff review with line comments in the browser | ○ patch files downloadable | ◐ | ● built-in git views | ● | **M6.** |
| Document review (Markdown, PDF, DOCX) | ○ outputs downloadable | ○ | ○ | ○ | **M7.** Nobody else has it; it is the moat. |
| Independent check and signature before done | ● | ◐ "review gate", a human decides | ◐ approvals queue | ○ | Built. Unique. |
| Sandbox per run, recorded, with preflight | ● WSL2 only | ◐ documented security model | ○ | ○ | Qualify macOS and Linux (program gap P-03). |
| Runtimes supported | 2 | 27 | 12 + any command | about 10 | **Adapter breadth is a gap**; local models first (G-06). |
| Local models (Ollama, LM Studio, vLLM) | ○ | ○ | ● | ○ | **G-06.** Pairs with the restricted lanes. |
| Usage and cost per card | ◐ tokens per run, org-wide spend page, "cost not reported" | ● cost per agent and issue | ● computed from transcripts, with a ledger | ○ | **M5** rolls usage up per card; cost stays "not reported" until a runtime reports it. |
| Budgets | ◐ minutes per run | ○ | ● tokens per period | ○ | Later: token budget per period as a refusal, not a claim. |
| Open a pull request from accepted code | ○ | ● | ● via editor | ● | **G-04.** |
| Import from an issue tracker | ○ | ◐ | ◐ webhooks | ○ | Parked in the board spec; promote after M3. |
| Notifications outside the app | ○ | ● inbox, Slack, chat | ● Slack, Telegram, webhooks | ○ | **G-05.** Browser notifications first. |
| Team use on one server | ◐ API ready, no deploy | ● Docker Compose, Helm, roles | ◐ "Teams" chat between offices | ○ | **P-04.** |
| Packaged install | ○ | ● installer, desktop, cloud | ● winget, desktop | ● | **G-07.** |
| Recurring agent jobs (cron) | ✕ no run without a signed release | ● autopilots | ● scheduled missions | ○ | Deliberately not until a release can authorize a schedule on the record. |
| Agents message each other without a person | ✕ | ● | ● hive | ○ | Deliberately not. The checker must not see the author's transcript. |
| Skills and playbooks | ◐ pack roles; software pack is a placeholder | ● | ● 227-item catalog | ○ | **G-08** domain packs. |
| Accessibility checked (axe, contrast) | ● board, three looks | unknown | unknown | unknown | Keep; extend to every page (M8). |
| Telemetry | ○ none | ● daily snapshot by default | ● anonymous events by default | ○ | Keep none. |
| Evidence a third party can verify offline | ○ | ○ | ○ | ○ | ADR 0009, parked. Unique if built. |

## 5. End-user and quality-of-life gaps, ranked

Ranked by how often a person would hit the gap in a day of real use, weighted by the field evidence. Each row names what to build and the trust constraint it must keep.

| # | Gap | Who hits it | Evidence | What to build | Constraint |
|---|---|---|---|---|---|
| G-01 | **Cannot act on a card from the board.** Every decision means opening the package page and finding the decision bar. | Everyone, many times a day | Spec 6.2; research D4, V7 "every gate shows its buttons" (Strong) | Slice M3: primary action button and Move to menu from `GET /packages/:id/actions`, refusal shown in place, keyboard path. | Lawful actions only, never column names; the screen-only acceptance block stays. |
| G-02 | **Cannot narrow the board.** No kind filter, no Needs you toggle, no search, no grouping, no saved views. The Inbox is the only "needs me" view. | Anyone with more than a dozen cards | Spec 6.2 lenses; research 06 (Strong for swimlanes) | Slice M2: lenses in the URL, saved views, the default-view guard. | The default view may never hide work waiting on a signature or a person verification. |
| G-03 | **The card view is a package page.** Runs, outputs, pre-check, criteria and decisions are separate panels; usage lives on another page; the note for the next run has nowhere to go. | Reviewers, every run | Spec 6.4; research D3 (stale status is a top-four failure) | Slice M5: Activity tab with events, attestation per claim, honest usage, Stop, the next-run note. | Usage only when every counted event carried it; "cost not reported". |
| G-04 | **Code work ends in a patch file.** No branch is pushed and no pull request is opened; the person applies the patch by hand. | Every software card | Research D4 and section 5 (Strong) | After M6: an "Open pull request" action that pushes the accepted revision's patch to a branch on the bound repository and records the PR URL as evidence. Import from a tracker is the mirror image. | Only after Accept; the push is a recorded run, never an agent's own decision. |
| G-05 | **Nothing reaches you outside the tab.** | Anyone who closes the browser | Research D8 item 7 and Multica's inbox design | Browser notifications for Inbox items (permission asked once, off by default), then a daily digest, then chat bridges through `connectors/`. | Notify on recorded events only; no notification claims an outcome the record lacks. |
| G-06 | **No local model runtime.** Proprietary and restricted lanes say work stays on this computer, and there is nothing on this computer to run it. | Engineering firms, anyone with client data | Second most reacted request field-wide (paperclip#187, 81 reactions); the lane sentence in `LanePicker.tsx` | A runtime adapter for an OpenAI-compatible local endpoint (Ollama, LM Studio, vLLM) run through the daemon with the same sandbox, evidence and pre-check independence rules. | A local runtime is a runtime: same claim, lease, evidence upload and independence check. Model and version recorded on the run. |
| G-07 | **Install is a developer's path.** Four toolchains, a multi-minute first build, no desktop app, no container image, no installer. | Every new user | Research D8 item 1 (forced setup friction) and every competitor's install story | A `docker compose up` path first (API, embedded Postgres, web; the daemon stays on the host because it launches the person's own CLIs), then a signed desktop wrapper later. Keep `pnpm cr doctor` as the fallback. | No telemetry; the daemon never runs inside the container because the sandbox qualification is per host. |
| G-08 | **The software pack is a placeholder.** Agents draft with generic roles; there are no playbooks for a bugfix, a migration, a calculation package or a scope of work beyond the HVAC example. | Everyone, at intake | Multica "skills", Munder Difflin's catalog; `packs/software/` README | Fill `packs/software/` with the author, checker and intake roles and two or three typicals; add one engineering pack per discipline the owner practices. | Packs are data, reviewed like policy; no engineering number inside a pack. |
| G-09 | **Steering is absent and the alternative is slow.** A person who sees an agent go wrong can only Stop, then Return with a reason, then Release again (two signatures). | Anyone watching a run | Research D5 (contested but loud); both named competitors have it | Make the next-run note one motion in M5 (Stop, note, "Return and release" as one signed decision where the kernel allows a combined intent). Revisit ADR 0020 after owner validation with real data on how often it hurt. | No screen says a run was steered. |
| G-10 | **Accepted never leaves the board.** The Accepted column grows forever; closed packages leave but accepted ones do not. | Anyone after a few weeks | Multica #3246 "archive old Done" (9 reactions) | Collapse Accepted older than seven days behind a count with a Show control; closing stays a decision. | Collapsing is presentation; nothing is deleted or moved. |
| G-11 | **The looks stop at the board.** Looks A, B and C apply to the board container only; the rest of the app is look A. | Anyone who chose a look | Ruling 10 in the M1 record | Slice M8 extends the tokens to every place. | Contrast script and axe on every page. |
| G-12 | **Keyboard travel is partial.** Command palette and C exist; no j/k across cards, no shortcut to the first Needs you card, no "?" help. | Keyboard users | Linear and Vibe Kanban set the expectation | A small shortcut set with an on-screen list; arrow keys between cards in a column. | Shortcuts never fire inside a field (`inTypingContext`). |
| G-13 | **Map tiles come from a public host.** The GeoMap loads tiles from openstreetmap.org, so the app is not air-gap ready. | Restricted sites | `status.md`; `GeoMap.tsx` | Make the map opt-in per installation, with a self-hosted tile source setting. | No third-party request unless the owner configured it. |

## 6. Program gaps

| # | Gap | Evidence | Fix |
|---|---|---|---|
| P-01 | **No validation with a real user has happened.** The board strategy is an owner hypothesis (ledger S1) and the owner validation E-04 is open. Everything in sections 4 and 5 is ordered by inference. | `board-redesign/verification.md` E-04 | Run the two-task validation after M3 rather than after M7: one real code card and one real document card, owner and one engineer, recorded where they stall. Reorder the slices if it says so. |
| P-02 | **The backlog is not where the collaboration guide says it is.** `collaboration.md` says every piece of work starts as a GitHub issue and describes labels and a project board; the repository has zero open issues, the labels were never created, and the work lives in plan documents. | GitHub issues list on 2026-11-08; `collaboration.md` | Either create the issues and labels (the guide has the commands) or change the guide to say the plans are the backlog. A second developer cannot "pick the lowest unclaimed slice" from a document nobody updates on claim. |
| P-03 | **Agent runs work on one platform.** Sandbox confinement is qualified on WSL2 only; macOS startup is unverified; the dev container cannot run agents. | `status.md`; ADR 0021 | Qualify native Linux next (the dev container and CI can then run a real agent), then macOS. Each is its own change record with the ADR 0021 suite. |
| P-04 | **"Small teams" cannot share an instance.** Tenancy and invitations are in the API; `deploy/` is a placeholder; passkeys bind to an origin. | `status.md`; `deploy/` | A documented single-server deployment behind TLS with a stable origin, before any hosted offer. |
| P-05 | **Browser tests are not in CI.** The axe scans and Playwright specs run by hand; `phase3-exit.spec.ts` has a known failure; Firefox and WebKit are unrun. | `ci.yml`; `status.md` | Add a Chromium Playwright job for the board specs to CI (a workflow change, so it needs a second maintainer). Fix or retire the phase3-exit failure. |
| P-06 | **Documents drift from the code.** The command inventory was behind by four commands (fixed in this record); `CONTRIBUTING.md` still says outside contributions open "after Phase 1" when the plan is in Phase 6. | `status.md` before this record; `CONTRIBUTING.md` | Make `generate_command_inventory.py --check` a CI step; refresh `CONTRIBUTING.md`. |
| P-07 | **No release, version or changelog.** Everything is `main`; there is no tag, no changelog, no way to say which build a record was made on. | Repository tags | Tag a `v0.1.0-alpha` from `main`, keep a `CHANGELOG.md` per slice, and print the version in the app's sign-in page and the API's health endpoint. |
| P-08 | **Dependency holds are growing.** Five bumps held for coordinated changes (wasm-bindgen, mise-action, @types/node, jsdom, typescript 7). | `collaboration.md` | Schedule the jsdom and wasm-bindgen moves; close the others with the Dependabot ignore comment so they stop returning. |
| P-09 | **A stale draft pull request** (#69, a pattern note and a CI timeout checker not wired in) sits open with no owner decision. | Open pull requests on 2026-11-08 | Decide: wire it in, or close it with a note. |

## 7. Where Control Rod should not follow the field

These are features the named competitors have and this product should keep refusing, each with its reason on the record.

- **Dragging a card to a new column.** Status is a signed decision, not a mouse movement (workbench design P6).
- **Agents talking to agents in a "hive".** The checker's independence depends on never seeing the author's transcript.
- **Cron "autopilots" that start work on their own.** No run without a signed release. A scheduled release signed in advance for a bounded scope would be the honest form of this, and is an owner decision.
- **A confident dollar figure.** Until a runtime reports cost, the line says "cost not reported".
- **Telemetry on by default.** Nothing phones home.
- **A dependency on the vendor's cloud for local use.** The passkey is the account.

## 8. Roadmap

Ordered by the ranking in sections 5 and 6, within the board redesign's slice rule (one slice, one pull request, one change record).

| When | What | Why first |
|---|---|---|
| **Now (this record)** | Slice M4 quick add and capture cards; command inventory regenerated; this analysis. | The home screen could not take in work. |
| **Next** | M3 act from the board (G-01); M2 lenses (G-02); then the owner validation (P-01) with two real tasks. | The two most frequent daily actions, then a real test before the deeper slices. |
| **Then** | M5 Activity tab with the fast next-run note (G-03, G-09); G-10 collapse old Accepted; G-12 shortcuts; P-05 browser tests in CI; P-06 inventory check in CI; P-02 backlog decision. | Reviewers' daily view, and cheap wins the field has already paid for. |
| **After** | M6 code review and G-04 pull request out; M7 document review; G-06 local runtime for the restricted lanes; G-07 Compose install; P-03 Linux then macOS qualification. | The last mile for code, the moat for documents, and the two adoption blockers. |
| **Later** | M8 visual pass (G-11); G-05 notifications and chat bridges; G-08 packs; P-04 single-server deploy; tracker import; evidence export (ADR 0009); revisit ADR 0020 steering with validation data. | Each needs an owner decision or a parked item unparked. |

**Owner decisions requested:** (1) run the owner validation after M3 instead of after M7; (2) whether the backlog lives in GitHub issues or in the plans (P-02); (3) whether a local-model runtime (G-06) may be scoped before M6 and M7, since it unblocks the restricted lanes; (4) whether to tag a first alpha (P-07).

## 9. Not claimed

This analysis makes no compliance, certification or safety claim. Competitor capabilities are as their READMEs and third-party coverage described them on the dates given, untested here. The ranking is the author's judgment over the evidence cited; the owner validation in P-01 is the test of it.
