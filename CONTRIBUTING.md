# Contributing

Thank you for your interest in Control Rod. The project is pre-alpha, and the foundation is being laid in the open.

## Current status

Outside code contributions open after Phase 1, once the kernel and its tests exist. Before then we will publish a contributor license agreement, so the project can keep its open-core licensing options. Issues and discussion are welcome now, especially reports of ways an agent could get around a control.

## If you have been invited to build

Core collaborators are invited by the owner. Start with [docs/getting-started.md](docs/getting-started.md) to run and test the project, and [docs/collaboration.md](docs/collaboration.md) for how issues, pull requests, reviews and merges work day to day. The rules below apply to everyone, including agents you drive.

## How changes are made here

Control Rod is built under its own discipline from the first commit.

1. **Every change has a change record** under `.nuclear/changes/`, following [nuclear-grade context engineering](https://github.com/FlyFission/nuclear-grade-context-engineering). Small administrative changes may use the commit message as the record.
2. **Contracts come first.** Records and APIs are defined in TypeSpec under `spec/`, and every language generates from them. Do not hand-edit generated code.
3. **Trust surfaces need a human signature.** Changes to `policies/`, `tests/redteam/`, CI workflows, and the kernel's decision functions require review by a maintainer who did not author them.
4. **Red-team tests are first-class.** Every known way around a control becomes a test that must keep failing.
5. **Licenses are checked.** Shipped code may depend only on permissive licenses (MIT, Apache-2.0, BSD, ISC, MPL-2.0). Code ported from another project keeps its notice and is listed in `THIRD_PARTY_NOTICES.md`.

## Sign-off

Every commit must carry a Developer Certificate of Origin sign-off (`git commit -s`), certifying you have the right to submit it under the Apache License 2.0.
