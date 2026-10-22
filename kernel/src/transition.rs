//! Package lifecycle transitions: the core floors of the MVP.
//!
//! Every state change on a work package is a request to this function. It refuses by default
//! and allows only what a rule names. The floors it holds:
//!
//! 1. Only a person can release, accept, return or reject, and only with a passkey assertion
//!    the server verified over the digest of exactly what that person reviewed.
//! 2. Agents can claim released work, submit output and submit a pre-check. Nothing else.
//! 3. The pre-check comes from a different agent baseline than the author's.
//! 4. An author may revise only after a pre-check that did not pass.
//! 5. Acceptance needs a pre-check. A pre-check that did not pass can be accepted only with a
//!    written reason.
//!
//! Trust surface: changes here need the owner's signature (AGENTS.md rule 2).

use crate::decision::{Decision, ReasonCode};
use serde::{Deserialize, Serialize};

/// Package lifecycle states, matching `PackageStatus` in the contracts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    Draft,
    Released,
    InWork,
    InVerification,
    Accepted,
    Closed,
}

/// What is being asked for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Action {
    Release,
    Claim,
    SubmitOutput,
    SubmitPreCheck,
    /// The author takes its work back to fix a pre-check that did not pass.
    Revise,
    Accept,
    AcceptWithFindings,
    Return,
    Reject,
}

