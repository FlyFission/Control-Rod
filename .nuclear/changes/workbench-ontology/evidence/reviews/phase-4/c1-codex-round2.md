- **Major — Change lens still presents unknown freshness as current.** [lenses.ts:64](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/lenses.ts:64) assigns unverified inputs the “Inputs current” colour and describes them as “Inputs current as far as recorded.” With no freshness evidence, it says “Inputs current.” This contradicts the corrected card and can reassure users about unchecked inputs. **Fix:** distinguish unknown freshness in the lens, legend, and accessible description; test unverified, absent, and mixed evidence.

Finding 9 is a reasonable deferral: the ledger explicitly preserves OV-06 as incomplete pending the owner’s read-auditing decision.

Validation: source review and in-memory checks; browser tests were not rerun. The worst-case fixture covers 40 of 80 places, although the all-seat geometry check passes.

REVISE