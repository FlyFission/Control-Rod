# ADR 0009: in-toto evidence, Tessera transparency log

- Status: Accepted; Gate R spike passed with conditions
- Date: 2026-10-22

## Decision
Receipts, execution traces, verification records and decisions are in-toto Statement v1 attestations in DSSE envelopes, one signer per attestation, signed by the Go evidence service with keys in KMS or an HSM using sigstore-go. Every attestation is appended to a Tessera transparency log whose checkpoints are cosigned by an outside witness and timestamped by an RFC 3161 authority. Postgres indexes; it is never the trust anchor.

## Spike evidence
The full chain ran with no network: an in-toto Statement with a Control Rod predicate in a single-signature DSSE envelope, signed by sigstore-go with a stored local P-256 key (no Fulcio or Rekor), an RFC 3161 timestamp from a local sigstore TSA, and an append to a Tessera v1.0.4 POSIX log with a signed checkpoint, an omniwitness cosignature and an inclusion proof. A bundle with two signatures was refused. A log rebuilt under the same key had its first forged checkpoint refused by the witness. The path also passed with `GOFIPS140=v1.0.0` and `GODEBUG=fips140=only`.

## Conditions
1. **Writes do not block on witnesses.** Fail-closed witnessing stalled writes for the full timeout when the witness was down. An evidence write returns a pending receipt at once; the receipt becomes final when the checkpoint is cosigned. Nothing that depends on a receipt (verdicts, apply clearance) proceeds on a pending one.
2. **At least two witnesses with a threshold**, so one outage does not stop finalization.
3. **FIPS builds are checked at the link level.** `fips140=only` polices only the Go standard library; the binary still links non-validated code (`x/crypto`, `filippo.io/mldsa`) that this path never called. FIPS builds add a check that security-relevant calls resolve only to the validated module.
4. Multi-party approvals are separate attestations, one signer each, linked by subject digest.

## Alternatives considered
A custom hash chain in Postgres (an operator could recompute it), a private Rekor v2 (accepts only hashedrekord entries; DSSE is dropped).

## Evidence
rekor-tiles `CLIENTS.md` (entry types); sigstore-go `pkg/verify/signature.go` (exactly one DSSE signature); Gate R evidence spike.
