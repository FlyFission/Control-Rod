# Kanban OSS evidence for Control Rod board design

Gathered 2026-11-05 with `gh` (read only, nothing run from any clone) plus one web search. Method and honesty notes first, then verdicts B1 to B8.

## Method and limits (read first)

- "Reactions" below is the sum of all reaction types on the issue body (`reactionGroups`, mostly thumbs up). It is a demand proxy, not a vote count. Comment counts are shown where the thread itself is the evidence.
- Demand on these trackers is small in absolute terms. Board-mechanics requests (WIP limits, aging, quick add) mostly sit at 0 to 13 reactions. Integrations, auth and mobile requests sit at 40 to 134. That gap is itself a finding: users of small-team boards ask loudly for plumbing and quietly for mechanics, and they complain loudly (by comment volume) when a mechanic regresses.
- GitHub issue search treats `OR` loosely, so topical lists were checked by reading titles, not trusted blindly. Thread excerpts were read for every item quoted as evidence.
- Linear has no public issue tracker. A web search confirmed only that `C` opens the create modal and Cmd/Ctrl+Enter saves ([Linear docs](https://linear.app/docs/creating-issues)); it found nothing on natural-language dates or card display options. Linear is therefore not used as evidence.
- Not covered: Trello, Jira, Asana forums (closed source, outside the brief), and taiga-front (AGPL-3.0, 385 stars, quiet; taiga-back is MPL-2.0, 858 stars, top issue has 6 reactions, so Taiga adds almost no demand signal).

## Repositories surveyed

| Repo | License (GitHub) | Stars | Reuse posture | Board DnD library |
|---|---|---|---|---|
| makeplane/plane | AGPL-3.0 | 62k | ideas only | `@atlaskit/pragmatic-drag-and-drop` (+ auto-scroll, hitbox) |
| plankanban/planka | NOASSERTION (source-available) | 12.7k | ideas only | `react-beautiful-dnd` ^13.1.1 |
| wekan/wekan | MIT | 21k | reusable | `jquery-ui` sortable + `@rwap/jquery-ui-touch-punch` |
| kanboard/kanboard | MIT | 9.9k | reusable | jQuery UI sortable, wrapped in `assets/js/src/BoardDragAndDrop.js` |
| mattermost-community/focalboard | NOASSERTION (mixed; verify per directory) | 26.5k | unverified, treat as ideas only | `react-beautiful-dnd` plus `react-dnd` (html5 and touch backends) |
| hcengineering/platform (Huly) | EPL-2.0 | 28k | file-level copyleft, ideas only | custom Svelte (`plugins/task-resources/.../kanban`) |
| taigaio/taiga-back, taiga-front | MPL-2.0 back, AGPL-3.0 front | 0.9k, 0.4k | ideas only | `dragula` (front) |
| toeverything/AFFiNE | NOASSERTION | 74k | ideas only | `@atlaskit/pragmatic-drag-and-drop` (bumped to v2 in [#15394](https://github.com/toeverything/AFFiNE/pull/15394)) |
| go-vikunja/vikunja | AGPL-3.0 | 6k | ideas only | n/a (not read) |

Note the library drift: react-beautiful-dnd (Planka, Focalboard) is the legacy Atlassian library; Plane and AFFiNE are on its successor, Atlassian's pragmatic-drag-and-drop. Plane's current board work ([#8032](https://github.com/makeplane/plane/pull/8032), merged 2025-10-29, "base layouts for kanban and list with drag-and-drop support") and its perf fix ([#9827](https://github.com/makeplane/plane/pull/9827), isolate kanban delete-drop-zone) are on the new one.

---

## B1 Quick card creation

**Verdict: inline add at the foot (and head) of each column, one keystroke to create, title only at creation, data never lost on blur. Evidence strength: MODERATE (behavioral, from regressions and bug threads; low reaction counts).**

Evidence:
- The strongest signal is a removal that users reverted. Wekan v8.25 moved the `+` add-card button into a swimlane/list menu to reduce clutter. Users reported minutes spent finding how to add a card and said add-card and drag are the most used actions. The maintainer reversed course within a day and added "+ Add Card" at the bottom of the list. Thread: [wekan #6108](https://github.com/wekan/wekan/issues/6108) (24 comments, closed). Related regression noise in the same thread: lost list widths.
- Typed text discarded when clicking away from the add field, reported independently in three trackers: [planka #1729](https://github.com/plankanban/planka/issues/1729) (2026-07, open), [wekan #558](https://github.com/wekan/wekan/issues/558), [huly #163](https://github.com/hcengineering/platform/issues/163) ("do not close create card on click outside").
- Multi-add: [wekan #6714](https://github.com/wekan/wekan/issues/6714) asks to offer creating several cards when pasted text has multiple lines (references the earlier #4501); [kanboard #2235](https://github.com/kanboard/kanboard/issues/2235) (4) bulk sub-task creation; [wekan #938](https://github.com/wekan/wekan/issues/938) bulk checklist entries. Demand exists but is small; paste-a-list is the shape users describe.
- Where the card lands: new card on top ([planka #1260](https://github.com/plankanban/planka/issues/1260), [wekan #6571](https://github.com/wekan/wekan/issues/6571)); inheriting the active filter so the new card does not vanish ([planka #1663](https://github.com/plankanban/planka/issues/1663), [#808](https://github.com/plankanban/planka/issues/808)). Planka merged the fix: [planka PR #1680](https://github.com/plankanban/planka/pull/1680) "inherit active board filters when creating a card" (2026-09-17). Design implication: a card created under a filter must still be visible, or the user thinks the add failed.
- Open on create vs stay inline: [focalboard #364](https://github.com/mattermost-community/focalboard/issues/364) "automatically open new card for editing" (11 comments, closed); Tab between fields in new card ([focalboard #456](https://github.com/mattermost-community/focalboard/issues/456)); remember previously entered data ([wekan #810](https://github.com/wekan/wekan/issues/810)).
- Fields wanted at creation: the issues found ask for assignee, due date, labels and custom fields at creation, mostly via API ([planka #1155](https://github.com/plankanban/planka/issues/1155), merged as [PR #1233](https://github.com/plankanban/planka/pull/1233)), and Wekan shipped add-card text parsing that turns `[Text]` into labels, which users then asked to make optional ([wekan #6810](https://github.com/wekan/wekan/issues/6810)). That is a warning: inline syntax magic must be opt in or visibly previewed.
- Natural-language dates: no board repo has a meaningful request. Only [wekan #6397](https://github.com/wekan/wekan/issues/6397) (AI card generation, 0 reactions). The one tracker with the feature, Vikunja "Quick Add Magic", shows its edge cases as the requests: localized date formats ([vikunja #492](https://github.com/go-vikunja/vikunja/issues/492)), use when editing ([#514](https://github.com/go-vikunja/vikunja/issues/514)), default due time ([#1907](https://github.com/go-vikunja/vikunja/issues/1907)). Evidence is too thin to call natural-language dates a must; call it a later, previewed enhancement.
- Keyboard create: keyboard shortcuts are requested ([planka #23](https://github.com/plankanban/planka/issues/23), 4 reactions, 19 comments) and extended after the fact ([planka #1763](https://github.com/plankanban/planka/issues/1763), [wekan #1878](https://github.com/wekan/wekan/issues/1878), 31 comments). Kanboard removed a quick sub-task field to "simplify the UI" and kept a keyboard shortcut `s` as the substitute ([kanboard #2181](https://github.com/kanboard/kanboard/issues/2181)), which the reporter accepted.

Control Rod consequence: title-only inline add, Enter to commit and stay open for the next card, paste-multiline offers "create N cards", draft preserved on blur, created card always visible regardless of filter, other fields set after creation. Agent-drafted cards will mostly arrive via API, so the creation API should accept all fields (Planka needed a PR for that).

## B2 Card face density

**Verdict: a small fixed core on the face (title, assignee, due/state badge, blocked flag, review status), everything else opt in per board, with progress badges rather than raw detail. Evidence strength: MODERATE-WEAK (many small requests, no large reaction counts).**

Evidence:
- Users ask for more on the face, not less: checklist items or subtasks on the card front ([wekan #2984](https://github.com/wekan/wekan/issues/2984), 10), description on minicard ([wekan #4328](https://github.com/wekan/wekan/issues/4328), 24 comments; maintainer quoted a 500 euro funding figure), card color ([wekan #428](https://github.com/wekan/wekan/issues/428), 10), show ID/number on each card ([focalboard #624](https://github.com/mattermost-community/focalboard/issues/624), 10), count per list ([planka #1664](https://github.com/plankanban/planka/issues/1664), merged work), count and numeric sum in list head ([wekan #3796](https://github.com/wekan/wekan/issues/3796), 34 comments), story points ([planka #1061](https://github.com/plankanban/planka/issues/1061)).
- Users also ask to hide things: Vikunja "make task id less prominent in kanban" ([vikunja #1436](https://github.com/go-vikunja/vikunja/issues/1436), 5); Focalboard hide properties on cards ([#3319](https://github.com/mattermost-community/focalboard/issues/3319)); Kanboard "too many font sizes" ([#2024](https://github.com/kanboard/kanboard/issues/2024), 4); Wekan new card sections with no board toggle ([#6688](https://github.com/wekan/wekan/issues/6688)); Plane wants blockers shown or highlighted on the card ([#4771](https://github.com/makeplane/plane/issues/4771), 5).
- Density complaint pattern: clutter leads to hiding, and hiding leads to lost speed (see Wekan #6108 under B1, and [wekan #5975](https://github.com/wekan/wekan/issues/5975) Unicode icon toggle, 4 reactions, 16 comments).
- Hover-only controls draw bug reports ([planka #1446](https://github.com/plankanban/planka/issues/1446) edit icon invisible until hover; [planka #1434](https://github.com/plankanban/planka/issues/1434) tooltips for icon buttons, merged [PR #1685](https://github.com/plankanban/planka/pull/1685)).
- Plane performance with rich cards: [plane #9892](https://github.com/makeplane/plane/issues/9892) reports list/spreadsheet layouts at 4 to 6 fps with 10k items; [#5115](https://github.com/makeplane/plane/issues/5115) (12, 29 comments) slow board loads; [kanboard #4389](https://github.com/kanboard/kanboard/issues/4389) board SQL explosion. Face density has a cost that shows at scale, so windowing matters.

## B3 Drag and drop

**Verdict: use a maintained headless DnD library (pragmatic-drag-and-drop is the current choice of Plane and AFFiNE), and ship a non-drag move path (menu "Move to column" and keyboard) from day one. Evidence strength: STRONG on the library drift and on the need for a keyboard path; WEAK on any single perf number.**

Libraries: see table above. Two of the surveyed boards still use the legacy react-beautiful-dnd; two large React codebases are on pragmatic-drag-and-drop.

Accessibility and keyboard:
- [wekan #459](https://github.com/wekan/wekan/issues/459) "Accessible drag-and-drop" (screen reader user; 53 comments; closed). The reporter's own proposal: Move up/Move down controls with aria-labels, visible to screen readers, as the first implementation.
- [kanboard #1058](https://github.com/kanboard/kanboard/issues/1058) asked for arrow keys to move focus between tasks and shift+arrow to move a task; auto-closed for inactivity after two years, i.e. never built.
- [focalboard #29](https://github.com/mattermost-community/focalboard/issues/29), [#27](https://github.com/mattermost-community/focalboard/issues/27), [#30](https://github.com/mattermost-community/focalboard/issues/30) keyboard support for board, card dialog and table views, all still open with 1 reaction each.
- [plane #1154](https://github.com/makeplane/plane/issues/1154) screen readers have a hard time with the UI (open, 9 comments).
- [planka #1751](https://github.com/plankanban/planka/issues/1751) asks for hotkeys and spacebar for assignment.
- Result: nobody surveyed ships a keyboard drag on the board. That is an open gap, not a proven demand number, so treat it as a quality bar rather than a request count.

Bugs and regressions:
- Hit area and scroll: [kanboard #3160](https://github.com/kanboard/kanboard/issues/3160) scroll while dragging; [planka #252](https://github.com/plankanban/planka/issues/252) drop hitbox should fill the page (4); [huly #4815](https://github.com/hcengineering/platform/issues/4815) scroll does not work while dragging; [huly #9536](https://github.com/hcengineering/platform/issues/9536) drop target too narrow for empty status blocks (closed).
- Touch: [kanboard #4302](https://github.com/kanboard/kanboard/issues/4302) bigger drag handle for touchscreens; [plane #6240](https://github.com/makeplane/plane/issues/6240) cannot drag on a Windows tablet.
- Handle vs whole card: Wekan restricted dragging to a small icon in 3.40 and users objected ([wekan #2704](https://github.com/wekan/wekan/issues/2704), 27 comments, closed in 3 days). Whole-card drag is the expectation.
- Persistence and ordering: [kanboard #2681](https://github.com/kanboard/kanboard/issues/2681) reorder inside a column jumps (49 comments); [kanboard #5113](https://github.com/kanboard/kanboard/issues/5113) heavy UI reflow, slow drag on a busy board; [plane #9049](https://github.com/makeplane/plane/issues/9049) optimistic drag silently no-ops under certain filters; [wekan PR #6199](https://github.com/wekan/wekan/pull/6199) cards disappearing after dragging in list view; [wekan #2105](https://github.com/wekan/wekan/issues/2105) card undraggable after resize.
- Dragging in the presence of a filter is the recurring failure family (Plane #9049, Wekan #6199, Planka #1663). Test that case.

## B4 WIP limits, swimlanes, blocked state, card aging

**Verdict: swimlanes and blocked state are worth building early (real, repeated demand); WIP limits are cheap to add but low demand (soft, visual, per column); card aging is a soft, optional visual cue. Evidence strength: swimlanes STRONG, blocked MODERATE, WIP WEAK-to-MODERATE, aging WEAK.**

- Swimlanes: [wekan #955](https://github.com/wekan/wekan/issues/955) (42, closed, the original driver of Wekan's row feature); [planka #92](https://github.com/plankanban/planka/issues/92) (13), [#455](https://github.com/plankanban/planka/issues/455) (7), [#1307](https://github.com/plankanban/planka/issues/1307) (5); kanboard has them natively and the demand moved to variants: different columns across swimlanes ([#2831](https://github.com/kanboard/kanboard/issues/2831), 6), collapse/expand all ([#2179](https://github.com/kanboard/kanboard/issues/2179), 3), WIP counted across swimlanes ([#861](https://github.com/kanboard/kanboard/issues/861)). Plane has only grouping asks ([#8549](https://github.com/makeplane/plane/issues/8549), 5). Swimlane complexity cost: Wekan bugs where list view assigns cards to archived swimlanes ([#1971](https://github.com/wekan/wekan/issues/1971)) and cards vanishing on swimlane moves ([#6137](https://github.com/wekan/wekan/issues/6137)).
- WIP limits: [plane #5129](https://github.com/makeplane/plane/issues/5129) (1); [focalboard #3158](https://github.com/mattermost-community/focalboard/issues/3158) (3) and [#329](https://github.com/mattermost-community/focalboard/issues/329) (1); [wekan #2380](https://github.com/wekan/wekan/issues/2380) per-swimlane WIP (4), [#2489](https://github.com/wekan/wekan/issues/2489) shared WIP across columns; Kanboard supports column limits and users asked for variants (per swimlane [#954](https://github.com/kanboard/kanboard/issues/954), per assignee [#1584](https://github.com/kanboard/kanboard/issues/1584), shared across columns [#1684](https://github.com/kanboard/kanboard/issues/1684), enforcer [#3095](https://github.com/kanboard/kanboard/issues/3095)). Read: demand is tiny where it does not exist, and where it exists users immediately want scoping variants. Ship a per-column soft limit; defer scoped variants. Vikunja has bucket limits as a model.
- Blocked: [plane #4771](https://github.com/makeplane/plane/issues/4771) (5) highlight blocked issues and blockers; [plane #3137](https://github.com/makeplane/plane/issues/3137) (9) find workable issues from blockedBy; [kanboard #5635](https://github.com/kanboard/kanboard/issues/5635) text-based blockers; [planka #622](https://github.com/plankanban/planka/issues/622) (6) task relations. Users want blocked as a visible card state plus a queryable relation, not just a label.
- Aging: [planka #685](https://github.com/plankanban/planka/issues/685) RFC for card aging as visual management (0 reactions, from a Scrum Master/PO); [wekan #3984](https://github.com/wekan/wekan/issues/3984) visual card aging; [kanboard #4915](https://github.com/kanboard/kanboard/issues/4915) darker shade after long inactivity; Kanboard already shows task age and days in column and users asked to toggle that display ([#741](https://github.com/kanboard/kanboard/issues/741)). Cumulative flow and lead/cycle time exist in Kanboard with only small refinement requests ([#1775](https://github.com/kanboard/kanboard/issues/1775), [#4503](https://github.com/kanboard/kanboard/issues/4503)).

## B5 Real-time multi-user updates and conflicts

**Verdict: push updates over a socket, last-writer-wins at card-field granularity with visible "changed by X" cues, and per-field merge or version check for long text; never whole-document silent overwrite. Evidence strength: MODERATE (architecture split is verified in code; conflict pain is documented in Plane and Huly).**

Architecture, verified from repo files:
- Planka: Sails with `sails-hook-sockets` and client `socket.io-client` (live by design).
- Wekan: Meteor (live by design; bugs show as observer errors, e.g. [wekan #5685](https://github.com/wekan/wekan/issues/5685)).
- Focalboard: websocket client (`webapp/src/wsclient.ts`); failure reports e.g. [#1844](https://github.com/mattermost-community/focalboard/issues/1844) auto refresh fails, [#2183](https://github.com/mattermost-community/focalboard/issues/2183) websocket error behind a proxy.
- Kanboard: polling, `assets/js/src/BoardPolling.js`, refreshes on an interval and skips while a drag save is in flight; users report the auto-refresh quirks ([#2186](https://github.com/kanboard/kanboard/issues/2186), [#2464](https://github.com/kanboard/kanboard/issues/2464)), and ask for edit locking ([#944](https://github.com/kanboard/kanboard/issues/944)).
- Plane: boards are not live. Collaborative pages use Hocuspocus plus Yjs (`apps/live`), but work item views need a refresh: [#7944](https://github.com/makeplane/plane/issues/7944) real-time update (8), [#9779](https://github.com/makeplane/plane/issues/9779), [#8480](https://github.com/makeplane/plane/issues/8480), [#9249](https://github.com/makeplane/plane/issues/9249).
- AFFiNE: Yjs-based (BlockSuite); Huly: server-pushed with a reported data-loss case below.

Conflict pain:
- [plane #9995](https://github.com/makeplane/plane/issues/9995): two people on the same work item, last autosave silently overwrites the other, lost images; no warning, no merge. This is the exact failure Control Rod must avoid for engineering documents drafted by agents while humans edit.
- [huly #9191](https://github.com/hcengineering/platform/issues/9191) document edits removed by another collaborator; [huly #8720](https://github.com/hcengineering/platform/issues/8720) data removed by the system.
- [wekan #3114](https://github.com/wekan/wekan/issues/3114) card view stays open on mobile after the card was moved or removed by another client.
- [wekan #5813](https://github.com/wekan/wekan/issues/5813) and [plane #8192](https://github.com/makeplane/plane/issues/8192): concurrent API creation yields duplicate card numbers or sequence ids (assign numbers server side in a transaction).

## B6 Board versus list versus table views

**Verdict: board is home; add a list/table view with sort, filter and group, and a calendar before Gantt. Evidence strength: MODERATE (calendar/timeline demand clearly ranks above table/list in raw reactions; list demand shows up as follow-on polish).**

Reaction ranking by view, same trackers:
- Calendar: [wekan #808](https://github.com/wekan/wekan/issues/808) (25, 57 comments); [planka #144](https://github.com/plankanban/planka/issues/144) (26), [#623](https://github.com/plankanban/planka/issues/623) (18), [#1064](https://github.com/plankanban/planka/issues/1064) (12); [focalboard #338](https://github.com/mattermost-community/focalboard/issues/338) (18), [#2505](https://github.com/mattermost-community/focalboard/issues/2505) (22), CalDAV/feed [#3184](https://github.com/mattermost-community/focalboard/issues/3184) (39); [wekan #2836](https://github.com/wekan/wekan/issues/2836) CalDAV/iCal (26); [plane #4131](https://github.com/makeplane/plane/issues/4131) gantt, kanban and calendar for global view (13); [vikunja #1364](https://github.com/go-vikunja/vikunja/issues/1364) (11).
- Gantt/timeline: [focalboard #662](https://github.com/mattermost-community/focalboard/issues/662) (35); [planka #57](https://github.com/plankanban/planka/issues/57) (12); [plane #3051](https://github.com/makeplane/plane/issues/3051) (13); [huly #5268](https://github.com/hcengineering/platform/issues/5268) (10), and Huly shipped one ([PR #10992](https://github.com/hcengineering/platform/pull/10992), 2026-08-27, Gantt for the tracker).
- List/table: low reactions. [planka #1503](https://github.com/plankanban/planka/issues/1503) (1), [#131](https://github.com/plankanban/planka/issues/131) (2); [wekan #1862](https://github.com/wekan/wekan/issues/1862) table view (5); [kanboard #2072](https://github.com/kanboard/kanboard/issues/2072) quick edit in list (4), [#2531](https://github.com/kanboard/kanboard/issues/2531); [vikunja #1729](https://github.com/go-vikunja/vikunja/issues/1729) sorting in list (6); [plane #6868](https://github.com/makeplane/plane/issues/6868) table column width and reorder (4). After Planka added list view, the follow-ups arrived within days and were merged: filter by status ([PR #1648](https://github.com/plankanban/planka/pull/1648)) and re-order in list ([PR #1649](https://github.com/plankanban/planka/pull/1649)), both 2026-09-17. Wekan table view then drew regressions: filters ignored ([#6629](https://github.com/wekan/wekan/issues/6629)), sort removed ([#6633](https://github.com/wekan/wekan/issues/6633)).
- Cross-board "all my work": [plane #1174](https://github.com/makeplane/plane/issues/1174) all issues view (13); [planka #1139](https://github.com/plankanban/planka/issues/1139) task dashboard (15); [wekan #2469](https://github.com/wekan/wekan/issues/2469) multi-board calendar (8).
- Pattern: one data model, several projections, with filters shared across projections (filters not applying to a view is a repeat bug: Wekan #6629, Plane #9049).

## B7 Most hated regressions and redesigns, and what got reverted

**Evidence strength: STRONG for the pattern; counts are small but comment volume and speed of reversal are objective.**

| What changed | Where | Outcome |
|---|---|---|
| Add-card `+` moved into menus ("less always visible buttons", v8.25) | Wekan [#6108](https://github.com/wekan/wekan/issues/6108) | Reversed within a day; "+ Add Card" restored at list foot |
| Drag restricted to a small handle | Wekan [#2704](https://github.com/wekan/wekan/issues/2704) | Reported 13 Sep 2019, closed in 3 days |
| List width hardcoded to 240px, adjust-width options removed | Wekan [#6682](https://github.com/wekan/wekan/issues/6682) | Restored in 11.64 per maintainer reply |
| Almost-due logic changed for start date | Wekan [#3766](https://github.com/wekan/wekan/issues/3766) | Fixed in [PR #3793](https://github.com/wekan/wekan/pull/3793) |
| Calendar and Gantt views broke in a release | Wekan [#6657](https://github.com/wekan/wekan/issues/6657) | Closed |
| Easy sub-task entry removed "to simplify the UI" | Kanboard [#2181](https://github.com/kanboard/kanboard/issues/2181) | Kept removed; keyboard shortcut offered, reporter accepted |
| Pro-features banner added to the UI | Planka [#1640](https://github.com/plankanban/planka/issues/1640) (13 reactions, 20 comments) | Partly reversed: banner shown to admins only after the next release |
| OIDC moved behind a paid tier in v2 | Plane [#8047](https://github.com/makeplane/plane/issues/8047) (22) | Not reversed; thread is hostile |
| Confusing "Free Plan / Upgrade" button on self-hosted | Plane [#4095](https://github.com/makeplane/plane/issues/4095) (13) | Closed |
| v2 breaking changes (private S3, new access rules, SSRF controls) | Planka [#1506](https://github.com/plankanban/planka/issues/1506) (11 reactions, 27 comments) | Shipped with upgrade notes |
| Categories in board switcher | Focalboard [#3702](https://github.com/mattermost-community/focalboard/issues/3702) | Revert requested for 7.3 |
| Maintainers leave | Focalboard [#4875](https://github.com/mattermost-community/focalboard/issues/4875) (14), Huly [#11033](https://github.com/hcengineering/platform/issues/11033) "is the project dead?" | Trust cost, no revert |
| Whole-UI design-system swap (Propel) | Plane [PR #10038](https://github.com/makeplane/plane/pull/10038) merged 2026-11-02, with a QA follow-up the next day ([#10178](https://github.com/makeplane/plane/pull/10178)) | Too new to judge; watch for fallout |

Lessons: removal of a frequent action from the surface is the most reliably punished change; ads or upsell inside a self-hosted tool draw the second most complaints; silent behavior changes to date and deadline logic get fixed quickly because they affect trust. Wekan's own thread contains the maintainer noting complaints in both directions (too complex, too cluttered), so "settle by evidence" means instrument and keep frequent actions one click away rather than polling opinions.

## B8 Top 20 most reacted feature requests, grouped by theme

Pooled from the top-60 lists of Plane, Planka, Wekan, Kanboard, Focalboard, Huly, Taiga and AFFiNE (Planka #627 "Roadmap" excluded as an announcement, Focalboard #99 "binaries" counted as packaging).

| # | Reactions | Request | Theme |
|---|---|---|---|
| 1 | 134 | [Plane GitLab integration #408](https://github.com/makeplane/plane/issues/408) | Git integrations |
| 2 | 110 | [Focalboard compiled desktop binaries #99](https://github.com/mattermost-community/focalboard/issues/99) | Distribution |
| 3 | 102 | [Plane Gitea #1495](https://github.com/makeplane/plane/issues/1495) | Git integrations |
| 4 | 98 | [Huly GitLab #6653](https://github.com/hcengineering/platform/issues/6653) | Git integrations |
| 5 | 80 | [Wekan LDAP #119](https://github.com/wekan/wekan/issues/119) | Auth |
| 6 | 79 | [Focalboard single page / wiki without board #166](https://github.com/mattermost-community/focalboard/issues/166) | Docs next to boards |
| 7 | 75 | [Focalboard mobile apps #160](https://github.com/mattermost-community/focalboard/issues/160) | Mobile |
| 8 | 71 | [AFFiNE self-hosted progress #5069](https://github.com/toeverything/AFFiNE/issues/5069) | Self-hosting |
| 9 | 66 | [Plane OIDC #413](https://github.com/makeplane/plane/issues/413) | Auth |
| 10 | 62 | [Plane custom fields #2865](https://github.com/makeplane/plane/issues/2865) | Custom fields |
| 11 | 57 | [Plane time tracking #1184](https://github.com/makeplane/plane/issues/1184) | Time tracking |
| 12 | 56 | [AFFiNE Notion-style columns #7479](https://github.com/toeverything/AFFiNE/issues/7479) | Layout |
| 13 | 52 | [Wekan Nextcloud #687](https://github.com/wekan/wekan/issues/687) | Integrations |
| 14 | 45 | [Wekan GitLab issues sync #109](https://github.com/wekan/wekan/issues/109) | Git integrations |
| 15 | 44 | [Huly Gitea #6950](https://github.com/hcengineering/platform/issues/6950) | Git integrations |
| 16 | 42 | [Wekan swimlanes #955](https://github.com/wekan/wekan/issues/955) | Board mechanics |
| 17 | 42 | [Focalboard link to another card #4850](https://github.com/mattermost-community/focalboard/issues/4850) | Card relations |
| 18 | 41 | [Plane recurring tasks #818](https://github.com/makeplane/plane/issues/818) | Recurrence |
| 19 | 40 | [Kanboard multiple users on one task #85](https://github.com/kanboard/kanboard/issues/85) | Multiple assignees |
| 20 | 39 | [Focalboard CalDAV/calendar feed #3184](https://github.com/mattermost-community/focalboard/issues/3184) | Calendar |

Theme totals across the top 60 per repo (approximate, by reading titles): Git and PM-tool integrations are the largest block (Plane 134+102, Huly 98+44+28+24, Wekan 45+36, Focalboard 22); auth (LDAP, OIDC, SAML) is second (Wekan 80, Plane 66+22, Planka 29, Focalboard 35); mobile and desktop clients third (Focalboard 75+110, Wekan 26+19, Planka 21); then calendar/Gantt, custom fields and time tracking, card relations and subtasks, recurrence, and multiple assignees. Board mechanics (swimlanes, WIP, aging, blocked) are present but sit mid-table or below.

Relevance to Control Rod: the git integration and self-host auth themes match a local-first team tool, but they are not board design questions. Within board design, the highest reacted items are swimlanes (42), card links/relations (42, plus Planka #522 and Plane/Planka relation asks), multiple assignees (40; relevant because agent plus human review per card), custom fields (62, 13, 13), recurring cards (41, 19), calendar (several at 18 to 39).

---

## Verdict summary

| Decision | Verdict | Strength |
|---|---|---|
| B1 quick create | Inline title-only add at column foot and head, Enter to chain, draft kept on blur, multiline paste offers N cards, always visible under filters; natural-language dates deferred | Moderate |
| B2 card face | Small fixed core plus per-board optional fields; progress badges; windowed rendering | Moderate to weak |
| B3 DnD | pragmatic-drag-and-drop; whole-card drag; menu and keyboard move path from day one; test drag under filters | Strong |
| B4 WIP etc. | Swimlanes yes; blocked as state plus relation yes; per-column soft WIP limit; aging as optional cue | Mixed (see above) |
| B5 real-time | Socket push; field-level last-writer-wins; version check or merge for long text; server-assigned numbers | Moderate |
| B6 views | Board home; list/table and calendar next; Gantt later; filters shared across views | Moderate |
| B7 regressions | Never demote a frequent action to a menu; no upsell in-product; keep date logic stable | Strong |
| B8 top asks | Integrations and auth dominate; board-specific top asks are swimlanes, relations, multi-assignee, custom fields, recurrence | Strong (as ranking), weak (as board guidance) |

## Directly reusable components (MIT only)

Pinned to the default branch head at time of reading. Re-verify the path at the SHA before copying; file contents were not read line by line for reuse quality, only located.

Wekan, MIT, `0c0288a6c5c331ff0e8d7d4f85e9f5caee4c2c55`:
- `client/components/cards/minicard.jade`, `minicard.js`, `minicard.css` (card face; Meteor/Blaze templating, so only logic and CSS are portable)
- `client/components/lists/listBody.js`, `listBody.jade` (inline add-card)
- `client/components/swimlanes/swimlanes.js`, `swimlaneHeader.js` (swimlane rows)
Caveat: Meteor/Blaze and jQuery UI; porting to a React or Svelte stack means reimplementing behavior, not importing files. Wekan also carries "paid features" language in issue threads; check that no file you copy is outside the MIT grant.

Kanboard, MIT, `2ddb31bf72d355727d0639fc3423630f3bae1a9c`:
- `assets/js/src/BoardPolling.js` (polling that skips refresh while a drag save is in flight; small, ideal reference)
- `assets/js/src/BoardDragAndDrop.js`, `Swimlane.js`, `Column.js`, `Task.js`, `BoardCollapsedMode.js`
- `app/Template/board/task_public.php`, `task_private.php`, `table_column.php`, `table_swimlane.php`, `table_tasks.php` (card face and column structure, PHP templates)
- `app/Controller/BoardAjaxController.php`, `app/Model/ColumnModel.php` (column task limit model)
Caveat: jQuery and PHP; the value is the data model (column limits, swimlanes, task age) and the polling guard, not copy-paste.

Not reusable directly: Plane, Planka, Vikunja, AFFiNE (AGPL or source-available), Huly (EPL-2.0 file-level copyleft), Focalboard (license mixed, not confirmed), Taiga front (AGPL). Use as idea sources only. For code, the libraries themselves are the reusable component: Atlassian pragmatic-drag-and-drop (Apache-2.0 per its public repository; verify before adoption).
