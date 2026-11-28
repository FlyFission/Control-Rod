//! Package lifecycle transitions: the core floors of the MVP.
//!
//! Every state change on a work package is a request to this function. It refuses by default
//! and allows only what a rule names. The floors it holds:
//!
//! 1. Only a person can release, accept, return or reject, and only with a passkey assertion
//!    the server verified over the digest of exactly what that person reviewed. The one
//!    exception is the owner's signing policy: a passkey-signed record, kept by the server, in
//!    which the owner chose which steps need a signature of their own. A step the policy covers
//!    needs no assertion per step, and under it Control Rod itself (a system actor) may release
//!    and may accept work whose pre-check passed. Nothing else: the system never accepts with
//!    findings, returns, rejects or overrides independence, and the policy never waives the
//!    signature on an independence override.
//! 2. Agents can claim released work, submit output and submit a pre-check. Nothing else. Only
//!    the agent that holds the claim may submit output or revise, and only the checker named in
//!    the request may submit its pre-check.
//! 3. The pre-check comes from a different agent baseline than the author's, from a different
//!    vendor family. The server passes the one vendor-family table (`vendor_families`, read from
//!    `daemon/internal/runner/models.json`), so the kernel, the API and the daemon judge
//!    independence from the same list. The same provider counts as the same runtime whatever the
//!    models, two providers of one family count as the same runtime, and a provider the table
//!    does not name counts as possibly the same. A pre-check that may share the author's runtime
//!    is allowed only after the owner's override, a human act signed with a passkey over its
//!    digest and carrying a written reason.
//! 4. An author may revise only after a pre-check that did not pass.
//! 5. Acceptance needs a pre-check. A pre-check that did not pass can be accepted only with a
//!    written reason.
//!
//! Accepted and closed are final. Nothing moves a package out of either, so an accepted package
//! is never closed: closing means the work was turned down (`Reject`), and accepted work is
//! already finished. Hiding finished cards from a board, or archiving them, is a view of the
//! record kept outside this function. It never changes the lifecycle status, so it needs no
//! rule here.
//!
//! Trust surface: changes here need the owner's signature (AGENTS.md rule 2).

use crate::decision::{Decision, ReasonCode};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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

/// The runtime that ran an agent: provider and model, as the runner reported them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeIdentity {
    pub provider: String,
    pub model: String,
}

