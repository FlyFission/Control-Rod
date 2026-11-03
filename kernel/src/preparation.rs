//! Human requirements confirmation. Pure, fail-closed; no package release authority here.
//! Human authorization for this trust surface is recorded in the platform-buildout basis.
use crate::decision::{Decision, ReasonCode};
use crate::transition::{ActorKind, Status};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreparationRequest {
    pub status: Status,
    pub actor_kind: ActorKind,
    pub actor_id: String,
    pub assertion_verified: bool,
    pub current_digest: String,
    pub expected_digest: String,
    pub requirements_clear: bool,
}

#[must_use]
pub fn decide_preparation(req: &PreparationRequest) -> Decision {
    if req.actor_kind != ActorKind::Human {
        return Decision::deny(ReasonCode::NotHuman);
    }
    if req.actor_id.trim().is_empty() {
        return Decision::deny(ReasonCode::Forbidden);
    }
    if req.status != Status::Draft {
        return Decision::deny(ReasonCode::WrongState);
    }
    let valid_digest = req.current_digest.len() == 64
        && req
            .current_digest
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
    if !req.assertion_verified || !valid_digest || req.current_digest != req.expected_digest {
        return Decision::deny(ReasonCode::Unsigned);
    }
    if !req.requirements_clear {
        return Decision::deny(ReasonCode::Forbidden);
    }
    Decision::allow()
}

/// Server-derived preparation facts. Presence enrolls the request; omitted facts refuse.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct PreparationGuard {
    pub requirements_confirmed: bool,
    pub ready_for_release: bool,
    pub basis_current: bool,
    pub manifest_matches: bool,
    pub results_complete: bool,
    pub required_checks_complete: bool,
    pub results_pass: bool,
}
