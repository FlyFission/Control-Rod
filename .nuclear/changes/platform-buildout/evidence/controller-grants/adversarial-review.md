# Adversarial review: controller grant integration

Scope: proposed controller-backed authority and its interaction with the current file broker, run lifecycle, secrets and retained evidence. Before implementation, the decision is to require an explicit distributed protocol and keep activation held.

| Attack class | Attempt and expected refusal, recorded before execution | Initial status |
|---|---|---|
| Revocation race | Begin/use then stop/revoke/edit; finalize must refuse and no result be delivered | uncertain; test required |
| Stop starvation | Remote I/O stalls; no server transaction may stay open across it | uncertain; short begin/finalize transactions required |
| Confused deputy | Unknown/future preparer role falls through legacy author launcher | uncertain; inspect and reproduce before adding role values |
| Capability substitution | Wrong grant/use/claim/role/lane/input/secret must not authorize another operation | uncertain; real storage/HTTP tests required |
| Audit fabrication | Reported output hash without actual bytes must never create admitted proposal evidence | uncertain; retain/controller-hash bytes at finalize |
| Replay/partition | Same permit with altered payload or after stop/expiry must not renew authority | uncertain; immutable request-digest receipt plus current fence |
| Time-of-commit | Audit lock or commit delay passes lease deadline; transaction must refuse | uncertain; DB wall clock and deferred constraint required |
| Injection/poisoned retrieval | Source/proposal text requests human actions; it remains inert untrusted data | uncertain for models; no automatic application or new decision tools |
| Credential/data exfiltration | Grant/use tokens appear in event/log/result or become broad daemon/browser authority | uncertain; narrow token auth and absence tests |
| Resource/path misuse | Model supplies host path, huge/ambiguous payload or source digest | uncertain; server-only capabilities and closed bounded schemas |
| Native credential/network escape | Tool reaches provider secret or arbitrary network | uncertain; still held by parent native-confinement gate |

Rejected approaches: fetch-once authorization leaves stale authority; a remote callback inside a held DB transaction risks stop starvation; a shadow run lifecycle bypasses the existing control model. These are design findings, not claims of an active production exploit. Tests and reviewer results will replace initial statuses before publication. No finite review is a guarantee every possible attack has been considered.

## Independent design review

Fresh adversarial design review required revision before storage implementation. Findings: single-use permits do not ensure a unique per-grant proposal; global audit waits can obstruct stop; read-only receipt replay needs an explicitly armed commit guard; external Git/filesystem observations must stay outside DB locks; legacy completion/requeue require role guards as well as claim/launcher; finalization admission is not model-delivery proof; controller custody must survive ambiguous acknowledgments/local cleanup. It also required bounded aggregate permits/uses and honest lost-begin abandonment. These are proposed-protocol findings, not active production exploits.

Design disposition: adopt one unique proposal slot, finite response budget and two pending permits; DB-only snapshot/capture/attachment projection for requirements-preparer first; bounded lock/statement/idle deadlines; every-ack deferred guard, including retry; existing Run lifecycle with unsupported roles held; admission linearized at server finalize with delayed-response/unknown-outcome limits explicit. No controller/native adapter is connected by the design. Final real PostgreSQL/HTTP evidence is still required.

## Executed role-boundary attack

Real PostgreSQL test seeded incoherent indexed/body roles to simulate a future writer/migration fault. Both unexpected-role and intake-column/author-body rows were dispatched by the old legacy fallback; heartbeat and completion also accepted unsupported rows, while requeue reached a legacy path. This is a privileged-state corruption/future-integration hazard, not proof an ordinary remote user can write SQL. All five API regressions failed before the guard and now pass. Go launcher tests also failed before explicit role admission and now pass for missing/unknown/preparer roles across all runtimes. Full API suite: 149 passed with external restore enabled; API types and runner race suite passed.

Result for the tested confused-deputy class: contained at legacy claim/start/heartbeat/completion/requeue/override/launcher boundaries. Owner stop and expiry retirement remain available. Other attack classes remain uncertain until their protocol tests and native boundaries close.