impl RuntimeIdentity {
    /// The vendor family of this runtime's provider in `families`. Keys and families compare
    /// trimmed and without ASCII case. `None` when the table names no family for the provider,
    /// a blank one, or two different ones.
    #[must_use]
    pub fn family<'a>(&self, families: &'a BTreeMap<String, String>) -> Option<&'a str> {
        let provider = self.provider.trim();
        let mut found: Option<&'a str> = None;
        for (key, family) in families {
            if !key.trim().eq_ignore_ascii_case(provider) {
                continue;
            }
            let family = family.trim();
            if family.is_empty() || found.is_some_and(|seen| !seen.eq_ignore_ascii_case(family)) {
                return None;
            }
            found = Some(family);
        }
        found
    }

    /// True when both sides may be the same runtime. Two models from one provider, or from two
    /// providers of one vendor family, share training, tooling and blind spots, so a different
    /// model is not an independent check. A provider without a known family fails closed: it may
    /// be the same.
    #[must_use]
    pub fn may_be_same(&self, other: &Self, families: &BTreeMap<String, String>) -> bool {
        if self
            .provider
            .trim()
            .eq_ignore_ascii_case(other.provider.trim())
        {
            return true;
        }
        match (self.family(families), other.family(families)) {
            (Some(a), Some(b)) => a.eq_ignore_ascii_case(b),
            _ => true,
        }
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
    /// Agent baseline that holds the package's claim: the author the server dispatched for the
    /// current round. `SubmitOutput` and `Revise` are refused unless it is the actor.
    #[serde(default)]
    pub claimed_by: Option<String>,
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
    /// Vendor family of each runtime provider, for `SubmitPreCheck`: the one table in
    /// `daemon/internal/runner/models.json`, as the server read it. Absent or empty, no provider
    /// has a known family, so a pre-check needs the owner's override.
    #[serde(default)]
    pub vendor_families: BTreeMap<String, String>,
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
    /// The owner's signing policy covers this step on this package: the server verified the
    /// owner's passkey over the stored policy and found that it lets this action go without a
    /// signature of its own. The server sets it only from that stored, verified record.
    #[serde(default)]
    pub policy_signed: bool,
    /// A non-empty written reason accompanies the request.
    #[serde(default)]
    pub reason_given: bool,
    /// Present only for an enrolled package; facts come from controlled server records.
    #[serde(default)]
    pub preparation: Option<crate::preparation::PreparationGuard>,
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

/// The actor is the agent the server says holds the claim.
fn holds_claim(req: &Request) -> bool {
    req.claimed_by
        .as_deref()
        .is_some_and(|holder| !holder.trim().is_empty() && holder == req.actor_id)
}

/// Floor 3: another baseline than the author's, and another vendor family unless the owner's
/// override is on record. The submitting agent must be the checker the request names.
fn decide_pre_check(req: &Request) -> Outcome {
    if req.checker_baseline.as_deref() != Some(req.actor_id.as_str()) {
        return refuse(ReasonCode::Forbidden);
    }
    match (
        req.author_baseline.as_deref(),
        req.checker_baseline.as_deref(),
        req.author_runtime.as_ref(),
        req.checker_runtime.as_ref(),
    ) {
        (Some(author), Some(checker), _, _) if author == checker => {
            refuse(ReasonCode::NotIndependent)
        }
        (Some(_), Some(_), Some(author), Some(checker))
            if !author.provider.trim().is_empty() && !checker.provider.trim().is_empty() =>
        {
            if author.may_be_same(checker, &req.vendor_families) && !req.owner_override_verified {
                refuse(ReasonCode::NotIndependent)
            } else {
                allow(Status::InVerification)
            }
        }
        _ => refuse(ReasonCode::Forbidden),
    }
}

/// Decides one lifecycle transition.
#[must_use]
pub fn decide(req: &Request) -> Outcome {
    if req.actor_id.trim().is_empty() {
        return refuse(ReasonCode::Forbidden);
    }
    if req.action.human_only() {
        // The policy never stands in for the independence override: that one is always signed.
        let policy = req.policy_signed && req.action != Action::OverrideIndependence;
        let by_system = req.actor_kind == ActorKind::System
            && policy
            && matches!(req.action, Action::Release | Action::Accept);
        if req.actor_kind != ActorKind::Human && !by_system {
            return refuse(ReasonCode::NotHuman);
        }
        if !policy && (!req.assertion_verified || !req.digest_matches) {
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
        (A::SubmitOutput, S::InWork) => {
            if holds_claim(req) {
                allow(S::InVerification)
            } else {
                refuse(ReasonCode::Forbidden)
            }
        }
        (A::SubmitPreCheck, S::InVerification) => decide_pre_check(req),
        (A::Revise, S::InVerification) if !holds_claim(req) => refuse(ReasonCode::Forbidden),
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
        }
    }

    /// The shape of the table in daemon/internal/runner/models.json, plus a second provider of
    /// one family to show that the family decides.
    fn families() -> BTreeMap<String, String> {
        [
            ("claude", "Anthropic"),
            ("codex", "OpenAI"),
            ("grok", "xAI"),
            ("agy", "Google"),
            ("anthropic-api", "Anthropic"),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_owned(), v.to_owned()))
        .collect()
    }

    fn human(action: Action, status: Status) -> Request {
        Request {
            status,
            action,
            actor_kind: ActorKind::Human,
            actor_id: "ben".into(),
            claimed_by: Some("author-1".into()),
            author_baseline: Some("author-1".into()),
            checker_baseline: None,
            author_runtime: Some(rt("claude", "default")),
            checker_runtime: Some(rt("codex", "default")),
            vendor_families: families(),
            owner_override_verified: false,
            pre_check: Some(PreCheckOutcome::Pass),
            assertion_verified: true,
            digest_matches: true,
            reason_given: false,
            policy_signed: false,
            preparation: None,
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

    /// A pre-check submitted by checker-1, the checker it names.
    fn checker(status: Status) -> Request {
        Request {
            actor_id: "checker-1".into(),
            checker_baseline: Some("checker-1".into()),
            ..agent(Action::SubmitPreCheck, status)
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
        assert!(
            decide(&checker(Status::InVerification))
                .decision
                .is_allowed()
        );
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
    fn pre_check_requires_nonblank_runtime_providers_even_with_an_override() {
        let mut request = checker(Status::InVerification);
        for owner_override_verified in [false, true] {
            request.owner_override_verified = owner_override_verified;
            for (author, checker) in [
                ("", "codex"),
                ("claude", ""),
                (" \t", "codex"),
                ("claude", " \n"),
            ] {
                request.author_runtime = Some(rt(author, "default"));
                request.checker_runtime = Some(rt(checker, "default"));
                assert_eq!(decide(&request).decision.reason(), ReasonCode::Forbidden);
            }
        }
    }

    #[test]
    fn the_author_cannot_pre_check_its_own_work() {
        let mut r = agent(Action::SubmitPreCheck, Status::InVerification);
        r.checker_baseline = Some("author-1".into());
        assert_eq!(decide(&r).decision.reason(), ReasonCode::NotIndependent);
    }

    #[test]
    fn a_pre_check_on_the_authors_runtime_needs_an_owner_override() {
        let mut r = checker(Status::InVerification);
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
        let mut r = checker(Status::InVerification);
        r.owner_override_verified = true;
        r.checker_runtime = None;
        assert_eq!(decide(&r).decision.reason(), ReasonCode::Forbidden);
    }

    #[test]
    fn a_pre_check_without_known_baselines_is_refused() {
        let mut r = checker(Status::InVerification);
        r.author_baseline = None;
        assert!(!decide(&r).decision.is_allowed());
    }

    #[test]
    fn two_providers_of_one_vendor_family_are_not_independent() {
        let mut r = checker(Status::InVerification);
        r.author_runtime = Some(rt("claude", "default"));
        r.checker_runtime = Some(rt("Anthropic-API ", "default"));
        assert_eq!(decide(&r).decision.reason(), ReasonCode::NotIndependent);
        r.owner_override_verified = true;
        assert_eq!(decide(&r).next, Some(Status::InVerification));
    }

    #[test]
    fn a_provider_without_a_known_family_needs_an_owner_override() {
        let mut r = checker(Status::InVerification);
        for (author, check) in [("claude", "opencode"), ("ollama", "codex")] {
            r.author_runtime = Some(rt(author, "default"));
            r.checker_runtime = Some(rt(check, "default"));
            r.owner_override_verified = false;
            assert_eq!(decide(&r).decision.reason(), ReasonCode::NotIndependent);
            r.owner_override_verified = true;
            assert!(decide(&r).decision.is_allowed());
        }
    }

    #[test]
    fn without_the_family_table_no_pre_check_counts_as_independent() {
        let mut r = checker(Status::InVerification);
        r.vendor_families = BTreeMap::new();
        assert_eq!(decide(&r).decision.reason(), ReasonCode::NotIndependent);
        r.owner_override_verified = true;
        assert!(decide(&r).decision.is_allowed());
    }

    #[test]
    fn a_blank_or_ambiguous_family_entry_counts_as_unknown() {
        let mut r = checker(Status::InVerification);
        r.vendor_families.insert("codex".into(), "  ".into());
        assert_eq!(decide(&r).decision.reason(), ReasonCode::NotIndependent);
        let mut r = checker(Status::InVerification);
        r.vendor_families
            .insert("CODEX".into(), "Someone Else".into());
        assert_eq!(decide(&r).decision.reason(), ReasonCode::NotIndependent);
        let mut r = checker(Status::InVerification);
        r.vendor_families.insert(" Codex".into(), "openai".into());
        assert!(decide(&r).decision.is_allowed());
    }

    #[test]
    fn only_the_checker_the_request_names_may_submit_its_pre_check() {
        let mut r = checker(Status::InVerification);
        r.actor_id = "checker-2".into();
        assert_eq!(decide(&r).decision.reason(), ReasonCode::Forbidden);
        r.checker_baseline = None;
        assert_eq!(decide(&r).decision.reason(), ReasonCode::Forbidden);
    }

    #[test]
    fn only_the_claim_holder_may_submit_output_or_revise() {
        for (action, status) in [
            (Action::SubmitOutput, Status::InWork),
            (Action::Revise, Status::InVerification),
        ] {
            let mut r = agent(action, status);
            r.pre_check = Some(PreCheckOutcome::Fail);
            assert!(decide(&r).decision.is_allowed(), "{action:?}");
            for holder in [
                None,
                Some(""),
                Some(" "),
                Some("author-2"),
                Some("Author-1"),
            ] {
                r.claimed_by = holder.map(Into::into);
                assert_eq!(
                    decide(&r).decision.reason(),
                    ReasonCode::Forbidden,
                    "{action:?} held by {holder:?}"
                );
            }
        }
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

    fn system(action: Action, status: Status) -> Request {
        Request {
            actor_kind: ActorKind::System,
            actor_id: "policy:SP-1".into(),
            assertion_verified: false,
            digest_matches: false,
            policy_signed: true,
            ..human(action, status)
        }
    }

    #[test]
    fn without_the_policy_the_system_takes_no_human_action() {
        for action in HUMAN_ACTIONS {
            for status in ALL_STATUSES {
                let mut r = system(action, status);
                r.policy_signed = false;
                assert_eq!(decide(&r).decision.reason(), ReasonCode::NotHuman);
            }
        }
    }

    #[test]
    fn under_the_policy_the_system_releases_and_accepts_a_pass_only() {
        assert_eq!(
            decide(&system(Action::Release, Status::Draft)).next,
            Some(Status::Released)
        );
        let mut r = system(Action::Accept, Status::InVerification);
        r.pre_check = Some(PreCheckOutcome::Pass);
        assert_eq!(decide(&r).next, Some(Status::Accepted));
        for outcome in [PreCheckOutcome::Fail, PreCheckOutcome::Inconclusive] {
            r.pre_check = Some(outcome);
            assert!(!decide(&r).decision.is_allowed());
        }
        r.pre_check = None;
        assert!(!decide(&r).decision.is_allowed());
        for action in [
            Action::AcceptWithFindings,
            Action::Return,
            Action::Reject,
            Action::OverrideIndependence,
        ] {
            for status in ALL_STATUSES {
                let mut r = system(action, status);
                r.reason_given = true;
                r.pre_check = Some(PreCheckOutcome::Fail);
                assert_eq!(
                    decide(&r).decision.reason(),
                    ReasonCode::NotHuman,
                    "{action:?} in {status:?}"
                );
            }
        }
    }

    #[test]
    fn under_the_policy_a_person_needs_no_signature_except_to_override_independence() {
        let mut r = human(Action::Return, Status::InVerification);
        r.assertion_verified = false;
        r.digest_matches = false;
        r.policy_signed = true;
        r.reason_given = true;
        assert_eq!(decide(&r).next, Some(Status::Draft));
        let mut o = human(Action::OverrideIndependence, Status::InVerification);
        o.assertion_verified = false;
        o.digest_matches = false;
        o.policy_signed = true;
        o.reason_given = true;
        assert_eq!(decide(&o).decision.reason(), ReasonCode::Unsigned);
    }

    #[test]
    fn the_policy_never_lets_an_agent_take_a_human_action() {
        for action in HUMAN_ACTIONS {
            let mut r = agent(action, Status::InVerification);
            r.policy_signed = true;
            assert_eq!(decide(&r).decision.reason(), ReasonCode::NotHuman);
        }
    }

    #[test]
    fn unknown_fields_in_a_request_are_rejected() {
        let json = r#"{"status":"draft","action":"release","actor_kind":"human","actor_id":"b","approved_by_agent":true}"#;
        assert!(serde_json::from_str::<Request>(json).is_err());
        let json = r#"{"status":"draft","action":"release","actor_kind":"human","actor_id":"b","author_runtime":{"provider":"claude","model":"m","family":"OpenAI"}}"#;
        assert!(serde_json::from_str::<Request>(json).is_err());
    }
}
