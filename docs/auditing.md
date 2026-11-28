# Auditing Control Rod records

This page is for an auditor, a QA reviewer, or anyone else who needs to check what happened in a Control Rod installation without simply taking the installation's word for it. It covers what is recorded, how to sample it, and how to check a record on your own machine. It also says plainly what the records cannot prove yet.

Control Rod gives you records and a way to check them. Whether they count as quality records is a decision for your QA program. See [boundary.md](boundary.md) and [qa-standards.md](qa-standards.md).

## What is recorded

| Record | What it holds | Where to find it |
| --- | --- | --- |
| Event chain | Every controlled change: who did it (a person, an agent or the system), what it was, when, and the digest of the event before it | **Records** page; `GET /events` |
| Seals | A Member's passkey signature over the chain head at a moment, with a stated purpose | **Records** page; `GET /records/verify` |
| Decisions | Release, accept, return, reject and owner overrides. Each one is a passkey signature over the digest of exactly what the person reviewed | The package's events in the chain |
| Run evidence | For each agent run: the runtime digest, the model the runtime reported, the permission mode, the sandbox policy, and the daemon's signed attestation ([ADR 0022](adr/0022-run-attestation.md)) | The package's runs and their events |
| Signer qualifications | What each Member may sign, one frozen version per change. Revoking one adds a new version and deletes nothing | **Policies** page |
| Change records | For changes to Control Rod itself: risk, basis, plan, trace, verification and ship, validated in CI | `.nuclear/changes/` in the repository |

## Sampling

1. **Check the whole chain first.** Open **Records**, or call `GET /records/verify`. You get back whether every entry recomputes and links, each seal's result, and how many entries no valid seal covers yet. If the chain is broken anywhere, stop and treat every later record as unproven.
2. **Ask for a seal before you sample.** A Member seals the chain from the **Records** page with a passkey. After that, everything up to the seal is covered, and a later rewrite of a covered entry fails the check.
3. **Pick packages and take their proofs.** On **Records**, enter a package ID and choose **Prove it**, then **Download the proof bundle**. The bundle holds the chain from its first entry through the seal that covers the package, the seal itself, and the public key needed to check the seal's signature.
4. **Or export a whole period.** On **Records**, under **Export a time window for audit**, choose a start and an end and select **Export**, then **Download the export**. The export holds every event recorded in that window, by each event's own recorded time, in the same self-checking form as a package proof (`GET /records/export?from=…&to=…`). Seal the chain after the window closes, so that the seal covers the whole window.
5. **Check each file offline,** as described in the next section.
6. **Read the package's decisions and runs** against your sampling criteria. For example, check that each acceptance followed a pre-check from a different provider, or that every override has a written reason.

## Checking a bundle on your own machine

You need a clone of the repository and Node 22. You don't need a database, a sign-in or access to the installation.

```sh
pnpm install
pnpm cr verify WP-0001-inclusion-proof.json
pnpm cr verify audit-export-2026-11-01-to-2026-11-08.json
```

The command recomputes every digest and link from entry 1 onward. It also derives the package's own entries from the chain, and checks the seal and its passkey signature against the key in the file. For an export, it finds the window's entries from their recorded times, and checks that the seal covers the last of them. It uses the same functions as the control plane, `verifyInclusion` and `verifyWindow` in [`services/api/src/seals.ts`](../services/api/src/seals.ts).

A bundle that holds:

```text
OK    WP-0001: 6 entries (3, 4, 9, 10, 11, 14) recompute and link through the chain from entry 1 to entry 17.
      Sealed by seal seal_… at entry 15 on 2026-11-21T16:00:00.000Z (Weekly seal); its passkey signature checks against the key in the bundle.
      Still to confirm outside this file: that the key belongs to signer mem_…. Its SHA-256 is 3f9a…; to check it against a key you already trust, run again with --trusted-key <that key's SHA-256>.
      Local chain, not witnessed: nothing outside this installation shows that later entries were not cut.
```

A bundle that does not hold names the first problem it finds, for example `FAIL  WP-0001: event 9 does not match its digest.`, and the command exits with status 1. It exits with 2 for a file that isn't a bundle.

### Checking against a key you already trust

On its own, the command checks the seal against the key carried inside the file. That shows the file is whole and was sealed by whoever holds that key. It does not show whose key it is: someone could rebuild the same entries and seal them with a key of their own, and the file would still check.

If you already trust a signer's key, pass its SHA-256:

```sh
pnpm cr verify --trusted-key 3f9a…e1 WP-0001-inclusion-proof.json
pnpm cr verify --trusted-key mem_…=3f9a…e1 WP-0001-inclusion-proof.json   # tie the key to one signer
```

Get that SHA-256 from somewhere other than the file. For example, the Member runs `pnpm cr verify` on a bundle exported from their own installation and sends you the SHA-256 it prints, over a channel you already trust. With `--trusted-key`, the command fails with status 1 when the seal's key is a different key, when you tied the key to another signer, or when no seal covers the entries. You can give `--trusted-key` more than once.
## Checking a change record's evidence

`pnpm cr verify <record-directory>` reads `evidence/manifest.json` when the argument is a change-record directory rather than an inclusion proof. Git keeps the digest and the manifest row. The payload may still be in the record, or in the store the manifest names. `CONTROLROD_EVIDENCE_STORE`, when set, is a local directory of files named by their SHA-256.

Missing payload bytes print `INCOMPLETE`, name the manifest row, and name the store to restore from. The command does not say verified. Bytes whose digest matches the row print `VERIFIED`. Bytes whose digest does not match print `TAMPERED`, and that run does not say verified either.


## What the records cannot prove yet

Keep these limits in your findings.

- **Nothing outside the installation witnesses the chain.** Someone with control of the database could cut off entries after the last seal, or rebuild the whole chain from scratch before anyone sealed it. The outside-witnessed transparency log ([ADR 0009](adr/0009-evidence-format.md)) is decided but not built.
- **The bundle carries the signer's key but does not prove whose key it is.** Confirm that the key belongs to the named Member from somewhere outside the bundle, and check the bundle against it with `--trusted-key`.
- **The offline check does not re-check each decision's own passkey assertion.** It checks the seal, which covers the decisions as recorded.
- **An unsealed bundle authenticates nothing.** It shows the entries are consistent with each other, up to a head that is only stated.
- **An export trusts each event's recorded time to place it in the window.** Moving an event's time breaks its digest, so the check catches it. But the times come from the control plane's own clock.
- **There is no retention schedule.** How long records are kept is up to you.

When these limits change, this page and [qa-standards.md](qa-standards.md) change in the same pull request.
