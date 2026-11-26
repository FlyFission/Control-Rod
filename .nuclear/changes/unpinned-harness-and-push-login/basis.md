# Basis: A passed check counts on a fresh install, and the pull request push finds the GitHub sign-in

On the owner's Mac on 2026-11-26 at 03:32Z, after #237, Codex passed both sandbox cards (R-7a86519b, R-560bd029), but the server refused both: "The executable digest is not a registered harness, so the check cannot count" (run-attestation.ts harness-unknown). The server looked the digest up only in runtime_artifact_versions, which only the passkey admin command runtime.pin fills. The daemon already treats an unpinned file that passed its probe as registered (artifact.go, #220), and it launches only that file. So the two sides disagreed, and no check on a fresh install could ever count.

A code read of the next steps found that the pull request push runs git with an empty scratch home (repos.ts publishCheckout). `gh auth git-credential` then cannot find the person's sign-in, so every push would be refused. The tests use a local bare repository, so they never needed credentials.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

With no live pin for a runtime, the server counts a check whose attested executable digest has a passing probe for that runtime, the daemon's own rule; with a pin, only pinned digests count. The pull request push gets the GitHub token read with the person's own environment. Authors are told not to commit. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
