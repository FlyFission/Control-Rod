# Phase 6 A (PR 51), Codex round 2: adjudication

Round 1 fixes confirmed in the main; six findings, all accepted.

| Finding | Disposition |
|---|---|
| 1 An escaped TOML key bypasses the sandbox_mode scan | Fixed: managed files are parsed as TOML (BurntSushi/toml, MIT) and refused if any decoded key at any depth could loosen a run: sandbox_mode, sandbox_workspace_write, default_permissions, permissions, approval_policy, web_search, tools, features, mcp_servers, shell_environment_policy, profiles, profile. Unreadable or unparsable files refuse. Tests cover bare, quoted, escaped, dotted and table spellings and each key. |
| 2 Default login folders linked outside the home folder | Fixed: `LoginLocations` resolves the default login folders and files and the environment's, through links, and every launch denies each by its real path; a login inside the workspace (or a workspace inside a login) refuses the launch. Test with `~/.claude` linked outside home. |
| 3 Codex hosted web search escapes the policy | Fixed: `-c web_search="disabled"` on every Codex launch; managed `web_search` refuses. Live: a session asked to search had no web search item. |
| 4 Staging follows TMPDIR | Fixed: staging is always in `/tmp` (resolved), never TMPDIR, which both sandboxes make read only. Test. |
| 5 Concurrent staging race | Fixed: one stager per digest across daemons (flock); a copy that no longer matches is set aside, never deleted under a running launch. Test: eight concurrent stagers publish one copy. |
| 6 Live check scorer too lenient | Fixed: every completed call on the decoy is matched to its result and must be a refusal (error or refusal wording) without the canary; every required path must be tried (retries allowed, every session searched for the canary); otherwise the check fails. Rerun: Claude Code Bash and Read refused with their rule messages, Codex `cat` refused (no such file inside its sandbox), no leak. Docs and evidence narrowed to exactly this. |
