# ADR 0009: in-toto evidence, Tessera transparency log

- Status: Accepted, pending Gate R test
- Date: 2026-10-22

## Decision
Receipts, execution traces, verification records and decisions are in-toto Statement v1 attestations in DSSE envelopes, one signer per attestation, signed by the Go evidence service with keys in KMS or an HSM using sigstore-go. Every attestation is appended to a Tessera transparency log whose checkpoints are cosigned by an outside witness and timestamped by an RFC 3161 authority. Postgres indexes; it is never the trust anchor.

## Alternatives considered
A custom hash chain in Postgres (an operator could recompute it), a private Rekor v2 (accepts only hashedrekord entries; DSSE is dropped).

## Evidence
rekor-tiles `CLIENTS.md` (entry types); sigstore-go `pkg/verify/signature.go` (exactly one DSSE signature).
