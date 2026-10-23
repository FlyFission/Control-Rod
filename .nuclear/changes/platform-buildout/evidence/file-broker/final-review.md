# File broker final review and closure

Read-only fresh-context review froze `dae5dc6c50ee3037baec01a0055926f976fd95e0`. The reviewer judged the file-capability API useful and its integration limits appropriate, but required two Important fixes. No Critical or Minor was reported. The checkout stayed unchanged during review. This is a separate agent context/tool-assisted review, not independent engineering authority.

1. Expiry/context guards ended before authority transaction completion. A delayed successful commit could return expired input bytes, construction or a proposal receipt.
2. Early canonical path strings could describe different directories from the later retained roots. A real rename/symlink race admitted an input root containing output.

The implementer regraded both Important and reproduced both failures in checked-in regressions before the one fix pass. Expiry and cancellation now refuse construction/read/write after commit; failed proposal receipt removes the new file. Previously committed I/O events remain factual history, never admission. Directory privacy/ancestry now derive from retained descriptors and Linux openat parent traversal; no early canonical-name proof is used. The 20,000-attempt root race and all commit-boundary cases pass under the race detector.

Final full daemon race suite: confinement 20 top-level tests + 63 subtests; digest 4 top-level; runner 35 top-level + 9 subtests. Vet and formatting pass; Windows amd64 and macOS arm64 compilation passes only. No second review was dispatched: the execution workflow requires one fix pass backed by failed-first regressions and the full green suite. No review finding was left unresolved.

## Declined behaviors and disposition

- Native/controller/transport/credential/policy integration: future task-10 gates; this module is not dispatched.
- Non-Linux runtime assurance: explicitly unsupported; compilation is not execution.
- Atomic visibility/crash-consistent publication: consumers wait for a successful receipt and the output directory remains dedicated; staging publication is required before concurrent consumers.
- Host administrator, privileged mounts/hardlinks, other output writers/consumers and concurrently mutated caller buffers: outside exclusive-root/supervisor ownership; no hostile-owner proof claimed.
- Arbitrary device-driver blocking/side effects: only FIFO nonblocking and actual regular-file checks are proved; snapshot/OS boundary is still required.
- Authority implementations violating synchronous immutable-grant/transaction/record semantics: unsupported; real controller authority must meet and prove this mandatory contract.
- Validity after return: consumers must recheck live authority; post-commit broker checks do not extend leases.

Each disposition and its cost is carried into the persistent ledger. Protected surfaces and existing runtime behavior are unchanged.
