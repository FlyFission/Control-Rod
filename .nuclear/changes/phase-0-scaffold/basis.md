# Basis: Phase 0 scaffold

**Purpose:** State what must stay true for the scaffold to be a sound base for every later phase.

**Change slug:** `phase-0-scaffold`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Change context

- **Slug:** `phase-0-scaffold`
- **Related risk record:** `risk.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Decision this basis supports:** whether the scaffold can merge to `main` as the base for Phase 1.

## Mission / need

Control Rod's value rests on records that every component reads the same way and on a kernel that refuses anything it was not built to allow. Those properties are cheapest to establish in the first commit and most expensive to retrofit. Phase 0 establishes them before any feature exists.

## Protected outcomes

| Protected outcome | Why it matters | Evidence needed |
|---|---|---|
| A record that breaks the contract is refused at the API boundary. | Malformed or padded records would carry unchecked claims into the system. | API tests for missing required fields, floats, bad enums and unknown fields at the top level and nested. |
| The same record gives the same digest in Rust, Go and Python. | Signatures and evidence bind to digests; a cross-language mismatch breaks verification. | All 29 shared vectors in `spec/vectors/canonical-digest.json` passing in all three languages. |
| Engineering values are never floats. | Floats lose precision silently; Control Rod requires decimal strings with units. | Float refusal tests in the API and in all three digests. |
| The kernel refuses by default. | A decision type that allows by default would make every later bug an approval. | Kernel tests: undecided requests deny; denials never allow; `allow` is crate-private. |
| Shipped code carries permissive licenses only. | Copyleft or source-available code would break the open-core license plan. | Node, Rust and Go license gates passing. |

## Unacceptable outcomes

| Unacceptable outcome | Consequence | Prevent / detect / mitigate |
|---|---|---|
| A record with an unknown field such as `approved_by_agent` is stored. | Agents could add self-serving fields that later code reads. | Closed schemas (`unevaluatedProperties: false`) on every record model; RT-015 tests. |
| Generated schemas drift from the TypeSpec source. | Languages disagree about the contract. | CI regenerates and fails on any diff. |
| Digest implementations disagree on key order or non-ASCII keys. | Signatures verify in one language and fail in another. | One shared profile (safe integers, no duplicate keys, depth 64) and the shared vector file, including UTF-16 key order. |
| A GPL or AGPL dependency enters through a transitive update. | License obligations on shipped code. | Gates in CI on every pull request; Dependabot updates pass through the same gates. |

## Assumptions, constraints, and invalidation triggers

| Assumption / constraint | Basis or source | Invalidation trigger | Owner |
|---|---|---|---|
| RFC 8785 canonicalization is enough for record digests. | Standard used by in-toto and Sigstore tooling. | A record type that needs binary content or floats. | Ben Huffer |
| The pinned TypeSpec 1.17 emitters produce stable output. | Local regeneration produced no diff across runs. | Any TypeSpec upgrade. | Ben Huffer |
| The three license tools read licenses correctly. | Each is widely used in its ecosystem. | A dependency with a nonstandard or missing license file. | Ben Huffer |
| GitHub-hosted CI matches local results. | Same pinned toolchain through mise. | First CI run on the pull request. | Ben Huffer |

## Grounding status

| Claim area | Grounded in | Status |
|---|---|---|
| Stack choices | Reuse survey of about 130 repositories, adversarial review, ADRs 0003 to 0017 | pass |
| Sandbox and gateway choices | Spike results in the research workspace | pass with conditions recorded in ADRs 0010 and 0014 |
| Postgres and DBOS choices | Spike results; conditions recorded in ADRs 0006 and 0007 | pass with conditions |
| Evidence and ACP choices | Spike results; conditions recorded in ADRs 0009 and 0011 | pass with conditions |
| Contracts and kernel WASM choices | Spike still running | planned |

## Interfaces and trust boundaries

- **Internal interfaces affected:** `POST /packages` and `GET /health` on the control-plane skeleton; digest functions in three languages.
- **External services/APIs affected:** none at runtime. CI uses GitHub Actions pinned by commit hash.
- **Data classes affected:** example work package only; no customer data.
- **Human approval boundaries:** the owner merges; trust-surface paths are listed in `CODEOWNERS`.
- **AI/model/tool authority boundaries:** the AI agent wrote files and ran local commands; it cannot merge to `main`.

## Dependency / model / supplier intended use

| Dependency/model/service | Intended use | Consequence if wrong/unavailable/compromised | Evidence or compensating control | Revalidation trigger |
|---|---|---|---|---|
| TypeSpec 1.17 | Emit JSON Schema and OpenAPI | Wrong contracts | Drift check; API tests against generated schemas | Version change |
| Ajv 8 with Ajv2020 | Validate request bodies | Bad records accepted | API tests including negative cases | Version change |
| serde_json_canonicalizer, gowebpki/jcs, Python stdlib | RFC 8785 canonicalization | Digest mismatch | Shared vector file in all three | Version change |
| sha2 crate, Go crypto/sha256, hashlib | SHA-256 | Wrong digests | Shared vector file | Version change; FIPS build work |
| cargo-deny, go-licenses, `tools/license-gate.mjs` | License gates | Copyleft code ships | Three independent gates | Tool upgrade |

## Derived requirements or claims

| ID | Requirement / claim | Basis | Design feature or control | Evidence planned |
|---|---|---|---|---|
| C-001 | The control plane refuses any work package that breaks the contract, including unknown fields at any depth. | Protected outcome 1 | Ajv2020 strict validation against closed generated schemas | 6 negative and positive API tests |
| C-002 | Rust, Go and Python produce the same canonical digest for the same record. | Protected outcome 2 | RFC 8785 plus SHA-256 and one shared profile in each language | `spec/vectors/canonical-digest.json` tested in each language |
| C-003 | Numbers that are not integers within +/-(2^53 - 1) are refused by all three digests, and fractions by the API. | Protected outcome 3 | Decimal-string `Quantity` type; float checks with JSON pointer | API float test; three digest float tests |
| C-004 | The kernel decision type refuses by default. | Protected outcome 4 | `Decision::undecided()` denies; `allow` is crate-private | Two kernel tests; clippy with unwrap, expect and panic denied |
| C-005 | Shipped dependencies carry permissive licenses only. | Protected outcome 5 | Three license gates | Gate output |
| C-006 | Generated contracts match the TypeSpec source. | Unacceptable outcome 2 | CI regenerate-and-diff step | Local compile; CI run |
| C-007 | All checks run on every pull request on GitHub. | Assumption 4 | `.github/workflows/ci.yml` | First CI run |

## Design outline

TypeSpec in `spec/` emits JSON Schema 2020-12 and OpenAPI 3.1 into `spec/generated/`. The control plane loads those schemas into Ajv and validates bodies before any handler runs. The kernel is a pure Rust library with no I/O. The daemon and SDK carry their own digest implementations, tied to the kernel by a shared test vector. Each ecosystem has its own license gate, and CI runs all of them.

## Required links

- `risk.md`, `plan.md`, `trace.md`, `verification.md`, `ship.md`
- `spec/records.tsp`, `services/api/test/app.test.ts`, `kernel/src/`, `daemon/internal/digest/`, `sdk/python/`

## Exit criteria

- Builder and reviewer can say what must stay true.
- Every assumption has an invalidation trigger.
- Evidence needs flow into `verification.md`.

## Source-lineage note

Basis structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. Canonical JSON follows RFC 8785 (https://www.rfc-editor.org/rfc/rfc8785). No compliance claim is made.
