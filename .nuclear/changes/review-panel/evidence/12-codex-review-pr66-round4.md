REVISE

The three round 3 concerns are resolved: existing pre-checks cannot count as seats, complete pre-check inputs are subject to the policy and confirmation, and the final brief is bound to confirmation.

1. **High: [review panel design:67](/home/flyfission/worktrees/control-rod-panel/docs/superpowers/specs/2026-11-06-review-panel-design.md:67)** scans only text, while the snapshot can contain binary files and archives. A tracked archive named `backup.zip` containing a private key can pass the filename denylist and text scanner, then be uploaded and made available to a reviewer. Exclude binary and archive content by default, or inspect supported formats before upload and fail closed for content the policy cannot inspect. Add a test with a secret inside an archive.