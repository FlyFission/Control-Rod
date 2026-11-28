# Models

Formal models of Control Rod lifecycles, and the conformance traces generated from them. These are patterns PL1 and PL2 in [`docs/patterns/plannotator.md`](../docs/patterns/plannotator.md). The models are checked by random simulation, not proved.

## Package lifecycle

[`package-lifecycle.qnt`](package-lifecycle.qnt) is a [Quint](https://quint-lang.org) model of the work package lifecycle that the kernel decides in `kernel/src/transition.rs`.

- **State:** what the server keeps between requests. That is the status, the agent that holds the claim, the author's baseline and provider, the latest pre-check outcome and whether the owner's independence override is on record.
- **Steps:** each step is one request. The server would build it from that state plus choices that vary per request: action, actor, signature, reason, checker and preparation facts. The model computes the decision the kernel's floors require. Most steps are guided toward well-formed requests so that runs make progress. One step in sixteen closes the package (return or reject), and one in four is free: any action, actor, checker and facts.
- **Invariants:** the kernel's floors in plain words, checked in every state.

| Invariant | Meaning |
| --- | --- |
| `HumanActsSigned` | Every allowed release, acceptance, return, rejection or override came from a person, with a verified assertion over the reviewed digest. |
| `AgentWorkByAgents` | Every allowed claim, output, pre-check or revision came from an agent. |
| `WorkByClaimHolder` | Every allowed output or revision came from the agent that holds the claim. |
| `PreCheckByItsChecker` | Every allowed pre-check came from the checker the request names. |
| `PreCheckIndependent` | An allowed pre-check came from another baseline, and from another known vendor family unless the owner's override is on record. The family table comes with the request. Providers compare trimmed and without ASCII case. A provider the table does not name, or a request without the table, counts as possibly the same runtime. |
| `ReviseAfterNonPass` | A revision follows a pre-check that failed or was inconclusive. |
| `AcceptanceHasPreCheck` | Acceptance has a pre-check; one that did not pass is accepted only with findings and a written reason. |
| `EnrolledReleaseReady` | An enrolled package is released only with confirmed requirements, readiness, a current basis and a matching manifest. |
| `TerminalIsFinal` | Once accepted or closed, the status never changes. An accepted package is never closed: closing means the work was turned down, and archiving a finished card is a view outside the lifecycle. |
| `OutcomeShape` | An allowed request names the next status and the reason `allowed`; a refused one names neither. |

There are also five scripted runs, as `run …Test` definitions in the model:
- a pre-check on the same provider needs the owner's override;
- a pre-check from the same vendor family, from a provider with no known family, or without the family table needs it too;
- only the claim holder submits output or revises, and only the named checker submits its pre-check;
- acceptance needs a pre-check and a signed person;
- a failed pre-check leads to a revision and a fresh, independent pre-check.

## Conformance traces

[`traces/package-lifecycle/v1/`](traces/package-lifecycle/v1/) holds request and decision sequences generated from the model. Two tests replay every step against the real kernel:

- `kernel/bindings/wasm/tests/lifecycle_traces.rs` replays them through the kernel's JSON binding, natively, in `cargo test`.
- `services/api/test/lifecycle-traces.test.ts` replays them through the compiled WebAssembly that the API runs (`services/api/kernel/`), in the API test suite. It also checks every file against the digest in `index.json`.

A mismatch fails the test and names the trace, step, request and both answers. Both suites already run in CI, so the replays need no workflow change. The model and the generator do not run in CI.

### Trace format, version 1

`index.json` names every trace file with its SHA-256, and the SHA-256 of the model that produced them. Each trace file holds:

| Field | Meaning |
| --- | --- |
| `format`, `version` | `"controlrod-package-lifecycle-trace"`, `1` |
| `name` | `gen-seed-<seed>-<run>` |
| `source` | `"generated"` |
| `generator` | Tool and version, model path and SHA-256, seed, run number and the exact command |
| `known_violations` | Empty when the kernel agrees with the model at every step. Otherwise, one entry per disagreement: `{ step, rule, today }`. `today` is what the kernel answers now, and the replays expect that answer, so fixing the kernel fails the test until the entry is removed. |
| `steps` | One object per request: `request` is the kernel's request JSON exactly as the server sends it, and `expect` is `{ allowed, reason, next }` as the kernel's JSON binding answers it. |

In the model, an absent optional field is an empty string, and an absent family table is an empty map; the traces leave both out. Runtimes carry the model name `default`, because the kernel compares providers and their families only. The model's family table is a reduced copy of the one in `daemon/internal/runner/models.json`, with one made-up provider (`anthropic-api`) that shares Claude's family, so that the family rule is exercised apart from the provider rule.

## Regenerating

```bash
bash models/generate.sh
```

The script pins Quint 0.33.1 (Apache-2.0), fetches it with `npx`, and uses its TypeScript backend, so nothing else is downloaded. It typechecks the model, runs the scripted tests, and simulates with every invariant checked. It reports witnesses: how often runs reach acceptance, closure, an independence refusal, a pre-check after an override, a revision, a refusal to an agent without the claim, and a refusal for a shared vendor family. Then it rewrites the traces. The seed, sample and step counts are fixed in the script, so the same model gives byte-identical traces. `--check` stops before writing.

Change the model only in a reviewed change. Regenerate the traces in the same change, and say in its record why the model or the parameters changed.
