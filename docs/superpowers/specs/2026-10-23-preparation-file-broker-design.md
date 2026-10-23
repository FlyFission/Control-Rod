# Preparation file broker

Status: implementation slice of task 10, behind inactive runtime profiles. Parent: runtime-confinement design. This module supplies usable file capabilities for a future broker-only native adapter; it does not dispatch agents or replace the remaining OS/credential/model-transport work.

## Mission and value decision

The objective is reproducible, reviewable requests from capture through accepted evidence. Another startup probe would not advance that objective. Implement the smallest production module that can safely expose assigned immutable input bytes and collect a proposal without granting a general filesystem or command tool. The fact that would reverse this choice is an existing broker providing these exact guarantees; the inspected daemon has none.

Use Standard-plus because the module handles agent file capabilities. Existing kernel authorization is not expanded. No policies, red-team, CI, kernel decisions or major spec versions change. The implementation is an internal Go capability API, not a new serialized wire contract; a later public/MCP/controller contract must be sourced in TypeSpec before integration.

## Interface and authority

`confinement.Open(ctx, Options) (*Broker,error)` opens distinct dedicated input/output directory roots on Linux. Options bind one exact grant/run/package/preparation/base digest/role/lane scope, a live `Authority`, source/proposal byte budgets and an optional clock for deterministic tests. Supported preparer roles are requirements-preparer and technical-preparer; only public/internal lanes are eligible. This does not make any runtime profile active.

Authority `WithCurrent(ctx, grantID, callback)` must hold its authoritative grant/lease/revision/stop synchronization for the entire callback and record events in that same transaction. It supplies a detached immutable Grant and a transaction-bound event recorder. Missing, stopped, stale or unauthorized grants fail. Broker validation also requires the exact bound scope, nonexpired lease and unchanged source/output capability set. This is a required controller seam, not an already-implemented remote grant service.

`ReadInput(ctx,id)` resolves only an assigned input ID. The model supplies no host path. Source paths are normalized relative paths from the trusted grant, accessed through Go 1.24 os.Root. Open regular files without waiting on FIFO/device opens, bound reads to the configured resource budget, verify SHA-256 of actual bytes, and return no bytes on failure. Recheck expiry/context and record the observed source digest before returning.

`WriteProposal(ctx,bytes)` writes only the grant's fixed proposal basename. Bound payload size, create exclusively with owner-only permissions, sync/close, recheck expiry/context and record its actual digest before returning a receipt. No overwrite or implicit retry is accepted. Failed write/authority/event commit removes the newly created file. Cleanup failure is reported, never hidden. Consumers must wait for a successful receipt; file visibility during a write is not atomic publication. The output directory is dedicated to this broker and must not be exposed to concurrent untrusted writers or consumers.

The roots are retained directory handles. Reject overlapping roots, including real-path aliases and either direction of nesting. Source/output grants cannot be changed underneath an existing broker. The trusted supervisor owns these roots: os.Root does not establish immutable filesystem snapshots or prohibit privileged bind-mount replacement, hardlinks, or an administrator. SHA-256 and owner snapshot construction remain required. Supported production scope is Linux only; other OSes refuse before opening roots.

A broker has no process, shell, network, credential, confirmation, release, acceptance or blocker-resolution operation. Do not add general operations or a user-supplied path to make an adapter easier.

## Acceptance evidence

Real filesystem tests must show exact assigned reads and proposal bytes; absent/changed inputs; traversal, symlink escape and special-file refusal; overlap refusal; changed grant/scope/role/lane; expiry before/after operations; stopped/revoked authority; context cancellation; event/transaction failure; bounded payloads; exclusive output creation, cleanup and permissions. Concurrent publication admits one writer and preserves its bytes. Real-path rename and hostile symlink changes must not produce outside-root output or return unpinned bytes. Source/output operations remain serialized per broker and under the authority callback.

The explicit authority/recorder interface is a mandatory integration dependency. Until a real controller-backed authority, broker transport, native credential/model transport and approved profiles are implemented and proved, task 10 and assisted preparation stay held.
