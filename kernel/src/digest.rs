//! Canonical digests of records.
//!
//! Records are hashed as RFC 8785 canonical JSON so the Rust kernel, the Go daemon and the
//! browser compute identical digests. Engineering values must be decimal strings, so any
//! non-integer JSON number in a record is refused instead of being silently re-encoded.

use sha2::{Digest as _, Sha256};
use std::fmt::Write as _;

/// Why a record could not be digested.
#[derive(Debug, PartialEq, Eq)]
#[non_exhaustive]
pub enum DigestError {
    /// The input was not valid JSON.
    InvalidJson(String),
    /// A non-integer number was found at this JSON pointer. Use a decimal string with units.
    FloatNotAllowed(String),
}

/// Returns the lowercase hex SHA-256 of the RFC 8785 canonical form of `json`.
///
/// # Errors
/// Returns [`DigestError`] for invalid JSON or any non-integer number.
pub fn canonical_sha256(json: &str) -> Result<String, DigestError> {
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|e| DigestError::InvalidJson(e.to_string()))?;
    reject_floats(&value, String::new())?;
    let canonical = serde_json_canonicalizer::to_vec(&value)
        .map_err(|e| DigestError::InvalidJson(e.to_string()))?;
    let hash = Sha256::digest(&canonical);
    let mut out = String::with_capacity(64);
    for byte in hash.iter() {
        // Writing to a String cannot fail.
        let _ = write!(out, "{byte:02x}");
    }
    Ok(out)
}

fn reject_floats(value: &serde_json::Value, pointer: String) -> Result<(), DigestError> {
    match value {
        serde_json::Value::Number(n) if !(n.is_i64() || n.is_u64()) => {
            Err(DigestError::FloatNotAllowed(if pointer.is_empty() {
                "/".into()
            } else {
                pointer
            }))
        }
        serde_json::Value::Array(items) => items
            .iter()
            .enumerate()
            .try_for_each(|(i, v)| reject_floats(v, format!("{pointer}/{i}"))),
        serde_json::Value::Object(map) => map.iter().try_for_each(|(k, v)| {
            let escaped = k.replace('~', "~0").replace('/', "~1");
            reject_floats(v, format!("{pointer}/{escaped}"))
        }),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_order_does_not_change_the_digest() {
        let a = canonical_sha256(r#"{"b":1,"a":"x","c":{"z":true,"y":null}}"#);
        let b = canonical_sha256(r#"{ "c": {"y": null, "z": true}, "a": "x", "b": 1 }"#);
        assert_eq!(a, b);
    }

    #[test]
    fn matches_the_shared_test_vector() {
        // sha256 of the canonical bytes {"a":"x","b":1}. The same vector is checked in every language.
        assert_eq!(
            canonical_sha256(r#"{"b":1,"a":"x"}"#),
            Ok("cdab067e9f3beb32d1252cfd63e492592fecbf591b0d08cadb24bb17f3864246".to_string())
        );
    }

    #[test]
    fn floats_are_refused_with_their_location() {
        assert_eq!(
            canonical_sha256(r#"{"exports":[{"value":42.5}]}"#),
            Err(DigestError::FloatNotAllowed("/exports/0/value".into()))
        );
    }

    #[test]
    fn invalid_json_is_refused() {
        assert!(matches!(
            canonical_sha256("{"),
            Err(DigestError::InvalidJson(_))
        ));
    }
}