impl Action {
    const fn human_only(self) -> bool {
        matches!(
            self,
            Self::Release | Self::Accept | Self::AcceptWithFindings | Self::Return | Self::Reject
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ActorKind {
    Human,
    Agent,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PreCheckOutcome {
    Pass,
    Fail,
    Inconclusive,
}

/// Everything the kernel needs, supplied by the server. The kernel reads no state of its own.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub status: Status,
    pub action: Action,
    pub actor_kind: ActorKind,
    pub actor_id: String,
    /// Agent baseline that authored the current output, once there is one.
    #[serde(default)]
    pub author_baseline: Option<String>,
    /// Agent baseline asking to submit a pre-check, for `SubmitPreCheck`.
    #[serde(default)]
    pub checker_baseline: Option<String>,
    /// Outcome of the pre-check on the current output, if one exists.
    #[serde(default)]
    pub pre_check: Option<PreCheckOutcome>,
    /// The server verified a passkey assertion from this person.
    #[serde(default)]
    pub assertion_verified: bool,
    /// The assertion's challenge was the digest of the revision, output and pre-check now on record.
    #[serde(default)]
    pub digest_matches: bool,
    /// A non-empty written reason accompanies the request.
    #[serde(default)]
    pub reason_given: bool,
}

/// The kernel's answer: the decision and, when allowed, the state the package moves to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
    pub decision: Decision,
    pub next: Option<Status>,
}

const fn refuse(reason: ReasonCode) -> Outcome {
    Outcome {
        decision: Decision::deny(reason),
        next: None,
    }
}

const fn allow(next: Status) -> Outcome {
    Outcome {
        decision: Decision::allow(),
        next: Some(next),
    }
}

/// Decides one lifecycle transition.
#[must_use]
pub fn decide(req: &Request) -> Outcome {
    if req.actor_id.trim().is_empty() {
        return refuse(ReasonCode::Forbidden);
    }
    if req.action.human_only() {
        if req.actor_kind != ActorKind::Human {
            return refuse(ReasonCode::NotHuman);
        }
        if !req.assertion_verified || !req.digest_matches {
            return refuse(ReasonCode::Unsigned);
        }
    } else if req.actor_kind != ActorKind::Agent {
        // Claims and submissions come from agents through the runner, never from a person's
        // session, so a person cannot pose as the author or the checker either.
        return refuse(ReasonCode::Forbidden);
    }

    use Action as A;
    use Status as S;
    match (req.action, req.status) {
        (A::Release, S::Draft) => allow(S::Released),
        (A::Claim, S::Released) => allow(S::InWork),
        (A::SubmitOutput, S::InWork) => allow(S::InVerification),
        (A::SubmitPreCheck, S::InVerification) => {
            match (
                req.author_baseline.as_deref(),
                req.checker_baseline.as_deref(),
            ) {
                (Some(author), Some(checker)) if author != checker => allow(S::InVerification),
                (Some(_), Some(_)) => refuse(ReasonCode::NotIndependent),
                _ => refuse(ReasonCode::Forbidden),
            }
        }
        (A::Revise, S::InVerification) => match req.pre_check {
            Some(PreCheckOutcome::Fail | PreCheckOutcome::Inconclusive) => allow(S::InWork),
            Some(PreCheckOutcome::Pass) => refuse(ReasonCode::WrongState),
            None => refuse(ReasonCode::MissingPreCheck),
        },
        (A::Accept, S::InVerification) => match req.pre_check {
            Some(PreCheckOutcome::Pass) => allow(S::Accepted),
            Some(_) => refuse(ReasonCode::ReasonRequired),
            None => refuse(ReasonCode::MissingPreCheck),
        },
        (A::AcceptWithFindings, S::InVerification) => match (req.pre_check, req.reason_given) {
            (None, _) => refuse(ReasonCode::MissingPreCheck),
            (Some(_), false) => refuse(ReasonCode::ReasonRequired),
            (Some(_), true) => allow(S::Accepted),
        },
        (A::Return, S::Released | S::InWork | S::InVerification) => {
            if req.reason_given {
                allow(S::Draft)
            } else {
                refuse(ReasonCode::ReasonRequired)
            }
        }
        (A::Reject, S::Draft | S::Released | S::InWork | S::InVerification) => {
            if req.reason_given {
                allow(S::Closed)
            } else {
                refuse(ReasonCode::ReasonRequired)
            }
        }
        _ => refuse(ReasonCode::WrongState),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn human(action: Action, status: Status) -> Request {
        Request {
            status,
            action,
            actor_kind: ActorKind::Human,
            actor_id: "ben".into(),
            author_baseline: Some("author-1".into()),
            checker_baseline: None,
            pre_check: Some(PreCheckOutcome::Pass),
            assertion_verified: true,
            digest_matches: true,
            reason_given: false,
        }
    }

    fn agent(action: Action, status: Status) -> Request {
        Request {
            actor_kind: ActorKind::Agent,
            actor_id: "author-1".into(),
            assertion_verified: false,
            digest_matches: false,
            ..human(action, status)
        }
    }

    const HUMAN_ACTIONS: [Action; 5] = [
        Action::Release,
        Action::Accept,
        Action::AcceptWithFindings,
        Action::Return,
        Action::Reject,
    ];
    const ALL_STATUSES: [Status; 6] = [
        Status::Draft,
        Status::Released,
        Status::InWork,
        Status::InVerification,
        Status::Accepted,
        Status::Closed,
    ];

    #[test]
    fn no_agent_or_system_can_take_a_human_action_in_any_state() {
        for action in HUMAN_ACTIONS {
            for status in ALL_STATUSES {
                for kind in [ActorKind::Agent, ActorKind::System] {
                    let mut r = human(action, status);
                    r.actor_kind = kind;
                    r.reason_given = true;
                    let out = decide(&r);
                    assert!(!out.decision.is_allowed(), "{kind:?} {action:?} {status:?}");
                    assert_eq!(out.decision.reason(), ReasonCode::NotHuman);
                }
            }
        }
    }

    #[test]
    fn a_human_action_without_a_matching_signature_is_refused() {
        for action in HUMAN_ACTIONS {
            for (verified, matches) in [(false, true), (true, false), (false, false)] {
                let mut r = human(action, Status::InVerification);
                r.assertion_verified = verified;
                r.digest_matches = matches;
                r.reason_given = true;
                assert_eq!(decide(&r).decision.reason(), ReasonCode::Unsigned);
            }
        }
    }

    #[test]
    fn a_person_cannot_pose_as_an_agent() {
        for action in [Action::Claim, Action::SubmitOutput, Action::SubmitPreCheck] {
            let r = human(action, Status::InVerification);
            assert!(!decide(&r).decision.is_allowed());
        }
    }

    #[test]
    fn the_happy_path_walks_draft_to_accepted() {
        assert_eq!(
            decide(&human(Action::Release, Status::Draft)).next,
            Some(Status::Released)
        );
        assert_eq!(
            decide(&agent(Action::Claim, Status::Released)).next,
            Some(Status::InWork)
        );
        assert_eq!(
            decide(&agent(Action::SubmitOutput, Status::InWork)).next,
            Some(Status::InVerification)
        );
        let mut check = agent(Action::SubmitPreCheck, Status::InVerification);
        check.actor_id = "checker-1".into();
        check.checker_baseline = Some("checker-1".into());
        assert!(decide(&check).decision.is_allowed());
        assert_eq!(
            decide(&human(Action::Accept, Status::InVerification)).next,
            Some(Status::Accepted)
        );
    }

    #[test]
    fn revision_follows_only_a_pre_check_that_did_not_pass() {
        let mut r = agent(Action::Revise, Status::InVerification);
        assert_eq!(decide(&r).decision.reason(), ReasonCode::WrongState);
        r.pre_check = None;
        assert_eq!(decide(&r).decision.reason(), ReasonCode::MissingPreCheck);
        r.pre_check = Some(PreCheckOutcome::Fail);
        assert_eq!(decide(&r).next, Some(Status::InWork));
        assert!(
            !decide(&human(Action::Revise, Status::InVerification))
                .decision
                .is_allowed()
        );
    }

    #[test]
    fn the_author_cannot_pre_check_its_own_work() {
        let mut r = agent(Action::SubmitPreCheck, Status::InVerification);
        r.checker_baseline = Some("author-1".into());
        assert_eq!(decide(&r).decision.reason(), ReasonCode::NotIndependent);
    }

    #[test]
    fn a_pre_check_without_known_baselines_is_refused() {
        let mut r = agent(Action::SubmitPreCheck, Status::InVerification);
        r.author_baseline = None;
        r.checker_baseline = Some("checker-1".into());
        assert!(!decide(&r).decision.is_allowed());
    }

    #[test]
    fn acceptance_needs_a_pre_check_and_a_reason_when_it_did_not_pass() {
        let mut r = human(Action::Accept, Status::InVerification);
        r.pre_check = None;
        assert_eq!(decide(&r).decision.reason(), ReasonCode::MissingPreCheck);
        r.pre_check = Some(PreCheckOutcome::Fail);
        assert_eq!(decide(&r).decision.reason(), ReasonCode::ReasonRequired);

        let mut w = human(Action::AcceptWithFindings, Status::InVerification);
        w.pre_check = Some(PreCheckOutcome::Inconclusive);
        assert_eq!(decide(&w).decision.reason(), ReasonCode::ReasonRequired);
        w.reason_given = true;
        assert_eq!(decide(&w).next, Some(Status::Accepted));
    }

    #[test]
    fn return_and_reject_need_a_reason() {
        for (action, next) in [
            (Action::Return, Status::Draft),
            (Action::Reject, Status::Closed),
        ] {
            let mut r = human(action, Status::InVerification);
            assert_eq!(decide(&r).decision.reason(), ReasonCode::ReasonRequired);
            r.reason_given = true;
            assert_eq!(decide(&r).next, Some(next));
        }
    }

    #[test]
    fn accepted_and_closed_packages_never_move() {
        for status in [Status::Accepted, Status::Closed] {
            for action in HUMAN_ACTIONS {
                let mut r = human(action, status);
                r.reason_given = true;
                assert!(
                    !decide(&r).decision.is_allowed(),
                    "{action:?} on {status:?}"
                );
            }
            for action in [
                Action::Claim,
                Action::SubmitOutput,
                Action::SubmitPreCheck,
                Action::Revise,
            ] {
                assert!(!decide(&agent(action, status)).decision.is_allowed());
            }
        }
    }

    #[test]
    fn unknown_fields_in_a_request_are_rejected() {
        let json = r#"{"status":"draft","action":"release","actor_kind":"human","actor_id":"b","approved_by_agent":true}"#;
        assert!(serde_json::from_str::<Request>(json).is_err());
    }
}
