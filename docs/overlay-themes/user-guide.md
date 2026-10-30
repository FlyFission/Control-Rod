# Working Worlds

Control-Rod has fifteen original visual worlds for work-package activity, plus Plain Floor. Every world uses the same task data and controls. Changing a theme never changes a work package, signs a decision, or restarts an agent.

## Try the complete collection without a backend

From the repository root:

```sh
pnpm --filter @control-rod/web... install --frozen-lockfile --ignore-scripts
pnpm --filter @control-rod/web run dev:themes
```

Open the printed local address at `/themes.html`. The preview contains explicitly labelled synthetic work, not live agents or engineering results. Choose **Theme**, then **Use** on any world. **Preview** describes a world without changing your saved selection. Clicking a sample worker displays its sample details. The scene, cast, controls and renderer are the same components used by the real Floor.

The complete collection is The Monster Mailroom, Little Helpers Laboratory, Heist Night, The Chocolate Factory, The Lantern Woods Guild, The Coffee House Crew, Tumbletown Rhyme Works, Starport Shipyard, Critter Expedition Camp, Blockworks Foundry, The Spirit Bathhouse, Thimble Town, Clockwork Stargazers, Reef Town, and Cozy Critter Village.

## Use with live work

The existing Floor remains the default. To evaluate the new Floor with the existing control plane, start the web development server with these explicit environment variables:

```sh
VITE_FLOOR_THEMES_ENABLED=true VITE_FLOOR_THEME_DRAFTS=true pnpm --filter @control-rod/web dev
```

Then sign in normally and open **Floor**. These are build-time flags; set the equivalent process environment on platforms with different shell syntax. The standalone preview needs no flags or sign-in. Do not expose draft evaluation as an approved public release.

All fifteen art packs are complete original vector illustrations but remain `development` pending actual human art/distribution review. The draft flag allows local evaluation with a persistent notice. Normal release mode admits only a pack with a matching human release record; the current release manifest is intentionally empty. This is independent of whether a theme can be drawn or loaded successfully. No public franchise “inspired by” wording has been approved or displayed.

Ordinary builds exclude `themes.html` and all unapproved artwork from the output. To build the explicitly labelled private review preview, use:

```sh
VITE_FLOOR_THEMES_ENABLED=true VITE_FLOOR_THEME_DRAFTS=true pnpm --filter @control-rod/web build
```

Serve `apps/web/dist` over localhost and open `/themes.html`. Keep this draft bundle separate from a public release. Disabling both flags restores a build containing the legacy Floor and no draft preview/artwork. A normal release build copies only assets listed in the approved pack manifests, never obsolete or unrelated files in an art directory.

## Read the activity correctly

- **Working** and **Pre-checking** describe active runs. **Run finished** does not mean an output is accepted.
- **Accepted** appears on a separate package record using the package's actual status. **Accepted with findings** additionally requires the matching package/revision decision.
- **Needs permission**, **Lost run**, and **Awaiting human review** in Your office are request markers, not extra workers or an automatic approval.
- **Queued**, **Waiting**, **Stopping**, **Stopped**, **Failed**, and **Lost run** remain distinct. Color is accompanied by text and the existing state markers.
- Coverage is per selected work-package page, thirty packages at a time. This view does not claim to show every agent or pre-package intake capture. Use Previous/Next and Active/All to change coverage.
- A station shows up to six entities. **+N more** opens its complete list. Smaller containers automatically use the same list, without losing work.
- Missing or stale data stays labelled. Motion pauses when updates fail or become too old, and resumes only after fresh data returns. Refresh does not approve anything.

## Motion, keyboard and settings

Full motion adds small working gestures and brief real submission effects. Quiet removes locomotion and background motion. Still removes animation. The operating system's reduced-motion setting takes precedence. Hidden/offscreen/stale scenes pause. Theme switches and reconnects do not replay completed work.

Use Tab to reach controls and workers; Enter/Space opens a worker's package. Focus and hover expose the same tooltip; Escape dismisses it. The gallery traps focus, closes with Escape, and returns focus to Theme. The equivalent List view is the primary screen-reader alternative. Motion is unnecessary for understanding state.

Preferences are browser-local at `cr.floor.preferences.v1`, shared across this origin's tabs, and contain only theme, motion and view. Clearing storage resets them. Blocked storage still allows in-memory selection. An unavailable saved theme falls back to Plain Floor without erasing the remembered preference.

## Recovery and rollback

A failed new theme leaves the current world selected. A broken character image uses a plain icon; a broken scene uses a neutral background. Choose Plain Floor or List at any time.

For a feature rollback, unset both build flags, rebuild, and redeploy through the normal release process: the legacy Floor is restored. For a pack rollback, remove its human release record or mark the pack development, then rebuild. Never enable draft mode as a workaround in a public deployment. Domain data requires no rollback because this feature never writes it.

## Checks

```sh
python3 -m unittest discover -s tools -p 'test_check_theme_assets.py'
python3 tools/check_theme_assets.py --root .
pnpm --filter @control-rod/web test
pnpm --filter @control-rod/web typecheck
pnpm --filter @control-rod/web build
pnpm --filter @control-rod/web exec playwright install chromium firefox webkit
pnpm --filter @control-rod/web run test:themes:browser --project=chromium
pnpm --filter @control-rod/web run test:themes:browser --project=firefox
THEME_TEST_RELEASE=true pnpm --filter @control-rod/web exec playwright test --project=chromium --grep 'release build excludes'
THEME_TEST_LEGACY=true pnpm --filter @control-rod/web exec playwright test --project=chromium --grep 'feature-off build'
```

Browser engines may need their OS dependencies installed by the environment owner. WebKit engine tests do not replace testing real Safari/iOS. The execution record distinguishes observed checks from remaining manual accessibility, art and distribution decisions.
