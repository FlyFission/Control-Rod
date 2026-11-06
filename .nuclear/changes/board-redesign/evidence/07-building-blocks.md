# 07 Building blocks for the Control Rod board redesign

Date of evidence: 2026-11-05/06. Method: npm registry (license, latest publish, peer deps), api.npmjs.org (weekly downloads, last week), bundlephobia (minified and gzip of the whole package entry, see caveat), GitHub API (LICENSE file, release, issue counts, top open issues by reactions via `sort:reactions-desc`). Nothing was installed. The raw gather output is in /tmp/crb/out.txt (not committed).

Caveats that apply everywhere:
- Bundlephobia sizes are for the package barrel entry. Tree-shaken use is smaller (icons, Radix, Base UI) and a few entries report nonsense (pragmatic-drag-and-drop 174 B, fontsource 1.8 kB). Treat them as an upper bound, not a budget.
- Issue counts are GitHub search counts. "Closed 90d" means closed since 2026-08-05. Atlassian and ProseMirror triage off GitHub or archive it, so their zero counts mean nothing.
- "a11y open" is a keyword search (accessibility OR a11y OR screen reader) of open issues, a rough signal only.
- The app is React 19.3.1 (apps/web/package.json). Every pick below declares a peer range that includes React 19 unless noted.
- Repo rule: permissive only. Every pick was checked against its LICENSE text or package.json, noted per row.

## What apps/web already uses

From /home/flyfission/worktrees/control-rod-signin/apps/web/package.json and src:

| Area | Current state |
|---|---|
| Framework | React 19.3.1, Vite 8, TanStack Router and Query (all kept) |
| Markdown | react-markdown 10.1.0 (kept; pick 5 builds on it) |
| Dialogs, command palette | Hand written. `src/components/CommandPalette.tsx` (186 lines) and `src/features/office/Scram.tsx` roll their own focus handling |
| Fonts | Inter variable (`public/fonts/InterVariable.woff2`, preloaded) and JetBrains Mono 400/500/600, self hosted, via `--sans` and `--mono` in `src/design/tokens.css` |
| A11y testing | `@axe-core/playwright` is already a dev dependency (use it to gate every pick below) |
| Not present | Drag and drop, icon library, toast library, virtualization, motion library, diff view, PDF or DOCX viewers |

## Summary of picks

| # | Need | Pick | License | Already used |
|---|---|---|---|---|
| 1 | Board DnD with keyboard | @dnd-kit/core + @dnd-kit/sortable (classic), revisit @dnd-kit/react at 1.0 | MIT | No |
| 2 | A11y primitives | Base UI (@base-ui/react), styled with plain CSS | MIT | No |
| 3 | Command palette | Keep the existing domain logic; swap the shell to Base UI Dialog + Autocomplete. cmdk is the fallback | MIT | Hand rolled today |
| 4 | Diff and review | @pierre/diffs | Apache-2.0 | No |
| 5 | Document review | pdfjs-dist + react-pdf (PDF), ProseMirror/Tiptap core + own mark schema + prosemirror-suggest-changes (rich text), react-markdown source positions (Markdown), docx-preview (DOCX) | Apache-2.0, MIT, MIT, Apache-2.0 | react-markdown yes |
| 6 | Virtual lists | @tanstack/react-virtual | MIT | TanStack family yes |
| 7 | Motion | Plain CSS transitions and View Transitions; @formkit/auto-animate for non-DnD lists; skip Motion for now | MIT | No |
| 8 | Toasts | sonner (Base UI Toast is the fallback) | MIT | No |
| 9 | Icons | lucide-react | ISC | No |
| 10 | Fonts | Keep Inter + JetBrains Mono | OFL-1.1 | Yes |

---

## 1. Board drag and drop with keyboard support

