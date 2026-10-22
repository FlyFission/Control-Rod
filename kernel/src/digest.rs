//! Canonical digests of records.
//!
//! Records are hashed as RFC 8785 canonical JSON so the Rust kernel, the Go daemon, the Python
//! SDK and the browser compute identical digests. RFC 8785 alone leaves room for implementations
//! to disagree, so every implementation also enforces the same profile and is tested against
//! `spec/vectors/canonical-digest.json`:
//!
//! - numbers are integers with |n| <= 2^53 - 1 (no fractions, exponents or negative zero);
//!   engineering values are decimal strings with units;
//! - no object has the same key twice;
//! - containers nest at most [`MAX_DEPTH`] deep.

use serde::de::{DeserializeSeed, Deserializer, MapAccess, SeqAccess, Visitor};
use sha2::{Digest as _, Sha256};
use std::collections::HashSet;
use std::fmt::{self, Write as _};

/// Largest integer every implementation represents exactly (2^53 - 1).
pub const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

/// Deepest container nesting a record may have.
pub const MAX_DEPTH: usize = 64;

/// Why a record could not be digested. Pointers are JSON pointers; `/` is the root.
#[derive(Debug, PartialEq, Eq)]
#[non_exhaustive]
pub enum DigestError {
    /// The input was not valid JSON.
    InvalidJson(String),
    /// A number that is not an integer within +/-(2^53 - 1). Use a decimal string with units.
    NumberNotAllowed(String),
    /// An object repeats this key.
    DuplicateKey(String),
    /// A container nests deeper than [`MAX_DEPTH`].
    TooDeep(String),
}

/// Returns the lowercase hex SHA-256 of the RFC 8785 canonical form of `json`.
///
/// # Errors
/// Returns [`DigestError`] for invalid JSON or any input outside the shared profile.
pub fn canonical_sha256(json: &str) -> Result<String, DigestError> {
    let mut de = serde_json::Deserializer::from_str(json);
    let problem = Check {
        pointer: String::new(),
        depth: 0,
    }
    .deserialize(&mut de)
    .map_err(|e| DigestError::InvalidJson(e.to_string()))?;
    de.end()
        .map_err(|e| DigestError::InvalidJson(e.to_string()))?;
    if let Some(problem) = problem {
        return Err(problem);
    }
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|e| DigestError::InvalidJson(e.to_string()))?;
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

/// One strict pass over the token stream. Yields the first profile violation in document
/// order, or `None`. Syntax errors surface as the deserializer's own error.
struct Check {
    pointer: String,
    depth: usize,
}

impl Check {
    fn at(&self) -> String {
        if self.pointer.is_empty() {
            "/".into()
        } else {
            self.pointer.clone()
        }
    }

    fn child(&self, token: &str) -> Self {
        let escaped = token.replace('~', "~0").replace('/', "~1");
        Self {
            pointer: format!("{}/{escaped}", self.pointer),
            depth: self.depth + 1,
        }
    }

    fn integer(&self, magnitude: u64) -> Option<DigestError> {
        (magnitude > MAX_SAFE_INTEGER).then(|| DigestError::NumberNotAllowed(self.at()))
    }

    fn container(&self) -> Option<DigestError> {
        (self.depth >= MAX_DEPTH).then(|| DigestError::TooDeep(self.at()))
    }
}

impl<'de> DeserializeSeed<'de> for Check {
    type Value = Option<DigestError>;

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Self::Value, D::Error> {
        deserializer.deserialize_any(self)
    }
}

impl<'de> Visitor<'de> for Check {
    type Value = Option<DigestError>;

    fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("a JSON value")
    }

    fn visit_bool<E>(self, _: bool) -> Result<Self::Value, E> {
        Ok(None)
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(None)
    }

    fn visit_str<E>(self, _: &str) -> Result<Self::Value, E> {
        Ok(None)
    }

    fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E> {
        Ok(self.integer(v.unsigned_abs()))
    }

    fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E> {
        Ok(self.integer(v))
    }

    // serde_json reports fractions, exponents, negative zero and integers beyond u64 as f64.
    fn visit_f64<E>(self, _: f64) -> Result<Self::Value, E> {
        Ok(Some(DigestError::NumberNotAllowed(self.at())))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
        let mut first = self.container();
        let mut index = 0usize;
        while let Some(found) = seq.next_element_seed(self.child(&index.to_string()))? {
            first = first.or(found);
            index += 1;
        }
        Ok(first)
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut first = self.container();
        let mut seen = HashSet::new();
        while let Some(key) = map.next_key::<String>()? {
            let child = self.child(&key);
            if !seen.insert(key) {
                first = first.or(Some(DigestError::DuplicateKey(child.at())));
            }
            let found = map.next_value_seed(child)?;
            first = first.or(found);
        }
        Ok(first)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VECTORS: &str = include_str!("../../spec/vectors/canonical-digest.json");

    fn vectors() -> serde_json::Value {
        serde_json::from_str(VECTORS).unwrap_or_default()
    }

    fn field<'a>(case: &'a serde_json::Value, key: &str) -> &'a str {
        case.get(key)
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
    }

    #[test]
    fn profile_constants_match_the_vector_file() {
        let v = vectors();
        assert_eq!(v["max_safe_integer"].as_u64(), Some(MAX_SAFE_INTEGER));
        assert_eq!(v["max_depth"].as_u64(), Some(MAX_DEPTH as u64));
    }

    #[test]
    fn valid_vectors_hash_their_canonical_form() {
        let v = vectors();
        let cases = v["valid"].as_array().cloned().unwrap_or_default();
        assert!(cases.len() >= 10);
        for case in &cases {
            let expected = hex(&Sha256::digest(field(case, "canonical").as_bytes()));
            assert_eq!(
                canonical_sha256(field(case, "input")),
                Ok(expected),
                "{}",
                field(case, "name")
            );
        }
    }

    #[test]
    fn invalid_vectors_are_refused_with_the_named_error() {
        let v = vectors();
        let cases = v["invalid"].as_array().cloned().unwrap_or_default();
        assert!(cases.len() >= 18);
        for case in &cases {
            let name = field(case, "name");
            let pointer = field(case, "pointer").to_string();
            let got = canonical_sha256(field(case, "input"));
            match field(case, "error") {
                "number" => assert_eq!(got, Err(DigestError::NumberNotAllowed(pointer)), "{name}"),
                "duplicate_key" => {
                    assert_eq!(got, Err(DigestError::DuplicateKey(pointer)), "{name}")
                }
                "depth" => assert_eq!(got, Err(DigestError::TooDeep(pointer)), "{name}"),
                "invalid_json" => assert!(
                    matches!(got, Err(DigestError::InvalidJson(_))),
                    "{name}: {got:?}"
                ),
                other => assert_eq!(other, "a known error kind", "{name}"),
            }
        }
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().fold(String::new(), |mut s, b| {
            let _ = write!(s, "{b:02x}");
            s
        })
    }
}
