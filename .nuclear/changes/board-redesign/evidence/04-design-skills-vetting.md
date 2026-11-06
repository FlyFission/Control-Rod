# Design skills vetting for the Control Rod web redesign

Date: 2026-11-05. Method: GitHub API for owner, license, stars and last push; shallow clones into `/home/flyfission/.claude/jobs/f568aae8/tmp/skill-vet/<name>`; read every script, hook and installer I could find. Nothing was installed or executed. Star counts are as reported by the GitHub API today and are very high for all of these; treat them as popularity, not as a quality or security signal.

## Summary table

| Candidate | Real repo (owner) | License | Last commit | Stars | Installs hooks / scripts / network | Fit for Control Rod |
|---|---|---|---|---|---|---|
| Impeccable | pbakaus/impeccable (Paul Bakaus) | Apache-2.0 | 2026-11-05 | 103.9k | Optional hooks, Rust engine binary, telemetry-capable catalog fetch, local live server | High (has an explicit "Operate" mode for app UI) |
| Anthropic frontend-design | anthropics/skills and anthropics/claude-plugins-official (Anthropic) | Apache-2.0 (LICENSE.txt in the skill; repo is mixed) | skills repo 2026-10-28 | 187.8k (whole repo) | Single SKILL.md, no scripts, no hooks | Medium (generic, short, marketing leaning) |
| UI UX Pro Max | nextlevelbuilder/ui-ux-pro-max-skill | MIT | 2026-11-05 | 145.7k | Python stdlib search scripts over bundled CSVs; npm CLI fetches from GitHub API; repo ships an optional MCP starter kit | Low to medium (a lookup library of styles and palettes; fights an existing token system) |
| Taste Skill | Leonxlnx/taste-skill | MIT | 2026-11-05 | 110.7k | Node scripts that launch headless Chrome and local servers; icon script pulls from jsDelivr; photo script pulls from Wikimedia | Low (built for company marketing sites) |
| Hallmark | Nutlope/hallmark (Hassan El Mghari, Together AI) | MIT | 2026-11-05 | 48.8k | Optional PostToolUse lint hook; opt-in image generation to api.together.xyz; Wikimedia photo fetch | Low to medium (new pages and themes; refuses to touch existing designs unless named) |
| Vercel web-design-guidelines | vercel-labs/agent-skills (Vercel) | No LICENSE file at repo root; no license field in this skill | 2026-10-27 | 33.6k | No scripts, but it fetches its rules from raw.githubusercontent.com on every run | High as a reviewer |
| Vercel vercel-react-best-practices | vercel-labs/agent-skills (skills/react-best-practices) | MIT (stated in the skill frontmatter; repo has no LICENSE file) | 2026-10-27 | 33.6k | Markdown only, no scripts | High for the non-Next.js subset |
| web-animation-design | No canonical repo (see below) | Varies by copy | n/a | n/a | Markdown only | Do not use; use Emil's official repo |
| Emil Kowalski official skills (the real source) | emilkowalski/skills (Emil Kowalski) | MIT | 2026-11-04 | 53.9k | 17 skill folders, Markdown only, no scripts, no hooks | High for motion |
| "Aesthetic" / "Aesthetic UI Design" | mrgoonie/claudekit-skills, folder `.claude/skills/aesthetic` | None detected | 2026-04-03 | 2.2k | Markdown only, but chains to other ClaudeKit skills and Gemini image generation | Skip |

## Per-candidate findings

### 1. Impeccable (already installed locally)

