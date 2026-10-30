"""Generate digest vectors for every frozen (digest addressed) object type.

Specification section 6 (Digested): each frozen type's digest must be recomputable from stored
bytes by any implementation. This tool writes one example body per type with its RFC 8785
canonical form and SHA-256, computed here in Python; the API tests check that the Rust kernel's
digest (through its WebAssembly build) gives the same value and that each body passes its
generated schema. The examples use only strings, booleans, arrays, objects and small integers,
for which RFC 8785 equals sorted compact JSON.

Run: python3 tools/generate_object_vectors.py  (writes spec/vectors/object-digests.json)
     python3 tools/generate_object_vectors.py --check  (fails if the file is stale)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "spec" / "vectors" / "object-digests.json"

D = {"algorithm": "sha256", "value": "a" * 64}
D2 = {"algorithm": "sha256", "value": "b" * 64}
ASSIGN = {"role": "author", "agent_baseline": "baseline-author", "baseline_revision": 1}

EXAMPLES = {
    "SignerQualification": {
        "id": "qual_example", "version": 1, "org_id": "org_local", "member_id": "mem_example",
        "licenses": [{"jurisdiction": "US-SC", "number": "PE-1", "discipline": "mechanical", "expires_on": "2028-06-30"}],
        "disciplines": ["mechanical"], "grades": ["general-service"], "roles": ["checker"],
        "authorities": ["lane"], "revoked": False, "reason": "initial", "effective_at": "2026-10-30T12:00:00.000Z",
    },
    "AuthenticatorCredential": {
        "id": "cred_example", "version": 1, "org_id": "org_local", "member_id": "mem_example",
        "credential_id": "Y3JlZGVudGlhbA", "attestation_format": "packed", "aaguid": "00000000-0000-0000-0000-000000000000",
        "user_verified": True, "backup_eligible": False,
        "hardware_floor": {"eligible": True, "reason": "packed attestation verified"},
        "recorded_at": "2026-10-30T12:00:00.000Z",
    },
    "Delegation": {
        "id": "del_example", "org_id": "org_local", "from_member_id": "mem_a", "to_member_id": "mem_b",
        "role": "checker", "starts_on": "2026-11-01", "ends_on": "2026-11-15", "reason": "leave cover",
    },
    "PolicySet": {
        "id": "pol_example", "version": 1, "org_id": "org_local", "hardware_attestation_formats": ["packed", "tpm"],
        "settings": {"autonomy_ceiling": "3"}, "reason": "initial", "effective_at": "2026-10-30T12:00:00.000Z",
    },
    "DelegationRevocation": {
        "id": "drev_example", "org_id": "org_local", "delegation_id": "del_example", "revoked_by": "mem_a",
        "reason": "cover no longer needed", "revoked_at": "2026-11-03T09:00:00.000Z",
    },
    "SourceManifest": {
        "id": "man_example", "org_id": "org_local",
        "files": [{"path": "src/a.py", "mode": "file", "digest": D},
                  {"path": "bin/run", "mode": "executable", "digest": D2},
                  {"path": "docs/link", "mode": "symlink", "digest": D, "link_target": "../README.md"}],
        "symlink_policy": "preserve-inside",
        "submodules": [{"path": "vendor/lib", "url": "https://example.invalid/lib.git", "commit": "c" * 40}],
        "lfs_resolved": True, "excluded": [{"path": ".env", "reason": "secret"}], "ignored_inputs": ["build/config.json"],
    },
    "CandidateAssignment": {
        "id": "cand_example", "org_id": "org_local", "package_id": "pkg_example", "package_revision": 1,
        "release_digest": D, "ordinal": 1, "author_assignment": ASSIGN,
    },
    "RuntimeArtifactVersion": {
        "id": "rav_example", "org_id": "org_local", "runtime": "claude-code", "version": "2.1.314",
        "artifact_digest": D, "install_path": "/opt/claude/bin/claude", "probe_ids": ["probe_example"],
    },
    "ControlledRecord": {
        "id": "rec_example", "org_id": "org_local", "kind": "merged-change", "package_id": "pkg_example",
        "package_revision": 1, "candidate_id": "cand_example", "input_digests": [D, D2],
        "clearance_decision_id": "dec_example", "applied_ref": "d" * 40,
    },
    "SandboxPolicy": {
        "id": "sbx_laptop", "version": 1, "org_id": "org_local", "driver": "native-cli",
        "denied_read": ["~/.claude", "~/.codex", "~/.ssh"], "writable_roots": ["."], "allowed_hosts": [],
        "enabled_tools": ["Bash", "Read", "Edit", "Write", "Grep", "Glob"],
        "mandatory_claims": ["login-unreadable", "no-network", "writes-in-workspace"],
    },
}


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def build() -> str:
    vectors = [{"type": t, "body": body, "canonical": canonical(body),
                "sha256": hashlib.sha256(canonical(body).encode("utf-8")).hexdigest()}
               for t, body in sorted(EXAMPLES.items())]
    doc = {"description": __doc__.strip().splitlines()[0], "generator": "tools/generate_object_vectors.py",
           "vectors": vectors}
    return json.dumps(doc, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--check", action="store_true")
    text = build()
    if p.parse_args().check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print(f"{OUT.relative_to(ROOT)} is stale; run tools/generate_object_vectors.py", file=sys.stderr)
            return 1
        return 0
    OUT.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
