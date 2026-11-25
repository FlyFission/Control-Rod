# Ship: Antigravity CLI as a confined seat

Release decision: **pending the owner**. Merge after the live qualification passes on the owner's Mac, a Codex blind review, and the owner's yes in the project thread. No trust surface is touched.

## Signature

Owner (sole maintainer): not yet recorded.

## Known limits

- Another local user or program can write in `/private/var/tmp`, a world-writable folder on the workspace path: a hook file planted there in the moment between Control Rod's check and Antigravity's start would run outside the sandbox, and a folder created there after a run starts is not denied to its file tools. Control Rod's own runs cannot do this to each other (they never overlap). On a single-user Mac this needs local malware already running as another user or as this user.
- Only Antigravity 1.5.16 is seated; any other build waits for a qualification.
- macOS only. Linux and Windows keep Antigravity listed and switched off.
- No authoring in a repository checkout yet. Antigravity loads workspace hook files outside its sandbox, so a checkout needs a later mirrored workspace.
- The file tools can create a new file directly in `/private/var/tmp` in an author run (risk residual). No later run can read it, and a planted instruction file there makes later runs refuse. A checker in plan mode cannot.
- System folders (`/usr`, `/bin`, `/System`, `/Library`, `/opt`, `/Applications`, `/private/etc` and a few under `/private/var`) stay readable to the file tools, because Antigravity applies the same rules to its terminal and a denied shell cannot start.
- Antigravity's built-in list of safe commands and its own model reviewers can allow commands that are not on Control Rod's list. Its terminal sandbox still holds for every command, and deny rules hold.
- One simple command per terminal call: Antigravity ends a print run at the first command with pipes or chaining.

- Rollback: revert the merge. Antigravity returns to "found, not supported yet"; no stored data changes shape.
- Monitoring after merge: the first real Antigravity check on a Mac ends with a verdict, and no `controlrod-agy-*` folder is left in `/var/tmp`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Seats: [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

Antigravity CLI runs author (outside a checkout), intake and pre-check work on macOS under its own terminal sandbox, with file-tool rules, a per-run home and plan-mode checks that Control Rod derives from the run's policy; it stays refused on every other platform and for checkout authoring; its pre-checks count with the Gemini models registered for it; the live qualification passes on a Mac; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
