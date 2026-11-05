# Phase 6 A (PR 51), Codex round 1: adjudication

Independent adversarial review of the sandbox launch at 0426fca. Seven findings, all accepted.

| Finding | Disposition |
|---|---|
| 1 Codex per-entry denials miss entries created after launch and retargeted links | Fixed at the root. Codex is launched from its verified install staged outside the home folder (`StageArtifact`: content addressed, private folder, re-hashed, a changed copy replaced), so the home folder and the daemon home are denied whole again; Codex keeps the workspace inside them usable. Anything created in them later is covered. The per-entry code is removed. Remaining limit, stated: a link's target outside the home folder is denied by name only under a denied path. |
| 2 An install exception could expose the whole home folder | Fixed by the same change: there is no install exception any more. |
| 3 Login folders moved by CODEX_HOME or CLAUDE_CONFIG_DIR are not denied | Fixed: `LoginLocations` resolves both (through links) and every launch denies them. Test added. |
| 4 Quoted or dotted TOML keys slip past the sandbox_mode check; unreadable files pass | Fixed fail closed: any mention of sandbox_mode outside a comment in any TOML file under /etc/codex refuses, and a managed file that exists but cannot be read refuses. Tests for bare, both quotings, dotted and table forms, and an unreadable file. |
| 5 Preflight not bound to the launched artifact | Fixed: a launch must be of the artifact the last probe found ready, preflight included; a pinned version installed after the probe waits for the next probe. Qualification per version and platform is the protected suite of 6.4, stated as a limit. |
| 6 Policy fields silently not enforced | Fixed: the daemon refuses writable roots other than the workspace, unknown tools, and Codex under a policy without all of its tools; Claude Code maps a subset exactly. Tests added. |
| 7 Evidence overclaims; positive control does not require internet or DNS | Fixed: the positive control must reach the internet and resolve names; the live check now runs a real tool-using session in each CLI against a decoy in the real home folder (both refused, nothing leaked; a session that never tries is unverifiable). It found that Codex 0.166 runs commands through its code mode host, which had been switched off, so Codex could run no command: that feature is now qualified and left on. Docs, ledger and evidence say this is not the protected 6.4 suite. |
