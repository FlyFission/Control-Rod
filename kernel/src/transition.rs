//! Package lifecycle transitions: the core floors of the MVP.
//!
//! Every state change on a work package is a request to this function. It refuses by default
//! and allows only what a rule names. The floors it holds:
//!
//! 1. Only a person can release, accept, return or reject, and only with a passkey assertion
//!    the server verified over the digest of exactly what that person reviewed.
//! 2. Agents can claim released work, submit output and submit a pre-check. Nothing else.
//! 3. The pre-check comes from a different agent baseline than the author's, on a different
//!    provider. The same provider counts as the same runtime whatever the models. A pre-check on
//!    the author's provider is allowed only after the owner's override, a human act signed with
//!    a passkey over its digest and carrying a written reason.
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
    /// The owner lets a pre-check run on the author's provider. Signed like a decision.
    OverrideIndependence,
}

impl Action {
    const fn human_only(self) -> bool {
        matches!(
            self,
            Self::Release
                | Self::Accept
                | Self::AcceptWithFindings
                | Self::Return
                | Self::Reject
                | Self::OverrideIndependence
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

/// Package quality grade, matching `WorkPackage.grade` in `spec/records.tsp`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Grade {
    GeneralService,
    Material,
    Safety,
}

/// Normalizes a runtime provider, vendor, or family token to its canonical vendor slot.
/// Returns `None` for empty or whitespace-only inputs.
#[must_use]
pub fn canonicalize_token(raw: &str) -> Option<String> {
    let norm = raw.trim().to_ascii_lowercase();
    if norm.is_empty() {
        return None;
    }
    Some(match norm.as_str() {
        "claude" | "anthropic" | "claude-code" => "anthropic".to_owned(),
        "codex" | "openai" => "openai".to_owned(),
        "grok" | "xai" | "grok-cli" => "xai".to_owned(),
        "agy" | "antigravity" | "gemini" | "gemini-cli" | "google" => "google".to_owned(),
        "ollama" | "local-ollama" | "ollama-local" => "ollama-local".to_owned(),
        _ => norm,
    })
}

/// The runtime that ran an agent: provider, model, and optional vendor/family provenance.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeIdentity {
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub vendor: Option<String>,
    #[serde(default)]
    pub family: Option<String>,
}

impl RuntimeIdentity {
    fn canonical_tokens(&self) -> Vec<String> {
        [
            Some(self.provider.as_str()),
            self.vendor.as_deref(),
            self.family.as_deref(),
        ]
        .into_iter()
        .flatten()
        .filter_map(canonicalize_token)
        .collect()
    }

