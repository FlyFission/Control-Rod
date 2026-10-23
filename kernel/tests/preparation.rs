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
