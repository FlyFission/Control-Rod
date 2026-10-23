use controlrod_kernel::preparation::{PreparationRequest, decide_preparation};
use controlrod_kernel::transition::{ActorKind, Status};

fn request() -> PreparationRequest {
    PreparationRequest {
        status: Status::Draft,
        actor_kind: ActorKind::Human,
        actor_id: "owner".into(),
        assertion_verified: true,
        current_digest: "a".repeat(64),
        expected_digest: "a".repeat(64),
        requirements_clear: true,
    }
}
#[test]
fn confirmation_requires_human_signature_current_requirements_and_draft() {
    let req = request();
    assert!(decide_preparation(&req).is_allowed());
    let mut bad = req.clone();
    bad.actor_kind = ActorKind::Agent;
    assert!(!decide_preparation(&bad).is_allowed());
    let mut bad = req.clone();
    bad.assertion_verified = false;
    assert!(!decide_preparation(&bad).is_allowed());
    let mut bad = req.clone();
    bad.expected_digest = "b".repeat(64);
    assert!(!decide_preparation(&bad).is_allowed());
    let mut bad = req.clone();
    bad.requirements_clear = false;
    assert!(!decide_preparation(&bad).is_allowed());
    let mut bad = req.clone();
    bad.status = Status::Released;
    assert!(!decide_preparation(&bad).is_allowed());
    let mut bad = req;
    bad.actor_id = " ".into();
    assert!(!decide_preparation(&bad).is_allowed());
}

#[test]
fn enrolled_release_defaults_closed_and_requires_complete_guard() {
    use controlrod_kernel::preparation::PreparationGuard;
    use controlrod_kernel::transition::{Action, Request, decide};
    let mut req = Request {
        status: Status::Draft,
        action: Action::Release,
        actor_kind: ActorKind::Human,
        actor_id: "owner".into(),
        author_baseline: None,
        checker_baseline: None,
        author_runtime: None,
        checker_runtime: None,
        owner_override_verified: false,
        pre_check: None,
        assertion_verified: true,
        digest_matches: true,
        reason_given: false,
        preparation: Some(PreparationGuard::default()),
    };
    assert!(!decide(&req).decision.is_allowed());
    req.preparation = Some(PreparationGuard {
        requirements_confirmed: true,
        ready_for_release: true,
        basis_current: true,
        manifest_matches: true,
        ..PreparationGuard::default()
    });
    assert!(decide(&req).decision.is_allowed());
    if let Some(guard) = req.preparation.as_mut() {
        guard.manifest_matches = false;
    }
    assert!(!decide(&req).decision.is_allowed());
    req.preparation = None;
    assert!(decide(&req).decision.is_allowed());
}
