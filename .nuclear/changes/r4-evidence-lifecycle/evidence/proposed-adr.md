# ADR 0026: Evidence payloads out of git

- Status: Proposed. Not in `docs/adr/` until the owner records a yes naming that directory. `docs/adr/` already has two files numbered 0025; this proposal takes 0026, the next unused number from `git ls-tree origin/main docs/adr/` on 2026-11-25. It does not renumber the existing pair.
- Date: 2026-11-25
- Amends: the change-record convention in `docs/collaboration.md`, for records created after this ADR is accepted

## Context

`.nuclear/changes/` grows with every record, and the large files are evidence payloads (logs, patches, screenshots), not the decision text. Measured on `origin/main` at the start of this phase, before this record was added:

```text
find .nuclear/changes -type f | wc -l
1432
du -sb .nuclear
21422353	.nuclear
find .nuclear/changes -type f \( -name '*.log' -o -name '*.patch' \) | wc -l
407
```

Those payloads are cloned by everyone. The decision text, the digest, and a row that says where the payload lives are what a later reader needs in git.

## Decision

Git keeps, per evidence file, the SHA-256 digest and a manifest row in evidence/manifest.json. The payload may live outside git, in an evidence store the owner controls. A row is a relative path plus a 64-hex SHA-256, and the manifest names the store to restore from.

Existing records are grandfathered. History is not rewritten. The convention applies to records created after this ADR is accepted. A record that cites an evidence file which is neither in the tree nor in a manifest fails `tools/check_evidence_manifest.py`. `pnpm cr verify <record-directory>` reports three outcomes and does not say verified unless every row's bytes match the digest: missing bytes are incomplete and name the row and the store; a matching digest is verified; a differing digest is tampered.

## Consequences

- **Store.** The store has to stay retrievable if this repository, or its GitHub org, goes away, and the owner has to control it. GitHub Actions artifacts are disqualified: they expire. A repository that exists only in this GitHub org is disqualified as the retention copy, for the same reason.
- **Recommendation, not yet the owner's pick.** A separate evidence git repository the owner mirrors to a remote they control outside this GitHub org. `pnpm cr verify` reads `CONTROLROD_EVIDENCE_STORE`, a local directory of files named by their SHA-256. The mirror is how that directory is filled. Local-only evidence stays on the machine; its manifest `store` field is `local`, and the digest still sits in git.
- **Retention.** The owner records the retention period when they confirm the store. This proposal does not type one.
- **Clone growth.** A new record that offloads a payload adds the manifest row and the digest, not the payload. This ADR does not move payloads that are already in history.
- **CI.** `tools/check_evidence_manifest.py` is not wired into `.github/workflows/ci.yml`. That wiring is a separate trust-surface change.

## Sign-off

The owner has not yet recorded a yes for `docs/adr/`. Copying this file to `docs/adr/0026-evidence-out-of-git.md` waits on that yes, and on the store pick above.
