//! WebAssembly binding of the kernel. JSON in, JSON out; no state, clock or randomness.

use controlrod_kernel::transition::{Request, decide};
use controlrod_kernel::{ReasonCode, canonical_sha256};
use wasm_bindgen::prelude::*;

fn reason_name(r: ReasonCode) -> &'static str {
    match r {
        ReasonCode::Allowed => "allowed",
        ReasonCode::NotImplemented => "not-implemented",
        ReasonCode::PolicyError => "policy-error",
        ReasonCode::Forbidden => "forbidden",
        ReasonCode::NotHuman => "not-human",
        ReasonCode::Unsigned => "unsigned",
        ReasonCode::WrongState => "wrong-state",
        ReasonCode::NotIndependent => "not-independent",
        ReasonCode::MissingPreCheck => "missing-pre-check",
        ReasonCode::ReasonRequired => "reason-required",
        _ => "forbidden",
    }
}

/// Decides a lifecycle transition. A request that does not parse is refused, never guessed.
#[wasm_bindgen]
#[must_use]
pub fn decide_json(request: &str) -> String {
    let Ok(req) = serde_json::from_str::<Request>(request) else {
        return serde_json::json!({"allowed": false, "reason": "invalid-request"}).to_string();
    };
    let out = decide(&req);
    serde_json::json!({
        "allowed": out.decision.is_allowed(),
        "reason": reason_name(out.decision.reason()),
        "next": out.next,
    })
    .to_string()
}

/// Canonical SHA-256 of a JSON record under the shared digest profile, as lowercase hex.
///
/// # Errors
/// Returns the digest profile error for input outside the profile.
#[wasm_bindgen]
pub fn canonical_sha256_hex(json: &str) -> Result<String, JsError> {
    canonical_sha256(json).map_err(|e| JsError::new(&format!("{e:?}")))
}
