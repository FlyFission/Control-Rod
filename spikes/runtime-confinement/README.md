# Runtime boundary probes

These are disposable qualification experiments, outside the production daemon and active policy. Neither probe enables a preparation role.

`python3 spikes/runtime-confinement/probe.py` checks the synthetic filesystem/environment/home/process/network boundary using Python canaries.

For the installed native executables, run:

```bash
python3 spikes/runtime-confinement/native_probe.py \
  --claude /absolute/path/to/native/claude \
  --codex /absolute/path/to/native/codex > native-runtime-report.json
```

Pass the native Codex executable, not its Node launcher. The supervisor hashes each executable before/after execution and runs help/version inside a fresh bubblewrap boundary with no owner HOME, inherited secrets, repository or external network. It mounts only system runtime files, the selected executable, the fixture script and disposable output. This is a Linux/WSL experiment; missing primitives or a failed child refuse evidence. The actual binary/version digests are part of each report.

The Claude fixture starts a scripted Messages-compatible provider on loopback inside that same offline namespace. The key is a literal test string, not an owner credential. With builtins disabled and an empty strict MCP configuration, the scripted provider injects Bash, Read, Write, Edit, WebFetch, Agent and ToolSearch calls. The probe requires an empty advertised tool set, the exact distinct attempted-call IDs, error results for each, successful native completion and no escape marker. Repeated conversation history is deduplicated by tool-use ID.

A separate positive-control boundary enables only Bash and requires the same scripted command to write its disposable marker. This shows the refusal result is sensitive to the tools setting rather than an impossible fixture command. That control writes only disposable fixture output; no repository is mounted. The native diagnostic for the deliberately fictitious model is expected. Native token/cost estimates from scripted responses are not retained as actual usage or billing evidence.

The option choices follow the installed help and [official Claude CLI reference](https://code.claude.com/docs/en/cli-reference). The local protocol fixture uses the public [Messages streaming format](https://platform.claude.com/docs/en/build-with-claude/streaming). The [gateway documentation](https://code.claude.com/docs/en/llm-gateway) describes keeping provider credentials at a gateway; this fixture does not implement or prove that production boundary.

## Current limit and next experiment

Passing proves offline startup for the exact native binaries and the tested Claude builtin refusal/control behavior. It does not prove that every possible tool is unavailable, a tool broker works, provider credentials are isolated, model destinations are restricted, a grant/lease is enforced or a real authenticated session is confined. Codex has no corresponding tool-delegation result here. All profiles stay unproved and activation stays HOLD.

Next, exercise exactly one trusted MCP broker endpoint with all native builtins disabled, enforce grant/revision/lease admission before tool execution, and run the untrusted tool child with its own scrubbed filesystem/environment/network boundary. Prove a synthetic provider credential remains outside that child before reading real credentials. Then close credential/model transport, individual native negative cases and the protected policy/red-team review before adapting the daemon. The parent runtime-confinement specification remains authoritative.