    /// True when both sides count as the same runtime or vendor family.
    /// Fails closed if either side carries zero canonical tokens or any token overlaps;
    /// extra `vendor`/`family` fields can only make the check stricter, never looser.
    #[must_use]
    pub fn may_be_same(&self, other: &Self) -> bool {
        let self_tokens = self.canonical_tokens();
        let other_tokens = other.canonical_tokens();
        if self_tokens.is_empty() || other_tokens.is_empty() {
            return true;
        }
        self_tokens
            .iter()
            .any(|token| other_tokens.iter().any(|other_token| token == other_token))
    }
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
    /// Runtime that produced the author's current output, for `SubmitPreCheck`.
    #[serde(default)]
    pub author_runtime: Option<RuntimeIdentity>,
    /// Runtime that ran the pre-check, for `SubmitPreCheck`.
    #[serde(default)]
    pub checker_runtime: Option<RuntimeIdentity>,
    /// The owner's override for this pre-check was allowed by this kernel as a signed human act
    /// (`OverrideIndependence`) before the pre-check ran. The server sets it only from that
    /// stored, passkey-verified override.
    #[serde(default)]
    pub owner_override_verified: bool,
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
    /// Present only for an enrolled package; facts come from controlled server records.
    #[serde(default)]
    pub preparation: Option<crate::preparation::PreparationGuard>,
    /// Optional package quality grade, used to enforce Safety-grade floors.
    #[serde(default)]
    pub grade: Option<Grade>,
    /// Server-verified daemon run-attestation verdict for `SubmitPreCheck`.
    #[serde(default)]
    pub attestation_verified: Option<bool>,
    /// Server-verified 2-of-2 distinct checker vendor family quorum for `Accept` / `AcceptWithFindings`.
    #[serde(default)]
    pub safety_quorum_met: Option<bool>,
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

const fn attestation_allows(req: &Request) -> bool {
    !matches!(req.attestation_verified, Some(false))
        && (!matches!(req.grade, Some(Grade::Safety))
            || matches!(req.attestation_verified, Some(true)))
}

const fn safety_quorum_allows(req: &Request) -> bool {
    !matches!(req.safety_quorum_met, Some(false))
        && (!matches!(req.grade, Some(Grade::Safety))
            || matches!(req.safety_quorum_met, Some(true)))
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

    if let Some(p) = &req.preparation {
        let allowed = match req.action {
            Action::Release => {
                p.requirements_confirmed
                    && p.ready_for_release
                    && p.basis_current
                    && p.manifest_matches
            }
            Action::Claim | Action::SubmitOutput | Action::SubmitPreCheck | Action::Revise => {
                p.requirements_confirmed && p.basis_current && p.manifest_matches
            }
            Action::Accept | Action::AcceptWithFindings => {
                p.requirements_confirmed
                    && p.basis_current
                    && p.manifest_matches
                    && p.results_complete
                    && p.required_checks_complete
                    && (req.action == Action::AcceptWithFindings || p.results_pass)
            }
            Action::Return | Action::Reject | Action::OverrideIndependence => true,
        };
        if !allowed {
            return refuse(ReasonCode::Forbidden);
        }
    }
    use Action as A;
    use Status as S;
    match (req.action, req.status) {
        (A::Release, S::Draft) => allow(S::Released),
        (A::Claim, S::Released) => allow(S::InWork),
        (A::SubmitOutput, S::InWork) => allow(S::InVerification),
        (A::SubmitPreCheck, S::InVerification) => match (
            req.author_baseline.as_deref(),
            req.checker_baseline.as_deref(),
            req.author_runtime.as_ref(),
            req.checker_runtime.as_ref(),
        ) {
            (Some(author), Some(checker), _, _) if author == checker => {
                refuse(ReasonCode::NotIndependent)
            }
            (Some(_), Some(_), Some(author), Some(checker)) => {
                if !attestation_allows(req) {
                    refuse(ReasonCode::Forbidden)
                } else if author.may_be_same(checker) && !req.owner_override_verified {
                    refuse(ReasonCode::NotIndependent)
                } else {
                    allow(S::InVerification)
                }
            }
            _ => refuse(ReasonCode::Forbidden),
        },
        (A::Revise, S::InVerification) => match req.pre_check {
            Some(PreCheckOutcome::Fail | PreCheckOutcome::Inconclusive) => allow(S::InWork),
            Some(PreCheckOutcome::Pass) => refuse(ReasonCode::WrongState),
            None => refuse(ReasonCode::MissingPreCheck),
        },
        (A::Accept, S::InVerification) => match req.pre_check {
            Some(PreCheckOutcome::Pass) => {
                if safety_quorum_allows(req) {
                    allow(S::Accepted)
                } else {
                    refuse(ReasonCode::Forbidden)
                }
            }
            Some(_) => refuse(ReasonCode::ReasonRequired),
            None => refuse(ReasonCode::MissingPreCheck),
        },
        (A::AcceptWithFindings, S::InVerification) => match (req.pre_check, req.reason_given) {
            (None, _) => refuse(ReasonCode::MissingPreCheck),
            (Some(_), false) => refuse(ReasonCode::ReasonRequired),
            (Some(_), true) => {
                if safety_quorum_allows(req) {
                    allow(S::Accepted)
                } else {
                    refuse(ReasonCode::Forbidden)
                }
            }
        },
        (A::OverrideIndependence, S::InVerification) => {
            if req.reason_given {
                allow(S::InVerification)
            } else {
                refuse(ReasonCode::ReasonRequired)
            }
        }
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

    fn rt(provider: &str, model: &str) -> RuntimeIdentity {
        RuntimeIdentity {
            provider: provider.into(),
            model: model.into(),
            vendor: None,
            family: None,
        }
    }

    fn rt_full(
        provider: &str,
        model: &str,
        vendor: Option<&str>,
        family: Option<&str>,
    ) -> RuntimeIdentity {
        RuntimeIdentity {
            provider: provider.into(),
            model: model.into(),
            vendor: vendor.map(Into::into),
            family: family.map(Into::into),
        }
    }

    fn human(action: Action, status: Status) -> Request {
        Request {
            status,
            action,
            actor_kind: ActorKind::Human,
            actor_id: "ben".into(),
            author_baseline: Some("author-1".into()),
            checker_baseline: None,
            author_runtime: Some(rt("claude", "default")),
            checker_runtime: Some(rt("codex", "default")),
            owner_override_verified: false,
            pre_check: Some(PreCheckOutcome::Pass),
            assertion_verified: true,
            digest_matches: true,
            reason_given: false,
            preparation: None,
            grade: None,
            attestation_verified: None,
            safety_quorum_met: None,
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

    const HUMAN_ACTIONS: [Action; 6] = [
        Action::Release,
        Action::Accept,
        Action::AcceptWithFindings,
        Action::Return,
        Action::Reject,
        Action::OverrideIndependence,
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
    fn a_pre_check_on_the_authors_runtime_needs_an_owner_override() {
        let mut r = agent(Action::SubmitPreCheck, Status::InVerification);
        r.checker_baseline = Some("checker-1".into());
        for (author, checker) in [
            (rt("claude", "default"), rt("claude", "default")),
            (rt("claude", "claude-opus-4-1"), rt("Claude", "default")),
            (rt("codex", "gpt-5-codex"), rt("codex", "gpt-5-codex")),
        ] {
            r.author_runtime = Some(author);
            r.checker_runtime = Some(checker);
            r.owner_override_verified = false;
            assert_eq!(decide(&r).decision.reason(), ReasonCode::NotIndependent);
            r.owner_override_verified = true;
            assert_eq!(decide(&r).next, Some(Status::InVerification));
        }
        r.owner_override_verified = false;
        r.author_runtime = Some(rt("claude", "claude-opus-4-1"));
        r.checker_runtime = Some(rt("claude", "claude-sonnet-4-5"));
        assert_eq!(decide(&r).decision.reason(), ReasonCode::NotIndependent);
        r.checker_runtime = Some(rt("codex", "claude-opus-4-1"));
        assert!(decide(&r).decision.is_allowed());
    }

    #[test]
    fn the_override_is_a_signed_human_act_with_a_reason_while_in_verification() {
        let mut r = human(Action::OverrideIndependence, Status::InVerification);
        assert_eq!(decide(&r).decision.reason(), ReasonCode::ReasonRequired);
        r.reason_given = true;
        assert_eq!(decide(&r).next, Some(Status::InVerification));
        r.assertion_verified = false;
        assert_eq!(decide(&r).decision.reason(), ReasonCode::Unsigned);
        for status in [Status::Draft, Status::Released, Status::InWork] {
            let mut w = human(Action::OverrideIndependence, status);
            w.reason_given = true;
            assert_eq!(decide(&w).decision.reason(), ReasonCode::WrongState);
        }
        let mut a = agent(Action::OverrideIndependence, Status::InVerification);
        a.reason_given = true;
        assert_eq!(decide(&a).decision.reason(), ReasonCode::NotHuman);
    }

    #[test]
    fn an_override_never_lets_the_author_check_itself_and_runtimes_must_be_known() {
        let mut r = agent(Action::SubmitPreCheck, Status::InVerification);
        r.checker_baseline = Some("author-1".into());
        r.owner_override_verified = true;
        assert_eq!(decide(&r).decision.reason(), ReasonCode::NotIndependent);
        r.checker_baseline = Some("checker-1".into());
        r.checker_runtime = None;
        assert_eq!(decide(&r).decision.reason(), ReasonCode::Forbidden);
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

    #[test]
    fn canonicalize_token_normalizes_aliases_and_rejects_empty() {
        assert_eq!(canonicalize_token(""), None);
        assert_eq!(canonicalize_token("   \t "), None);
        for raw in ["claude", "Anthropic", " claude-code "] {
            assert_eq!(canonicalize_token(raw).as_deref(), Some("anthropic"));
        }
        for raw in ["codex", "OPENAI"] {
            assert_eq!(canonicalize_token(raw).as_deref(), Some("openai"));
        }
        for raw in ["grok", "xai", "grok-cli"] {
            assert_eq!(canonicalize_token(raw).as_deref(), Some("xai"));
        }
        for raw in ["agy", "antigravity", "gemini", "gemini-cli", "Google"] {
            assert_eq!(canonicalize_token(raw).as_deref(), Some("google"));
        }
    }

    #[test]
    fn extra_vendor_or_family_only_tightens_may_be_same_and_empty_fails_closed() {
        // PR #86 regression: { provider: "anthropic", family: Some("openai") } vs { provider: "anthropic" }
        let author = rt("anthropic", "claude-opus-4-1");
        let disguised = rt_full("anthropic", "gpt-5-codex", None, Some("openai"));
        assert!(author.may_be_same(&disguised));
        assert!(disguised.may_be_same(&author));

        let mut req = agent(Action::SubmitPreCheck, Status::InVerification);
        req.checker_baseline = Some("checker-1".into());
        req.author_runtime = Some(author);
        req.checker_runtime = Some(disguised);
        assert_eq!(decide(&req).decision.reason(), ReasonCode::NotIndependent);

        // { provider: "claude", family: Some("openai") } vs { provider: "claude", family: None }
        let a_claude = rt("claude", "default");
        let b_claude_openai = rt_full("claude", "default", None, Some("openai"));
        assert!(a_claude.may_be_same(&b_claude_openai));

        // Cross-field vendor/family overlap (e.g., opencode wrapping anthropic vs claude)
        let opencode_anthropic = rt_full("opencode", "claude-sonnet-4-5", Some("anthropic"), None);
        assert!(opencode_anthropic.may_be_same(&a_claude));
        req.author_runtime = Some(a_claude);
        req.checker_runtime = Some(opencode_anthropic);
        assert_eq!(decide(&req).decision.reason(), ReasonCode::NotIndependent);

        // Empty tokens on either side fail closed.
        let empty = rt("   ", "default");
        let grok = rt_full("grok", "grok-4", Some("xai"), Some("xai"));
        assert!(empty.may_be_same(&grok));
        assert!(grok.may_be_same(&empty));

        // Disjoint provider, vendor, and family are allowed.
        let claude_full = rt_full(
            "claude",
            "claude-sonnet-4-5",
            Some("anthropic"),
            Some("anthropic"),
        );
        assert!(!claude_full.may_be_same(&grok));
        req.author_runtime = Some(claude_full);
        req.checker_runtime = Some(grok);
        assert!(decide(&req).decision.is_allowed());
    }

    #[test]
    fn grade_safety_requires_attestation_on_pre_check_without_override_bypass() {
        let mut req = agent(Action::SubmitPreCheck, Status::InVerification);
        req.checker_baseline = Some("checker-1".into());
        req.grade = Some(Grade::Safety);
        req.attestation_verified = None;
        assert!(!decide(&req).decision.is_allowed());

        req.attestation_verified = Some(false);
        assert!(!decide(&req).decision.is_allowed());

        // Owner independence override never waives attestation.
        req.owner_override_verified = true;
        assert!(!decide(&req).decision.is_allowed());

        // Non-safety still refuses explicit Some(false), allows None when runtimes differ.
        req.grade = Some(Grade::Material);
        assert!(!decide(&req).decision.is_allowed());
        req.attestation_verified = None;
        assert!(decide(&req).decision.is_allowed());

        // Safety with Some(true) allows when other invariants hold.
        req.grade = Some(Grade::Safety);
        req.owner_override_verified = false;
        req.attestation_verified = Some(true);
        assert!(decide(&req).decision.is_allowed());
    }

    #[test]
    fn grade_safety_requires_quorum_on_accept_and_accept_with_findings() {
        for action in [Action::Accept, Action::AcceptWithFindings] {
            let mut req = human(action, Status::InVerification);
            req.reason_given = action == Action::AcceptWithFindings;
            req.grade = Some(Grade::Safety);
            req.safety_quorum_met = None;
            assert!(!decide(&req).decision.is_allowed(), "{action:?} None");

            req.safety_quorum_met = Some(false);
            assert!(
                !decide(&req).decision.is_allowed(),
                "{action:?} Some(false)"
            );

            // Explicit Some(false) also refuses non-safety grades.
            req.grade = Some(Grade::GeneralService);
            assert!(!decide(&req).decision.is_allowed(), "{action:?} gs false");

            req.grade = Some(Grade::Safety);
            req.safety_quorum_met = Some(true);
            assert_eq!(decide(&req).next, Some(Status::Accepted), "{action:?} true");
        }
    }

    #[test]
    fn grade_deserializes_with_kebab_case_matching_spec() {
        let parsed = serde_json::from_str::<Request>(
            r#"{"status":"in-verification","action":"accept","actor_kind":"human","actor_id":"ben","grade":"general-service"}"#,
        );
        assert_eq!(
            parsed.ok().and_then(|r| r.grade),
            Some(Grade::GeneralService)
        );

        let safety = serde_json::from_str::<Request>(
            r#"{"status":"in-verification","action":"accept","actor_kind":"human","actor_id":"ben","grade":"safety","safety_quorum_met":true}"#,
        );
        let safety_req = safety.ok();
        assert_eq!(
            safety_req.as_ref().and_then(|r| r.grade),
            Some(Grade::Safety)
        );
        assert_eq!(safety_req.and_then(|r| r.safety_quorum_met), Some(true));
    }
}
