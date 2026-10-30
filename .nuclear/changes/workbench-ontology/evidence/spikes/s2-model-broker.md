# S-2: subscription login through the model broker

**Question.** Do subscription logins work through the model broker, or is an account key path required per lane?

**Script.** `spikes/runtime-confinement/model_broker_spike.py`. Raw output: [s2-model-broker.json](s2-model-broker.json).

## Setup

The native Claude CLI runs in the S-0 model domain: no network, no owner home, only a fixture API key, `--tools ""`. A broker on the host listens on the domain's provider socket. It forwards only `POST /v1/messages` and `/v1/messages/count_tokens` (everything else gets 403), drops the inbound key and authorization headers, adds the owner's subscription OAuth token from `~/.claude/.credentials.json` as a bearer token with the OAuth beta header, and forwards to `api.anthropic.com`. One prompt: "Reply with exactly the word OK and nothing else."

## Result (8 of 8)

| Check | Result |
|---|---|
| client_finished | pass |
| model_answered | pass (`result: "OK"`, one turn) |
| every_request_used_fixture_key_inside | pass |
| only_messages_endpoints_forwarded | pass |
| upstream_accepted | pass (HTTP 200) |
| model_domain_has_no_internet | pass |
| model_domain_cannot_see_owner_home | pass |
| token_never_written_to_spike_files | pass |

## Findings

1. **The broker must not pass a compressed body with its encoding header stripped.** The first run returned HTTP 200 upstream but the client could not parse the reply: the broker removed `Content-Encoding` while passing gzip bytes through. Fixed by asking upstream for `Accept-Encoding: identity`. A production broker either streams verbatim (headers and bytes together) or decodes; never half of each.
2. **The broker holds the token; refresh must live there too.** The spike reads a still valid access token. A production broker owns refresh and write back on the host side (see [S-1 finding 1](s1-srt-driver.md)).

## Answer

**Yes for Claude Code:** a subscription login works through a host side broker; no account key is needed for Claude lanes. Codex's ChatGPT login also worked through srt's masking proxy in [S-1](s1-srt-driver.md), with the refresh caveat recorded there.

## Limits

One prompt, one host, a non streaming check of the final result. Whether subscription terms allow a given use is an owner and provider question, not a technical one; this spike records only that the mechanism works.

## Rerun

`python3 spikes/runtime-confinement/model_broker_spike.py --claude <native claude>` (spends one tiny prompt).