| | @dnd-kit/core 6.3.1 + sortable 10.0.0 | @dnd-kit/react 0.5.3 | Atlassian pragmatic-dnd 4.0.0 | @hello-pangea/dnd 18.0.1 |
|---|---|---|---|---|
| License (LICENSE file) | MIT | MIT | Apache-2.0 (GitHub shows NOASSERTION, file text is Apache 2.0) | Apache-2.0 (file, Atlassian lineage) |
| Latest publish | 2024-12-05 | 2026-10-31 | 2026-09-24 | 2025-02-09 |
| Weekly downloads | 41.8M (+40.4M sortable) | 2.7M | 2.6M | 4.9M |
| Gzip | 14.2 kB (+3.7 kB sortable) | 33.2 kB | tiny core (bundlephobia says 174 B, unreliable; Atlassian markets about 5 kB) | 28.8 kB |
| Keyboard and screen reader | KeyboardSensor, live region announcements, aria-describedby instructions built in | Same model, rewritten | None built in: it uses native HTML5 drag. You must build a keyboard path yourself | Built in: Space to lift, arrows to move, announcements |
| React 19 | peer >=16.8 | peer ^18 or ^19 | no peer deps; open issue "Support React 19" (#181, 46 reactions) | peer ^18 or ^19 |
| Issues (open / opened 90d / closed 90d) | 93 / 18 / 12 (shared repo) | same repo | 96 / 2 / 0 (Atlassian triages elsewhere) | 71 / 1 / 1 |

Serious known issues:
- dnd-kit: [#1940 removeChild error in multiple sortable lists](https://github.com/clauderic/dnd-kit/issues/1940), [#1564 @dnd-kit/react source and target identical in onDragEnd](https://github.com/clauderic/dnd-kit/issues/1564), [#2088 jitter with variable height items](https://github.com/clauderic/dnd-kit/issues/2088). A11y: [#1952 announcements stop updating after a move](https://github.com/clauderic/dnd-kit/issues/1952), [#1634 handles ignore aria-describedby in Firefox](https://github.com/clauderic/dnd-kit/issues/1634).
- pragmatic: [#181 React 19](https://github.com/atlassian/pragmatic-drag-and-drop/issues/181), [#27 package exports](https://github.com/atlassian/pragmatic-drag-and-drop/issues/27), [#116 shadow DOM](https://github.com/atlassian/pragmatic-drag-and-drop/issues/116).
- hello-pangea: [#32 horizontal scroll with vertical scroll, 44 reactions](https://github.com/hello-pangea/dnd/issues/32) (this is exactly the kanban layout: a horizontally scrolling board of vertically scrolling columns), [#432 gap in flexbox](https://github.com/hello-pangea/dnd/issues/432), [#424 flicker with react-query](https://github.com/hello-pangea/dnd/issues/424), [#927 drag broken in virtual list on touch](https://github.com/hello-pangea/dnd/issues/927).

Pick: **@dnd-kit/core with @dnd-kit/sortable (classic)**. It is the only candidate that combines built-in keyboard dragging with screen reader announcements, a documented multi-container kanban pattern, and no dependency on the browser's HTML5 drag, which matters because the board will virtualize long columns (pick 6) and the pragmatic model and hello-pangea both have trouble there. hello-pangea has the best out of the box kanban keyboard story but is effectively in maintenance mode (one release in the last 20 months) and its open scroll issue hits our layout directly; pragmatic gives you no keyboard drag at all. The classic packages are stable but have not published since December 2024, while the author's active work is the pre-1.0 @dnd-kit/react (released days ago, 0.5.x, still has an onDragEnd correctness bug), so pin classic now and re-evaluate @dnd-kit/react at 1.0. Whichever library is used, ship a non-drag "Move to column" menu on every card: WCAG 2.2 SC 2.5.7 requires a single pointer alternative to dragging, and agent-driven moves need the same code path anyway. Verify with axe plus a keyboard-only Playwright test before accepting.

Evidence: https://github.com/clauderic/dnd-kit , https://github.com/atlassian/pragmatic-drag-and-drop , https://github.com/hello-pangea/dnd , `gh issue list --repo clauderic/dnd-kit --search "sort:reactions-+1-desc"`.

---

## 2. Accessible primitives (dialog, menu, popover, tooltip, combobox)

| | radix-ui 1.8.1 | react-aria-components 1.22.1 | @base-ui/react 1.9.0 | @ariakit/react 0.4.42 |
|---|---|---|---|---|
| License | MIT (WorkOS) | Apache-2.0 | MIT | MIT per package.json (no root LICENSE file found by API; verify the text before adoption) |
| Latest publish | 2026-10-12 | 2026-10-09 | 2026-10-09 | 2026-10-14 |
| Weekly downloads | 26.1M | 8.5M | 27.4M | 2.0M |
| Gzip (whole entry; tree shaking applies) | 74 kB | 279 kB | 166 kB | 66 kB |
| React 19 | yes (^16.8 to ^19 peer) | yes | yes (1.x stable) | yes |
| Has dialog, menu, popover, tooltip | yes | yes | yes | yes |
| Combobox or autocomplete | **No combobox primitive** in the radix-ui package (dependency list has none) | ComboBox, Autocomplete | Combobox, Autocomplete | Combobox |
| Also ships | toast, select, tabs | date, tables, drag and drop | toast, drawer, number field, OTP field | tabs, menu bar |
| Issues (open / opened 90d / closed 90d) | 134 / 46 / 100 | 539 / 159 / 143 | 315 / 160 / 161 | 46 / 300 / 288 |
| Open a11y keyword hits | 12 | 59 | 23 | 20 |
| Styling | unstyled, data attributes | unstyled, data attributes and render props | unstyled, data attributes | unstyled |

Serious known issues:
- Radix: [#1159 scrolling when a Popover is inside a Dialog, 92 reactions](https://github.com/radix-ui/primitives/issues/1159), [#2248 tooltip inside popover opens on focus return, 54 reactions](https://github.com/radix-ui/primitives/issues/2248). Both are exactly review UI patterns (popover on a diff line inside a dialog).
- React Aria: [#8007 ComboBox autofocus on filtered list](https://github.com/adobe/react-spectrum/issues/8007). Largest bundle and largest issue backlog, but the highest a11y rigor (Adobe tests with real assistive tech) and the most active triage in absolute terms.
- Base UI: top issues are feature requests, not defects ([#1709 date pickers](https://github.com/mui/base-ui/issues/1709)). 1.x has been stable since late 2025 and the repo closes about as many issues as it opens.
- shadcn/ui (MIT, 127k stars, 17.4M weekly): [#6843 cursor pointer under Tailwind v4](https://github.com/shadcn-ui/ui/issues/6843).

Pick: **Base UI**, styled with plain CSS. It covers all five needed primitives including combobox and autocomplete (Radix does not), it is MIT, 1.x stable, the repo closes issues as fast as they arrive, it renders data attributes (`data-open`, `data-starting-style`, `data-ending-style`) that map cleanly onto our CSS token system with no runtime styling layer, and per-component subpath exports keep the bundle small (each component is a separate entry). React Aria Components is the stronger choice if the board later needs date pickers, grids or tables with full screen reader semantics, and its Apache-2.0 license is acceptable; at 279 kB for the whole entry it should only be adopted per component if used. Ariakit is a good small alternative but has the thinnest adoption and an unverified license text. Radix remains fine and extremely adopted, but the missing combobox and the popover-in-dialog scroll bug are direct hits on this design.

shadcn/ui fit: shadcn is a copy-in distribution of Radix (and now other) primitives styled with Tailwind utility classes and class-variance-authority. Our app is plain CSS tokens with no Tailwind, so the copied files would need to be rewritten to CSS, which discards the main benefit (pre-styled code you do not maintain). The copy-in idea itself fits (own the markup, depend on unstyled primitives), so use Base UI directly and write the CSS once; do not adopt the shadcn CLI. Evidence: https://github.com/mui/base-ui , https://github.com/radix-ui/primitives , https://github.com/adobe/react-spectrum , https://github.com/ariakit/ariakit , https://github.com/shadcn-ui/ui .

---

## 3. Command palette

| | cmdk 1.1.1 | kbar 1.0.0 | Base UI Dialog + Autocomplete | Existing hand rolled palette |
|---|---|---|---|---|
| License | MIT | MIT | MIT | in repo |
| Latest publish | 2025-03-14 | 2026-08-10 | 2026-10-09 | n/a |
| Weekly downloads | 45.1M | 0.44M | (pick 2) | n/a |
| Gzip | 16.7 kB (depends on @radix-ui/react-dialog) | 27.5 kB | already in pick 2 | 0 |
| React 19 | peer ^18 or ^19 | yes | yes | yes |
| Issues (repo dip/cmdk) | 54 open, 3 opened 90d, **0 closed 90d** | 0 open | active | n/a |

Serious known issues in cmdk: [#264 results not restored after clearing the query, 33 reactions](https://github.com/dip/cmdk/issues/264), [#374 unexpected scroll position when filtering, 33](https://github.com/dip/cmdk/issues/374), [#280 first item not selected when list is dynamic, 26](https://github.com/dip/cmdk/issues/280), [#417 `Command.Empty` inside `role=listbox` fails axe aria-required-children](https://github.com/dip/cmdk/issues/417), [#393 Dialog missing DialogTitle a11y warning](https://github.com/dip/cmdk/issues/393).

Pick: **keep `places/commands.ts` (buildCommands, filterCommands) and the "unavailable commands are listed, marked and explained, never hidden" rule from spec 12, and replace only the dialog and listbox shell with Base UI Dialog plus Autocomplete.** The current component already encodes product rules (permission explanations, package scoped actions), so the reusable wheel is the dialog, focus trap, focus return, and listbox semantics, which Base UI supplies after pick 2 at no new dependency. cmdk is the most popular option by far, but it has had no release in eight months, closes no issues, and carries an open axe failure on its empty state; use it only if the Base UI Autocomplete spike fails the existing palette tests. This is a judgment from the evidence above, not a tested claim: spike it against the current `components.test.tsx` and axe before committing.

---

## 4. Code diff and review view

| | @pierre/diffs 1.6.4 | react-diff-view 3.3.3 | @git-diff-view/react 0.1.8 | monaco-editor 0.57.0 (diff editor) | @codemirror/merge 6.12.3 |
|---|---|---|---|---|---|
| License | Apache-2.0 (LICENSE.md, plus @pierre/theme, theming, highlights Apache-2.0; deps shiki MIT, diff BSD-3-Clause, lru_map MIT) | MIT | MIT | MIT | MIT |
| Latest publish | 2026-11-04 | 2026-03-30 | 2026-10-15 | 2026-09-24 | 2026-10-19 |
| Weekly downloads | 5.3M | 0.43M | 0.19M | 13.4M | 3.4M |
| Gzip | 133 kB (plus Shiki grammars you load) | 23 kB | 338 kB | 28 kB entry but 101 MB unpacked, workers load separately | 94 kB |
| React | React and vanilla components, peer ^18.3.1 or ^19 | React | React, Vue, others | wrapper needed (@monaco-editor/react) | wrapper needed |
| Inline comment anchoring | "Flexible annotation framework for injecting comments", line selection, accept/reject UI hooks | Widgets keyed by change, the long standing pattern for review comments | Widgets and "add comment" hooks | View zones and decorations; no comment model, you build it | No comment model; decorations only |
| Repo health | 53 open / 58 opened 90d / 38 closed 90d, released daily | 10 open, 0 activity 90d, single maintainer | 11 open, small | 792 open, 30 opened / 9 closed 90d | GitHub repo archived, moved to code.haverbeke.berlin |
| Keyboard and a11y | Stacked and split layout, text is real DOM (selectable, screen reader readable) | Real DOM table | Real DOM | Strong editor a11y (screen reader mode) but whole editor model | Editor a11y from CodeMirror |

Serious known issues: pierre [#734 match VS Code diff output](https://github.com/pierrecomputer/pierre/issues/734) and [#1100 hunk context separators](https://github.com/pierrecomputer/pierre/issues/1100) are fidelity and feature gaps, not crashes; react-diff-view [#102 no built-in virtual list](https://github.com/otakustay/react-diff-view/issues/102) matters for very large diffs; monaco [#246 no mobile support, 213 reactions](https://github.com/microsoft/monaco-editor/issues/246) and [#953 cannot block editing specific lines, 152](https://github.com/microsoft/monaco-editor/issues/953); git-diff-view [#21 virtual scroll](https://github.com/MrWangJustToDo/git-diff-view/issues/21).

Pick: **@pierre/diffs.** It is the only candidate that is both actively shipped (a release this week, large 90 day close rate) and designed for review, with an annotation framework for comments anchored to lines, line selection, and hooks for accept and reject controls, which is the agent-draft review loop. Its whole dependency tree is permissive (checked). Costs: the largest bundle among React native options (133 kB gzip plus syntax grammars; lazy load it behind the review route) and a young project (repo created December 2025). react-diff-view is the proven low risk fallback (23 kB, widget based comments) with a bus factor of one. Monaco and CodeMirror merge are editors, not review surfaces: heavy, with no comment anchoring model, and CodeMirror merge's GitHub repo is archived. Spike to confirm before locking: anchor identity survives a re-render when an agent pushes a new revision of the same file (store comment anchors as file path plus side plus line plus a quoted content hash, not a bare line number). Evidence: https://github.com/pierrecomputer/pierre/tree/main/packages/diffs , https://github.com/otakustay/react-diff-view .

---

## 5. Document review and markup (Markdown, DOCX, PDF)

### 5a. PDF

| | pdfjs-dist 6.5.438 | react-pdf 11.0.0 | react-pdf-highlighter(-extended / -plus) | @embedpdf/core 2.15.1 | Commercial SDKs |
|---|---|---|---|---|---|
| License | Apache-2.0 | MIT | MIT | npm says MIT; the repo carries a mixed notice (Apache-2.0 plus Fair Core License for the cloudpdf server) | Nutrient/PSPDFKit "SEE LICENSE", Apryse WebViewer (no license field), Syncfusion "SEE LICENSE", @react-pdf-viewer custom license page. **All excluded** |
| Latest publish | 2026-11-01 | 2026-09-10 | highlighter 8.0.0-rc.0 (2024-09), extended 8.1.0 (2024-07), plus 1.3.1 (tiny) | 2026-09-16 | n/a |
| Weekly downloads | 53.9M | 9.4M | 66k / 20k / 2.7k | 0.9M | n/a |
| Open issues | 391 (90 a11y keyword) | 7 | 37 / 27 | 202 | n/a |

Notes: pdf.js ships a native annotation editor layer (highlight, ink, freetext, stamp) and an accessible text layer; its keyword a11y hits are mostly its own viewer issues, and pdf.js maintainers close about as many as they open (97 of 115). react-pdf is the thin MIT React binding (7 open issues). The highlighter libraries are the "ready made" answer but are stale (last release mid 2024, pinned to old pdfjs, [#50 asks for an update to pdf.js 5](https://github.com/DanielArnould/react-pdf-highlighter-extended/issues/50)), which will conflict with pdfjs-dist 6.x. EmbedPDF is interesting (modular, active) but its mixed repo notice and a pre-1.0 annotation export bug ([#667 missing annotations on export](https://github.com/embedpdf/embed-pdf-viewer/issues/667)) make it a "legal read first" item, not a pick.

Pick: **react-pdf on pdfjs-dist, with our own thin anchor layer.** Store each comment as page number, normalized rectangles (0 to 1 of the page box so zoom does not matter) and the quoted text with prefix and suffix (the W3C Web Annotation TextQuoteSelector pattern), and draw the highlight overlay as absolutely positioned elements over the text layer, with a side list of threads for keyboard and screen reader access. That is small code on top of two well maintained permissive libraries, and avoids depending on an unmaintained highlighter.

### 5b. Rich text and Markdown with suggestions and comments

- Tiptap core is MIT (@tiptap/core 3.33.0, 35M weekly, 758 open issues, 156 closed in 90 days), and so are the free extensions. **Tiptap Comments is a paid, cloud backed product**: the docs say "Available from Start plan" and require activating a trial or subscribing, running their Document server, and installing from a private registry. Tracked changes and AI suggestion are similarly paid. Treat Tiptap Comments as excluded by the repo license rule. ([Tiptap comments docs](https://tiptap.dev/docs/comments/getting-started/overview))
- ProseMirror (MIT: prosemirror-view 1.42.9, 38M weekly, prosemirror-changeset 2.4.6 MIT) is the permissive base. Its GitHub repositories are archived mirrors; development moved to code.haverbeke.berlin, so GitHub issue counts are not meaningful.
- Open source suggestion and comment building blocks: [@handlewithcare/prosemirror-suggest-changes](https://www.npmjs.com/package/@handlewithcare/prosemirror-suggest-changes) 0.1.8 (MIT, 156k weekly, pre 1.0), @manuscripts/track-changes-plugin 2.4.0 (Apache-2.0), @sereneinserenade/tiptap-comment-extension 0.2.0 (MIT, tiny). All are small and young; plan on owning a thin comment mark and suggestion schema.
- For plain Markdown review, the cheapest route is no new library: react-markdown (already in the app) exposes `node.position` (line and column) per element, so comments can anchor to source line ranges and the same anchor survives a re-render of the rendered view.

Pick for editing documents with suggestions: **Tiptap core (or ProseMirror directly) with our own comment mark and prosemirror-suggest-changes**, kept behind an adapter, and only if in place editing is needed. For review only, use react-markdown source positions and skip the editor entirely.

### 5c. DOCX rendered

| | docx-preview 0.4.1 | mammoth 1.13.0 |
|---|---|---|
| License | Apache-2.0 | BSD-2-Clause |
| Latest publish | 2026-09-21 | 2026-09-26 |
| Weekly downloads | 3.7M | 15.3M |
| Gzip | 48.7 kB | 92.5 kB |
| Output | Layout faithful render (pages, headers, tables), DOM you can annotate | Clean semantic HTML, drops page layout |
| Issues | 66 open, 0 closed in 90 days; gaps: [#57 charts](https://github.com/VolodymyrBaydalka/docxjs/issues/57), [#39 page breaks](https://github.com/VolodymyrBaydalka/docxjs/issues/39) | 56 open; [#83 math](https://github.com/mwilliamson/mammoth.js/issues/83), [#413 list numbering](https://github.com/mwilliamson/mammoth.js/issues/413) |

Pick: **docx-preview** for the visual "rendered" review the brief asks for, anchoring comments by text quote plus paragraph index. Keep **mammoth** as the fallback when only reviewable text is needed (it produces the cleanest DOM to anchor to, and has far more usage). A server side DOCX to PDF conversion would let one pdf.js pipeline cover both formats; that is an architecture option for the API team, not evaluated here.

---

## 6. Virtualized lists for big boards

| | @tanstack/react-virtual 3.14.26 | react-virtuoso 4.18.20 |
|---|---|---|
| License | MIT | MIT (packages/react-virtuoso/LICENSE) |
| Latest publish | 2026-11-03 | 2026-10-29 |
| Weekly downloads | 41.0M | 4.9M |
| Gzip | 10.3 kB | 19.7 kB |
| Style | Headless hook, you render markup | Component with variable height measurement, grouped lists, reverse scroll |
| React 19 | peer through ^19 | peer through ^19 |
| Issues | 50 open / 59 closed 90d | 45 open / 19 closed 90d |
| Known issues | [#1119 eslint-plugin-react-hooks v7 warns on useVirtualizer, 32 reactions](https://github.com/TanStack/virtual/issues/1119) (React Compiler lint, relevant to React 19 tooling) | [#1059 endReached not called when container taller than content](https://github.com/petyosi/react-virtuoso/issues/1059), [#947 scroll jump when prepending unknown height items](https://github.com/petyosi/react-virtuoso/issues/947) |

Pick: **@tanstack/react-virtual.** The app already runs TanStack Router and Query, the hook is headless (it works with our plain CSS columns and with dnd-kit sortable), it is half the size, and it is released this week. Virtuoso is better when item heights are unknown and change a lot (chat style or reverse feeds); kanban cards are close to uniform so that advantage is small. Practical rule: virtualize per column only past a threshold (for example 100 cards), keep the dragged card rendered outside the virtual window, and test keyboard drag across the virtual window edge, because virtualization plus drag is where every DnD library fails first.

---

## 7. Motion

| | Plain CSS transitions and View Transitions | Motion 14.9.1 | @formkit/auto-animate 0.10.1 |
|---|---|---|---|
| License | n/a (platform) | MIT | MIT |
| Latest publish | n/a | 2026-11-04 | 2026-11-05 |
| Weekly downloads | n/a | 33.9M | 2.3M |
| Gzip | 0 | 59 kB for the full `motion` entry (smaller with its lazy feature loading) | 3.2 kB |
| Reduced motion | `@media (prefers-reduced-motion)` | supported (MotionConfig reducedMotion) | honors the preference by default |
| Known issues | Same document View Transitions are supported across current browsers but cross check support before depending on them | [#4053 Safari scrolling makes Reorder containers grow](https://github.com/motiondivision/motion/issues/4053) | [#7 breaks table row display, 19 reactions](https://github.com/formkit/auto-animate/issues/7), [#180 memory leak, 13](https://github.com/formkit/auto-animate/issues/180) |

Pick: **plain CSS first** (hover and state transitions on tokens, `@starting-style` and `transition-behavior: allow-discrete` for dialog and toast enter and exit, View Transitions for route changes and card moves between columns), **@formkit/auto-animate for simple add and remove list animation outside DnD containers** (3 kB, one ref), and **do not add Motion yet**. A review board is a working tool; the decisions that need real choreography (layout animation of a reordering list, gesture physics) are exactly the ones dnd-kit already animates during drag. Add Motion later only for shared element layout animation; if so, use its lazy `LazyMotion` entry. Never apply auto-animate to a dnd-kit sortable container (two systems writing transforms). Test every animation under `prefers-reduced-motion: reduce`. This pick rests on judgment about product fit more than on a head to head benchmark.

---

## 8. Toasts and notifications

| | sonner 2.0.8 | react-hot-toast 2.6.1 | react-toastify 11.2.0 | Base UI Toast (in pick 2) |
|---|---|---|---|---|
| License | MIT | MIT | MIT | MIT |
| Latest publish | 2026-08-09 | 2026-09-16 | 2026-10-28 | 2026-10-09 |
| Weekly downloads | 55.5M | 5.0M | 5.0M | (with Base UI) |
| Gzip | 9.4 kB | 4.8 kB | 9.9 kB | shared |
| React 19 | peer ^18 or ^19 | yes | yes | yes |
| Issues | 41 open / 13 closed 90d | 111 open / 3 closed 90d | 49 open / 26 closed 90d | n/a |
| Known issues | [#738 release notes](https://github.com/emilkowalski/sonner/issues/738), [#376 custom breakpoint](https://github.com/emilkowalski/sonner/issues/376) (cosmetic) | [#7 dismiss button, 48 reactions](https://github.com/timolins/react-hot-toast/issues/7), [#138 strict CSP and nonce, 30](https://github.com/timolins/react-hot-toast/issues/138) | [#959 Popover API and top layer](https://github.com/fkhadra/react-toastify/issues/959) | n/a |

Pick: **sonner**. Highest adoption by a wide margin, smallest maintained a11y aware option with a live region, themable through CSS variables and data attributes (works with our tokens), and fewest open defects. react-hot-toast has stalled triage (3 closed in 90 days) and a missing dismiss button; react-toastify is larger and older in feel. Product rule regardless of library: toasts are transient confirmations only (a card moved, a comment saved). Anything an agent or reviewer must act on (review requested, agent blocked, run failed) belongs in a persistent inbox or card badge, because a toast can vanish before a keyboard or screen reader user reaches it (WCAG 2.2.1, 4.1.3). Base UI Toast is the drop-in fallback if we want one dependency fewer.

---

## 9. Icons

| | lucide-react 1.69.0 | @phosphor-icons/react 2.1.10 | @radix-ui/react-icons 1.3.2 |
|---|---|---|---|
| License | ISC (LICENSE file, permitted) | MIT | MIT |
| Latest publish | 2026-11-05 | 2025-05-22 | 2024-11-14 |
| Weekly downloads | 127.7M | 7.5M | 7.4M |
| Size | one SVG component per icon, `sideEffects: false`; the 208 kB gzip bundlephobia figure is the whole barrel, not what ships | 33 MB package, 5 weights per icon; barrel is 1 MB gzip; needs per icon imports | about 330 icons at 15x15 only |
| Issues | 238 open / 135 closed 90d | 15 open / 0 closed 90d | 56 open / 0 closed 90d |
| Known issues | [#2450 NativeWind className](https://github.com/lucide-icons/lucide/issues/2450) (not our stack) | [#45 EMFILE too many open files in dev tooling, 20 reactions](https://github.com/phosphor-icons/react/issues/45), [#135 ESM and CJS import issues](https://github.com/phosphor-icons/react/issues/135) | [#177 no stroke width control](https://github.com/radix-ui/icons/issues/177), [#123 no save icon](https://github.com/radix-ui/icons/issues/123) |

Pick: **lucide-react**, imported per icon (`import { GitPullRequest } from "lucide-react"` tree shakes; do not import the namespace). Consistent 24px stroke grid with adjustable stroke width, about 1,500 icons including diff, branch, and review concepts the board needs, daily releases, ISC is permissive and named in the repo rule. Phosphor's duotone and weight variants are nice but the package stalled in 2025 and slows dev tooling; Radix icons are too small a set. Mark icons decorative (`aria-hidden`) unless they carry meaning alone, in which case give the control an accessible name.

---

## 10. Fonts

| | Inter (current) | Geist and Geist Mono | IBM Plex Sans | JetBrains Mono (current mono) |
|---|---|---|---|---|
| License | OFL-1.1 (rsms/inter, GitHub detected) | OFL-1.1 (vercel/geist-font LICENSE text) | OFL-1.1 (IBM/plex) | OFL-1.1 |
| Packaging | Already self hosted as `InterVariable.woff2`; `@fontsource-variable/inter` 5.3.0 (OFL-1.1, 10.4M weekly) is the npm route | `geist` 1.9.1 (4.1M weekly, released 2026-11-04) or `@fontsource-variable/geist` | `@fontsource-variable/ibm-plex-sans` 5.3.0 (0.6M weekly) | Already self hosted (3 static weights) |
| Notes | Excellent UI legibility, tabular figures, variable weights | Clean, close to Inter; known [Next.js `pages` router import problem #59](https://github.com/vercel/geist-font/issues/59) irrelevant to Vite | More technical, "engineering" feel, wider | Good for diffs and IDs; code ligatures optional |

Pick: **keep Inter and JetBrains Mono** (both OFL, both already self hosted and preloaded, no third party font CDN, which matters for a product that may run in restricted networks). Switching to Geist would change the look without fixing a problem. Two small improvements worth doing in the redesign: subset and `unicode-range` split the Inter file if payload matters, and set `font-variant-numeric: tabular-nums` on counts and IDs on cards. Commercial fonts are not needed. Keep the OFL notices in the repo's third party license file, since OFL requires the license text to travel with redistributed font files.

---

## Open items before any dependency lands

1. Read the Ariakit and EmbedPDF license text in full if either is reconsidered (not selected here).
2. Run a one day spike per risky pick against axe and keyboard only Playwright tests: dnd-kit with a virtualized column (1, 6), Base UI Autocomplete as palette shell (3), @pierre/diffs comment anchors across revisions (4), PDF anchor layer on a zoomed page (5a).
3. Add the allowlist entries (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, OFL-1.1 for fonts) to the license check, and check the full transitive tree with a license scanner at install time; this report checked only direct dependencies and, for @pierre/diffs, its listed dependencies.
4. Bundlephobia numbers are barrel size; measure real route chunks with `vite build --report` after adoption.
