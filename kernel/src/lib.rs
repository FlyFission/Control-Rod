//! Control Rod kernel.
//!
//! The kernel is the only component that decides state changes. It is a pure library:
//! no network, no clock, no randomness and no file access. Everything it needs comes in as
//! arguments, so the same inputs always produce the same decision on every surface.
//!
//! Phase 0 scope: the decision type every kernel function returns, the fail-closed default,
//! and canonical digests of records (RFC 8785). Lifecycle, arbiter, Cedar authority and
//! custody derivation arrive in Phase 1.

pub mod decision;
pub mod digest;
pub mod transition;

pub use decision::{Decision, ReasonCode, undecided};
pub use digest::{DigestError, canonical_sha256};
