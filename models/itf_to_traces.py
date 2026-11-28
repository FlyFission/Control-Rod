"""Turn Quint ITF runs of models/package-lifecycle.qnt into conformance traces (pattern PL2).

Each ITF state after the first holds the request the model built (`lastReq`) and the
decision the floors require (`lastOut`). This script writes one trace file per run, in
the kernel's own request JSON, plus an index with each file's SHA-256. It is called by
models/generate.sh; run that instead of this file.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

FORMAT = "controlrod-package-lifecycle-trace"
VERSION = 1
PROVIDER_MODEL = "default"


def itf_map(value: dict) -> dict:
    """An ITF map value ({"#map": [[key, value], ...]}) as a plain dict."""
    return {k: v for k, v in value["#map"]}


def kernel_request(r: dict) -> dict:
    """The model's request record as the kernel's Request JSON. Empty strings are absent fields."""
    out = {
        "status": r["status"],
        "action": r["act"],
        "actor_kind": r["actor_kind"],
        "actor_id": r["actor_id"],
    }
    if r["claimed_by"]:
        out["claimed_by"] = r["claimed_by"]
    if r["author_baseline"]:
        out["author_baseline"] = r["author_baseline"]
    if r["checker_baseline"]:
        out["checker_baseline"] = r["checker_baseline"]
    if r["author_provider"]:
        out["author_runtime"] = {
            "provider": r["author_provider"],
            "model": PROVIDER_MODEL,
        }
    if r["checker_provider"]:
        out["checker_runtime"] = {
            "provider": r["checker_provider"],
            "model": PROVIDER_MODEL,
        }
    families = itf_map(r["families"])
    if families:
        out["vendor_families"] = dict(sorted(families.items()))
    out["owner_override_verified"] = r["owner_override_verified"]
    if r["pre_check"]:
        out["pre_check"] = r["pre_check"]
    out["assertion_verified"] = r["assertion_verified"]
    out["digest_matches"] = r["digest_matches"]
    out["reason_given"] = r["reason_given"]
    if r["prep_enrolled"]:
        out["preparation"] = dict(sorted(r["prep"].items()))
    return out


def expectation(o: dict) -> dict:
    return {"allowed": o["allowed"], "reason": o["reason"], "next": o["next"] or None}


def trace_from_itf(itf: dict, name: str, generator: dict) -> dict:
    steps = [
        {"request": kernel_request(s["lastReq"]), "expect": expectation(s["lastOut"])}
        for s in itf["states"][1:]
    ]
    return {
        "format": FORMAT,
        "version": VERSION,
        "name": name,
        "source": "generated",
        "generator": generator,
        "known_violations": [],
        "steps": steps,
    }


def dump(value: object) -> str:
    return json.dumps(value, indent=2) + "\n"


def dump_trace(trace: dict) -> str:
    """Pretty header, one step per line: small files and readable diffs."""
    head = {k: v for k, v in trace.items() if k != "steps"}
    lines = json.dumps(head, indent=2)[:-2] + ',\n  "steps": [\n'
    lines += ",\n".join(
        "    " + json.dumps(step, separators=(", ", ": ")) for step in trace["steps"]
    )
    return lines + "\n  ]\n}\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--itf-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument(
        "--model-name", required=True, help="model path as recorded in the traces"
    )
    parser.add_argument("--seed", required=True)
    parser.add_argument("--tool-version", required=True)
    parser.add_argument("--command", required=True)
    args = parser.parse_args(argv)

    model_sha = hashlib.sha256(args.model.read_bytes()).hexdigest()
    runs = sorted(
        args.itf_dir.glob("run_*.itf.json"),
        key=lambda p: int(p.stem.split("_")[1].split(".")[0]),
    )
    if not runs:
        print(f"no ITF runs in {args.itf_dir}", file=sys.stderr)
        return 1
    args.out.mkdir(parents=True, exist_ok=True)
    for old in args.out.glob("gen-*.json"):
        old.unlink()
    entries = []
    for i, run in enumerate(runs):
        name = f"gen-seed-{args.seed}-{i:02d}"
        generator = {
            "tool": "quint",
            "tool_version": args.tool_version,
            "model": args.model_name,
            "model_sha256": model_sha,
            "seed": args.seed,
            "run": i,
            "command": args.command,
        }
        text = dump_trace(
            trace_from_itf(json.loads(run.read_text(encoding="utf-8")), name, generator)
        )
        path = args.out / f"{name}.json"
        path.write_text(text, encoding="utf-8")
        entries.append(
            {"file": path.name, "sha256": hashlib.sha256(text.encode()).hexdigest()}
        )
    index = {
        "format": FORMAT,
        "version": VERSION,
        "model_sha256": model_sha,
        "traces": entries,
    }
    (args.out / "index.json").write_text(dump(index), encoding="utf-8")
    print(f"wrote {len(entries)} traces to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