- Repo and owner: github.com/pbakaus/impeccable, Paul Bakaus. Apache-2.0. Last push 2026-11-05. Plugin manifest in the repo says 4.8.0; the local copy at `/home/flyfission/.claude/skills/impeccable` is SKILL.md 4.5.2 with engine 0.1.14 (also mirrored at `/home/flyfission/.agents/skills/impeccable`). So the local copy is behind the repo.
- What it installs: SKILL.md plus a `reference/` folder of per-command playbooks (shape, audit, critique, polish, animate, harden, optimize, etc.), a `scripts/impeccable` POSIX launcher, and a prebuilt linux-x64 binary. The repo also ships subagents (the asset producer, documenter, finish reviewer and manual edit applier that appear in this session's agent list), a browser extension, a VS Code extension and a Cursor plugin.
- Scripts read: the launcher `scripts/impeccable` runs, in order, `$IMPECCABLE_BIN`, the sibling binary in `scripts/bin/<os>-<arch>/`, `~/.impeccable/bin/impeccable`, a version-pinned cache, then PATH. Only as a last resort does it download `https://github.com/pbakaus/impeccable/releases/download/engine-v<version>/impeccable-<os>-<arch>`, and it fails closed unless a `.sha256` sidecar verifies. On this machine the sibling linux-x64 binary exists, so no download is needed. The binary is a Rust program; I did not decompile it, I read its source in `crates/`.
- Hooks: the plugin form (`plugin/hooks/hooks.json`) registers SessionStart, PostToolUse (matcher `Edit|Write`) and Stop hooks that run `sh .../scripts/impeccable hook`. These run outside model approval (the README says so). They are not installed by a plain skill copy; the `npx impeccable install` flow offers them. I found no impeccable entries in `/home/flyfission/.claude/settings.json`. Note that `~/.impeccable/` exists with `hook.cache.json` and `staleness-check.json`, so the engine has been run before on this machine.
- Network and telemetry: per the README and `crates/context/src/telemetry.rs`, when a new design starts, the skill fetches a catalog of visual directions from impeccable.style (this request happens even with telemetry off). Telemetry itself is an anonymous record of which directions were shown and chosen; project name, files, code and PRODUCT.md are said not to be sent. Disable with `npx impeccable telemetry off`, `DO_NOT_TRACK=1` or `"telemetry": false` in `.impeccable/config.json`. The `live` command starts a local server and injects a script into your dev page for in-browser variant picking.
- What it does in practice: one skill with about 24 sub-commands. It forces a context step (`impeccable context`, loads PRODUCT.md and DESIGN.md), classifies the surface into Persuade, Operate, Read or Experience, loads a craft floor of bans and reflexes before any UI edit, and then runs a playbook. The Operate mode is explicitly for app UI and says scanability, consistency and native expectations outrank expression. Rules worth knowing: "The brief wins", "Refinement preserves; redesign replaces", and a bounded verification budget (one batched inspect round, one confirm round). The default tone is "go all out, bold", which is the main risk for a dense operations app, so state "refinement, Operate mode" in the prompt.
- Install for Claude Code: `npx impeccable install` (interactive; choose project or global, and decline the hook for now), or `/plugin marketplace add pbakaus/impeccable` then install from `/plugin`. Update with `npx impeccable update`.

### 2. Anthropic frontend-design

- Source: the same SKILL.md lives in anthropics/skills (`skills/frontend-design`, Apache-2.0 LICENSE.txt in the folder) and in anthropics/claude-plugins-official (`plugins/frontend-design`, plugin version 1.1.1). I diffed the two copies: byte identical. The plugin is already present in the local marketplace cache but not installed (the installed list has only codex, claude-code-setup and nuclear-grade).
- Files: SKILL.md (71 lines) and LICENSE.txt. No scripts, hooks, MCP servers or network calls.
- Practice: a short art-direction prompt. It tells the model to act as a design lead, ground the design in subject matter, write a token plan (4 to 6 named hex colors, type, layout, principles), review that plan against the "generic AI defaults" it lists (cream and terracotta, acid-green on black, broadsheet, SaaS card kit, template chrome), then build and self-critique. It is good, but it is a single-pass nudge aimed at new pages. It has no audit, no commands, no memory of a product context.
- Install: `/plugin install frontend-design@claude-plugins-official`.

### 3. UI UX Pro Max

- Repo: nextlevelbuilder/ui-ux-pro-max-skill, MIT, last push 2026-11-05, v2.15.0, 705 files.
- Installs: the plugin manifest points at `.claude/skills/`, which contains seven skills (ui-ux-pro-max, design, design-system, brand, banner-design, slides, ui-styling). No hooks in plugin.json. The main skill is SKILL.md (217 lines) plus `data/` CSVs (80 styles, 192 palettes, 74 font pairings, 119 UX guidelines, icons, GSAP presets, charts, 22 stacks, react-performance.csv) and `scripts/search.py`, `core.py`, `design_system.py`, `reasoning_contract.py`.
- Scripts read: `search.py`, `core.py`, `design_system.py` and `reasoning_contract.py` import only the Python standard library (argparse, csv, difflib, re, json, tempfile); no sockets, urllib or subprocess in the runtime scripts. `design_system.py` can write a design system file when asked to persist. `validate_data.py` is a dev-time validator and only inspects URLs as strings.
- Network: the npm installer `ui-ux-pro-max-cli` (`uipro init --ai claude`) calls `api.github.com` and downloads a release zip from github.com (see `cli/src/utils/github.ts`). The repo also contains a `stack/` starter kit with a `.mcp.json` that runs `npx -y @playwright/mcp@latest`, `chrome-devtools-mcp@latest` and `shadcn@latest mcp`, and a `setup.sh` that runs `npm install`, `npx playwright install chromium` and the CLI. That kit is not installed by the plugin or CLI; just never run `stack/scripts/setup.sh` casually, because unpinned `@latest` MCP servers are a supply-chain exposure.
- Practice: a searchable local database. You ask for `--design-system` for a product type and it returns a style, palette, font pair and anti-patterns. Useful for greenfield picks. For an app that already has a token system, a branded palette (Ascertain charcoal and Cherenkov cyan) and two self-hosted fonts, it mostly proposes alternatives you would have to reject. Its UX rules (44px targets, contrast, focus) overlap with the Vercel guidelines and Impeccable's craft floor.
- Install: `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` then `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`, or `npm install -g ui-ux-pro-max-cli && uipro init --ai claude`.

### 4. Taste Skill

- Repo: Leonxlnx/taste-skill, MIT, last push 2026-11-05, v2.5.0 (skill name `design-taste-frontend`). The README advertises sponsors and a desktop app (TasteCode).
- Installs: one skill folder `skills/taste-skill/` with SKILL.md, large `assets/` (shader effects, scenes, backgrounds, layout, motion) and `scripts/` (start, shoot, perf, effects, moments, photos, icons, layout and consistency checkers). `install.sh` only creates symlinks into `~/.claude/skills` (or Codex), so a `git pull` updates the skill in place; that means future upstream edits take effect without review, which is a supply-chain consideration.
- Scripts read: they spawn headless Chrome with a throwaway profile and a local static server on 127.0.0.1; `icons.mjs` fetches icon packs from `cdn.jsdelivr.net` (pinned versions and a pinned commit for logos); `photos.mjs` fetches Wikimedia Commons images. No API keys, no telemetry found in the files I grepped.
- Practice: builds "figma.com and x.ai level" company websites: one section per screen, real photographs, shader effects and scroll scenes for tech pages. That is the opposite of what a dense operations board needs. Skip.
- Install (for the record): `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"`.

### 5. Hallmark

- Repo: Nutlope/hallmark (Hassan El Mghari, "Made by Together AI"), MIT, last push 2026-11-05, v2.0.0. The photo library lists Wikimedia files and holds none.
- Installs: `skills/hallmark/` with SKILL.md, `references/` (50 themes, gates, layout, motion, redesign), `agents/`, and `scripts/` (sloplint, theme, capture, picture, imagegen, install, install-hook, lint-hook, refcheck).
- Hook (opt-in): `install-hook.mjs` writes a PostToolUse entry (matcher `Write|Edit|MultiEdit`, timeout 10) into `.claude/settings.json` (project) or `~/.claude/settings.json` (`--global`). The command is `node "<skill dir>/scripts/lint-hook.mjs"`. `lint-hook.mjs` reads the hook payload from stdin and, for `.html`, `.css`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.astro` files that carry a Hallmark stamp or sit in a project with a `.hallmark` folder, runs `sloplint.mjs` with a 4 second timeout and returns findings as advisory context. It never blocks and does nothing for other projects. Remove with `--remove`.
- Network: `imagegen.mjs` posts to `https://api.together.xyz/v1/images/generations` only if `TOGETHER_API_KEY` is set (opt-in; it says so). `theme.mjs photos --save` downloads from `upload.wikimedia.org` only. `capture.mjs` and `picture.mjs` drive a local Chrome via puppeteer-core.
- Practice: deals three themes from a catalog of fifty "materials", builds a self-contained HTML/CSS page, lints it in a browser at eight widths, and uses a fresh-context reviewer. Its description says never use it on an existing design unless named (`/hallmark redesign <path>` or `audit <path>`). It is oriented to marketing pages and outputs plain HTML and CSS, not a React app with a token system.
- Install: `npx skills add nutlope/hallmark -g` (or `/plugin marketplace add nutlope/hallmark` then `/plugin install hallmark@hallmark`).

### 6. Vercel web-design-guidelines

- Repo: vercel-labs/agent-skills, last push 2026-10-27. No LICENSE file at the repo root and the SKILL.md carries no license field, so the license is unconfirmed (react-best-practices states MIT; this one does not). Check before redistributing; private use is fine.
- Files: a single 40 line SKILL.md. No scripts.
- Network, flagged: the skill tells the agent to WebFetch `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md` before every review and apply that content as the rules. That is live, unpinned remote instruction text from a `main` branch. It is from a reputable owner, but a future commit changes agent behavior with no local review. Mitigation: save a reviewed copy of `command.md` in the repo and edit the skill to point at it, or pin to a commit SHA.
- Practice: reviews files against 100+ terse rules (accessibility, focus states, forms, animation, typography, images, performance, navigation and URL state, dark mode, touch, i18n) and prints `file:line` findings. It is a pure reviewer; it does not generate design.
- Install: `npx skills add vercel-labs/agent-skills --skill web-design-guidelines`.

### 7. Vercel react-best-practices (installs as `vercel-react-best-practices`)

- Same repo, MIT stated in SKILL.md. Files: SKILL.md, AGENTS.md, README.md, metadata.json and a `rules/` folder of 72 rule files across 8 categories (eliminate waterfalls, bundle size, server, client data fetching, re-render, rendering, JS micro-optimizations, advanced). Markdown only.
- Fit: a large share is Next.js and server-component specific (the `server-` category and some bundle rules about `next/dynamic`). Control Rod is a Vite SPA with TanStack Router and Query, so the useful part is waterfalls, bundle splitting, re-render, rendering and JS rules; the skill does not know TanStack Query semantics. Tell the agent to ignore Next.js and RSC rules.
- Install: `npx skills add vercel-labs/agent-skills --skill react-best-practices`.

### 8. web-animation-design

- Could not be tied to one real repo. Searching GitHub finds many identical vendored copies (for example vercel-labs/open-agents `.agents/skills/web-animation-design`, MIT; gokulkrishh/skills; baptisteArno/typebot.io, license NOASSERTION; and others). The bphkns/dotfiles copy that web results mention is no longer in that repo's current HEAD. Every copy has the same text: "based on Emil Kowalski's 'Animations on the Web' course" (animations.dev, a paid course), plus an "Initial Response" greeting instruction and a mandatory markdown Before/After table format.
- Judgment: it is a third-party derivative of paid course material with unclear authorization and no canonical maintainer, and Emil now publishes an official, maintained set. Do not install it. Use the official repo below.

### 8b. Emil Kowalski official skills (the real source for motion)

- Repo: emilkowalski/skills, MIT, last push 2026-11-04, 53.9k stars. 17 skill folders (emil-design-eng, animate, review-animations, improve-animations, find-animation-opportunities, remove-animations, choreograph, animation-performance, animation-vocabulary, apple-design, break-ui, mobile-native, pick-ui-library, prototype, ask-sonner, animate-expo, write-swift), about 3.7k lines of Markdown across SKILL.md files, no scripts, no hooks, no network calls.
- Quirk: several skills have an "Initial Response" rule: when invoked with no question, reply only with a one line greeting. Harmless, but it can look like the skill did nothing; always invoke with a concrete task. `review-animations`, `prototype` and `pick-ui-library` set `disable-model-invocation`, so they run only when you call them.
- Practice: concrete motion rules (easing, durations, enter versus exit, which properties to animate, frequency of use) and audit tools that produce prioritized findings and plans. `improve-animations` is read-only on source and writes plans under `plans/`. `pick-ui-library` pushes toward external libraries, so ignore it in a repo with a strict dependency register.
- Install: `npx skills@latest add emilkowalski/skills` (all 17), or select: `npx skills add emilkowalski/skills --skill emil-design-eng --skill review-animations --skill animation-performance`.

### 9. "Aesthetic" / "Aesthetic UI Design"

- Not found under that exact title. The closest original is `aesthetic` in mrgoonie/claudekit-skills (ClaudeKit), path `.claude/skills/aesthetic`, last commit 2026-04-03, 2.2k stars, no license detected by GitHub. A smaller copy exists at samhvw8/dot-claude (11 stars, last push 2025-12-09). Directory sites (skills.sh, skillselion, aimcp) list it, which is probably the third-party listing your owner saw. I cannot verify that the listing named "Aesthetic UI Design" is either of these, so treat the identity as unverified.
- Files: SKILL.md, two templates, four references (design principles, micro-interactions, storytelling, resources). No scripts or hooks of its own, but the workflow assumes sibling ClaudeKit skills (ai-multimodal for image generation, chrome-devtools, media-processing), which carry scripts and need an external AI API key. Its framework (BEAUTIFUL, RIGHT, SATISFYING, PEAK) is generic, and its stated method is to analyze Dribbble and Mobbin screenshots and generate design images, which is not useful here. Skip.

## Risk flags, ranked

1. Impeccable hooks (if you accept them at install): SessionStart, PostToolUse and Stop hooks run an engine binary outside model approval, on every edit. Fine for a trusted project, but know it, and set `"telemetry": false` in `.impeccable/config.json`. The catalog fetch still happens at the start of a new design.
2. Vercel web-design-guidelines: fetches unpinned instructions from a `main` branch on every run. Pin or vendor a reviewed copy.
3. Taste Skill `install.sh` symlink model: upstream `git pull` silently changes agent instructions and scripts.
4. UI UX Pro Max repo `stack/.mcp.json`: unpinned `npx -y ...@latest` MCP servers. Not installed by the plugin, so only a risk if someone runs the setup script.
5. Hallmark `install-hook.mjs --global`: edits `~/.claude/settings.json`; use project scope or skip it. `imagegen.mjs` sends prompts to Together AI only when `TOGETHER_API_KEY` is set.
6. Licensing: vercel-labs/agent-skills has no root LICENSE; claudekit-skills has none detected; web-animation-design copies are derivative of a paid course.

I found no skill that asks for broad permissions in its own frontmatter (none declare `allowed-tools`), and none ships an MCP server that auto-registers on skill install.

## Recommended stack by role

| Role | Pick | Why |
|---|---|---|
| Primary art direction | Impeccable (already installed; update it) | Only candidate with an Operate mode for dense app UI, PRODUCT.md and DESIGN.md context, refinement versus redesign discipline, and a bounded verification budget. It also covers critique and polish, which reduces the number of skills needed. |
| Critic or reviewer | Vercel web-design-guidelines, with Impeccable `critique` and `audit` for UX heuristics | Independent, mechanical, `file:line` output from a different rule set than the art director. Run it after each redesign slice. |
| Motion | Emil Kowalski official: `emil-design-eng`, `review-animations`, `animation-performance` (optionally `choreograph`, `animate`) | Specific numeric rules, maintained by the source, Markdown only. Replaces web-animation-design. |
| React performance | `vercel-react-best-practices` | The only dedicated candidate; instruct it to skip Next.js and RSC rules. |

Not recommended: UI UX Pro Max (token system conflict, large duplicate rule set), Taste Skill and Hallmark (marketing site builders with their own competing rule sets), Anthropic frontend-design (fine, but redundant once Impeccable is the art director), web-animation-design, Aesthetic.

### Overlaps and conflicts

- Impeccable, Hallmark, Taste Skill, frontend-design and UI UX Pro Max all try to be the art director. Run exactly one. Two art directors give contradictory bans (for example Hallmark bans tracked-capital labels and eyebrows outright, while Impeccable and frontend-design list them as tells but allow them with reason) and each wants to write its own design context file.
- Impeccable `animate` and `optimize` overlap with Emil's motion skills and the React performance skill. Resolve by role: Impeccable decides what should move and what the design language is; Emil's skills decide easing, duration and properties; the Vercel React skill owns render and bundle cost. Tell the agent that Emil's numeric rules win on motion values.
- Impeccable `audit` and Vercel web-design-guidelines overlap on accessibility, focus and reduced motion. That overlap is useful as a cross-check, not a conflict.
- Impeccable's default "go all out, bold" posture conflicts with the app's established, restrained Ascertain-derived system. Start with `/impeccable init` so PRODUCT.md records that this is an Operate surface and that `apps/web/src/design/tokens.css` is the source of truth, and use "refinement preserves" wording.
- Emil's greeting-only "Initial Response" can sit awkwardly in a larger workflow; give those skills a concrete task each time.

### Exact install commands (run these yourself; I ran none)

```bash
# 1. Art direction: update the already installed Impeccable (project scope, decline the hook at first)
cd /home/flyfission/worktrees/control-rod-signin
npx impeccable install            # choose: Claude Code, project scope, answer "no" to the design hook
npx impeccable telemetry off
# then in Claude Code: /impeccable init   (record "Operate", tokens.css is the source of truth)

# 2. Critic
cd /home/flyfission/worktrees/control-rod-signin
npx skills add vercel-labs/agent-skills --skill web-design-guidelines
# afterwards: save a reviewed copy of
#   https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
# into the repo and edit the installed SKILL.md to read that file instead of fetching it.

# 3. Motion
npx skills add emilkowalski/skills --skill emil-design-eng --skill review-animations --skill animation-performance --skill choreograph

# 4. React performance
npx skills add vercel-labs/agent-skills --skill react-best-practices
```

If the `skills` CLI does not accept repeated `--skill` flags on your version, run `npx skills add <repo>` and select skills interactively, or copy the folders from the vetted clones under `/home/flyfission/.claude/jobs/f568aae8/tmp/skill-vet/` (`emil-skills/skills/<name>`, `agent-skills/skills/<name>`) into `/home/flyfission/worktrees/control-rod-signin/.claude/skills/`. Copying from the clones I already read freezes the exact content I reviewed. I did not vet the `npx skills` CLI itself (a Vercel Labs tool); check it before first use.

## Current Control Rod web visual system (10 lines)

1. Source of truth is `apps/web/src/design/tokens.css` (imported at the top of `apps/web/src/styles.css`, 1,344 lines of plain CSS) with custom properties on `:root`; no CSS framework, no CSS-in-JS. There is no PRODUCT.md or DESIGN.md in the repo root or `apps/web`.
2. Dark only (`color-scheme: dark`): charcoal ground `#0a0a0c`, surface `#101012`, panel `#141416`, hairline lines `#1e1e1f` and `#2f2f30`. No light theme and no `prefers-color-scheme` handling.
3. The palette is borrowed from Ascertain (header comment in tokens.css): Cherenkov cyan `#00f2ff` for action and selection, with `--accent-ink` `#001a1c` text on it.
4. A semantic state palette carries meaning: amber `#ffaa00` (needs you), violet `#b89cff` (waiting on someone else), orange-red `#ff7a59` (stuck), `#ffb347` (changed input), green `#00ff9d` (done), grey `#7d8a9a` (idle). A few raw hex values (`#ffb4a0`, `#8fe3b5`, `#5c2617`) sit outside the tokens in `styles.css` for error, ok and danger.
5. Type: self-hosted Inter variable for UI and JetBrains Mono (400, 500, 600) for IDs and data, no third-party font requests. Compact scale: 15px body, 20px h1, 15px h2, 13px h3, 12px `.small`, 13px table text.
6. Shape and density: 8px control radius dominates (13 uses), then 10px and 12px for panels; 40px minimum control height (34px small); few shadows (8 `box-shadow` uses); 1px borders and outlines do most of the separating.
7. Buttons are outlined ghost by default with a solid cyan `.primary`; danger is an orange-red outline. A visible 2px cyan `:focus-visible` outline, a skip link and an `.sr-only` utility are present.
8. Layout is app-shell style (`.topbar` at line 205 plus pages for Board, Inbox, Packages, Records, Registers, Roster, Policies, Usage, Floor, Office), with responsive breakpoints at 900px and 560px and a data-table style (`.records`) for registers.
9. Motion is minimal: 3 `transition` or `@keyframes` uses (a `pulse` keyframe on status marks and a figure transition), with a `prefers-reduced-motion: reduce` block disabling them.
10. A separate illustrated layer exists: feature CSS in `features/floor/floor.css` and `features/office/office.css`, public `floor-themes` and `office-themes` assets, `design/overlay-themes/*` and a `themes.html` "Working Worlds Preview" page, so the floor and office views carry playful themed worlds while the core board and registers stay utilitarian. A redesign should decide explicitly whether that layer is in scope, because art-direction skills will try to unify or override it.
