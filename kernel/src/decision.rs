//! The decision type. Only the kernel can construct an allowing decision.

/// Why the kernel allowed or refused a request. Every decision carries exactly one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum ReasonCode {
    /// Every guard passed.
    Allowed,
    /// The kernel has no rule for this request yet. Refused, never guessed.
    NotImplemented,
    /// A policy failed to evaluate. Refused, because a broken forbid must never stop forbidding.
    PolicyError,
    /// A floor or policy forbids the request.
    Forbidden,
    /// Only a person may take this action.
    NotHuman,
    /// A person's action arrived without a verified passkey assertion over the digest on record.
    Unsigned,
    /// The package is not in a state this action applies to.
    WrongState,
    /// The checker is the author, or shares the author's baseline.
    NotIndependent,
    /// Acceptance was asked for before any pre-check exists.
    MissingPreCheck,
    /// This action needs a written reason.
    ReasonRequired,
}

/// A kernel decision with its reason code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Decision {
    allowed: bool,
    reason: ReasonCode,
}

impl Decision {
    /// A refusal. Any component may construct one.
    #[must_use]
    pub const fn deny(reason: ReasonCode) -> Self {
        Self {
            allowed: false,
            reason,
        }
    }

    /// An approval. Crate-private: nothing outside the kernel can mint one.
    #[must_use]
    pub(crate) const fn allow() -> Self {
        Self {
            allowed: true,
            reason: ReasonCode::Allowed,
        }
    }

    #[must_use]
    pub const fn is_allowed(&self) -> bool {
        self.allowed
    }

    #[must_use]
    pub const fn reason(&self) -> ReasonCode {
        self.reason
    }
}

/// The fail-closed default for anything the kernel cannot yet decide.
#[must_use]
pub const fn undecided() -> Decision {
    Decision::deny(ReasonCode::NotImplemented)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn undecided_requests_are_refused() {
        let d = undecided();
        assert!(!d.is_allowed());
        assert_eq!(d.reason(), ReasonCode::NotImplemented);
    }

    #[test]
    fn denials_never_allow() {
        for reason in [
            ReasonCode::NotImplemented,
            ReasonCode::PolicyError,
            ReasonCode::Forbidden,
        ] {
            assert!(!Decision::deny(reason).is_allowed());
        }
    }
}
