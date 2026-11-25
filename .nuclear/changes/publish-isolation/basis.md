# Basis: Accepted work opens a draft pull request, safely and by default

**Change slug:** `publish-isolation`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Built, for owner review. Follows `pr-on-accept` (merged off by default in #198).

## Mission / need

The owner wants a card to go from creation to an open pull request with no clicks. #198 built that but shipped it off: four blind reviews kept finding ways a checkout could steer the push, and a lane raise could race a push already under way. The owner asked why the misses kept coming; the answer was block-lists that close one example at a time and re-checks where a barrier was needed. This change replaces both with structure.

## Threat model

What may leave the machine: **one commit** (the bound commit plus the accepted patch the checker reviewed) to **one branch** (`controlrod/<package>-r<revision>`) on **one repository** (`github.com/<owner>/<repo>`), as a draft pull request against its default branch, and only while the card is on the public or internal lane.

| Class | How it could happen | Closed by |
|---|---|---|
| Redirect the push or its credential | checkout, user or system git config (url rewrites, remotes named like the target, pushurl, credential helpers, includes), hooks, environment | The push runs from a fresh bare repository in a scratch folder: `GIT_DIR` points there, user and system config are /dev/null, `HOME` is empty, the target is a URL, the only credential helper is `gh`'s, hooks are off, redirects are refused and TLS is always verified. The checkout is used only as a store of objects (alternates). Proxy and CA settings come only from the server's own environment, which the person running Control Rod set, never from the checkout or an agent; they are the same ones `gh` uses. |
| Widen what is sent | tags, submodules, extra refspecs, replacement objects, commits the checker never saw | One explicit refspec by commit id; tags and submodules off; replacement objects off; the author may not commit past the bound commit; the bound commit must be in the default branch's history on GitHub (compare API), so the pull request holds exactly one new commit. The default branch and the ancestry are read again after the push; if either moved, no pull request is opened. |
| Send private files | Control Rod run folders, names git would quote | The tree diff is read NUL-separated and any path under `.controlrod-run-*`, in any letter case, refuses. |
| Wrong lane | a raise while the push is under way | The lane barrier: the claim is taken under the shared marking lock and only on a routine lane, and while a claim holds, a marking write that would move the card off public or internal is refused (409 `publishing`). Each claim has an id, and only an outcome naming that id ends it, so an older attempt never releases a newer one's barrier. The publisher's send budget counts from the claim's own time; before the push and before the pull request it reads the lane, then checks the deadline. |
| Wrong receipt | adopting someone else's pull request, or a branch that moved | Only an open draft whose head is this repository's own branch at exactly this commit and base; after creating or adopting, the pull request is read back and must hold exactly this commit, base and draft state. |
| Different commit on retry | identity or time differences | Fixed identity, accept time, built from recorded inputs only. |

## Requirements

1. `publishCheckout` builds and pushes from an empty scratch repository; it never reads the checkout's config, and the config allow-list is removed.
2. `publish-claim.ts`: the claim window and `publishing()`; `markings.ts` refuses a non-routine lane on a package with a live claim.
3. `publishAccepted` takes the claim under the shared marking lock after reading the lane in the same transaction, and passes a deadline.
4. Publishing is on by default.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The push is built and sent from an empty scratch repository that reads no config of the user's, the system's or the checkout's, and a checkout planted with every known way to redirect or widen a push still sends exactly one commit to the intended branch. No marking can move a card off the public and internal lanes while its pull request attempt may still send. Publishing is on by default (CONTROLROD_PUBLISH_PULL_REQUESTS=0 turns it off). API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
