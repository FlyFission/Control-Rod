# S-3: Claude Code permission hooks in print mode

**Question.** Do Claude Code permission hooks fire in print mode, so a headless run can record "waiting on a human" instead of failing silently?

**Script.** `spikes/runtime-confinement/session_spike.py` (S-3 half). Raw output: [s3-s4-hooks-and-sessions.json](s3-s4-hooks-and-sessions.json), key `S-3`.

## Setup

Native Claude CLI in the S-0 model domain with the scripted provider and fixture key. `--tools Bash`, hooks passed with `--settings` for `PreToolUse` and `PermissionRequest` (matcher `*`), each writing its stdin payload to a file. The scripted model asks Bash to write a file in the working directory, which needs approval.

## Result

| Check | Result |
|---|---|
| pre_tool_use_fired | yes |
| permission_request_fired | yes |
| tool_ran_without_approval | no (the file was not created) |
| tool_result_is_error | yes: "Output redirection to '/work/bash-marker' needs approval…" |

The `PermissionRequest` payload carries `hook_event_name`, `tool_name`, `tool_input`, `permission_mode`, `permission_suggestions`, `session_id`, `prompt_id`, `cwd`, `effort` and `transcript_path`: enough for the daemon to raise a precise "needs you" item naming the tool and its input.

## Answer

**Yes.** Both hooks fire in print mode; the tool is refused, and the run continues with an error result rather than hanging.

## Limits

Claude Code 2.1.314 only. This supports interim waiting detection; it is not an approval channel (a print mode run cannot be resumed by answering the hook).

## Unblocks

Interim "waiting on a human" detection for WB-09 run stories until ACP lands.
