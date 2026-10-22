# ADR 0017: Provider neutrality and the FIPS boundary

- Status: Accepted
- Date: 2026-10-22

## Decision
No dependency may tie Control Rod to one model vendor or cloud; vendor-authored open source sits behind our own interfaces. All security cryptography (signing, verification, evidence hashing) runs in Go or Rust, never in Node.
