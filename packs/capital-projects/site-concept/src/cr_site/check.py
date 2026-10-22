"""Deterministic pre-check of a site concept: geometry, areas, citations and assumption status.

Writes a VerificationRecord (spec/generated/json-schema/VerificationRecord.json, method
"agent-pre-check") and validates it against the generated schema before returning it.
The pre-check proves internal consistency. It does not judge whether the site is a good one;
that review is a person's.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from shapely.geometry import shape

from .geo import Frame, ft, qval

AREA_TOL = 0.001  # 0.1 percent
GEOM_TOL_M = 0.01
VERSION = "cr-site check 0.1.0"


def schema_dir() -> Path:
    env = os.environ.get("CR_SCHEMA_DIR")
    if env:
        return Path(env)
    for parent in Path(__file__).resolve().parents:
        cand = parent / "spec" / "generated" / "json-schema"
        if cand.is_dir():
            return cand
    raise FileNotFoundError("spec/generated/json-schema not found; set CR_SCHEMA_DIR")


def validate_record(record: dict) -> None:
    d = schema_dir()
    resources = []
    for f in sorted(d.glob("*.json")):
        s = json.loads(f.read_text())
        resources.append((s["$id"], Resource.from_contents(s)))
    reg = Registry().with_resources(resources)
    schema = json.loads((d / "VerificationRecord.json").read_text())
    Draft202012Validator(schema, registry=reg).validate(record)


def _custody() -> dict:
    # The checker runs separately from the author agent and sees only the deliverables, but it
    # shares the cr-site toolkit the author used and runs on the same machine.
    return {
        "generated_by": VERSION,
        "selected_by": VERSION,
        "presented_by": "pre-check agent",
        "coupling": {
            "actor": "independent",
            "context": "independent",
            "mechanism": "shared",
            "authority": "independent",
            "resource": "shared",
        },
    }


def run_check(
    parcel: dict,
    layout: dict,
    constraints: dict,
    program: dict,
    *,
    package_id: str,
    revision: int,
    verifier: str,
    output_path: str,
    output_bytes: bytes,
) -> dict:
    geom = shape(parcel["geometry"])
    frame = Frame.for_geometry(geom)
    pm = frame.to_m(geom)
    build = frame.to_m(shape(layout["buildable_ll"]))
    setback_ft = qval(layout["setback"]) or 0.0
    evidence: list[dict] = []
    findings: list[dict] = []
    failed = False

    def ev(claim: str, ok: bool | None, detail: str = "") -> None:
        nonlocal failed
        status = "pass" if ok else ("deferred" if ok is None else "open")
        evidence.append(
            {
                "claim": claim + (f": {detail}" if detail else ""),
                "status": status,
                "custody": _custody(),
            }
        )
        if ok is False:
            failed = True
            findings.append(
                {
                    "id": f"CHK-{len(findings) + 1:02d}",
                    "severity": "major",
                    "text": claim + (f": {detail}" if detail else ""),
                }
            )

    rects = [(b["label"], frame.to_m(shape(b["polygon_ll"])), b) for b in layout["blocks"]]

    outside = [n for n, r, _ in rects if not pm.buffer(GEOM_TOL_M).contains(r)]
    ev("Every block lies inside the parcel", not outside, ", ".join(outside))
    outside_b = [n for n, r, _ in rects if not build.buffer(GEOM_TOL_M).contains(r)]
    ev("Every block lies inside the buildable area", not outside_b, ", ".join(outside_b))
    overlaps = []
    for i in range(len(rects)):
        for j in range(i + 1, len(rects)):
            if rects[i][1].intersection(rects[j][1]).area > GEOM_TOL_M**2:
                overlaps.append(f"{rects[i][0]} and {rects[j][0]}")
    ev("No two blocks overlap", not overlaps, "; ".join(overlaps))
    close = [
        f"{n} at {ft(r.distance(pm.exterior)):.1f} ft"
        for n, r, _ in rects
        if ft(r.distance(pm.exterior)) < setback_ft - 0.01
    ]
    ev(f"Every block respects the {setback_ft:g} ft property setback", not close, "; ".join(close))

    bad_area = []
    for n, r, b in rects:
        rep = qval(b["area"]["ft2"])
        actual = r.area / 0.3048**2
        if rep is None or abs(rep - actual) > AREA_TOL * actual:
            bad_area.append(f"{n} reports {rep} ft2, recomputed {actual:.0f}")
    rep_p = qval(layout["parcel_area"]["acres"])
    act_p = qval(parcel["properties"]["area"])
    if rep_p is None or act_p is None or abs(rep_p - act_p) > AREA_TOL * act_p:
        bad_area.append(f"parcel area {rep_p} acres versus {act_p} acres in parcel.json")
    ev("Reported areas match recomputed areas within 0.1%", not bad_area, "; ".join(bad_area))

    uncited = [
        f["id"]
        for f in constraints.get("facts", [])
        if not all(f.get("source", {}).get(k) for k in ("url", "retrieved_at", "sha256"))
    ]
    ev(
        "Every constraint fact cites URL, retrieval time and response digest",
        not uncited,
        ", ".join(uncited),
    )

    from .layout import parameter_status

    statuses = parameter_status(program)
    bad_status = [p["name"] for p in statuses if p.get("status") not in ("assumption", "confirmed")]
    ev(
        "Every program value is marked assumption or confirmed",
        not bad_status,
        ", ".join(bad_status),
    )
    open_assumptions = [p["name"] for p in statuses if p.get("status") == "assumption"]
    if open_assumptions:
        findings.append(
            {
                "id": "CHK-ASSUMPTIONS",
                "severity": "info",
                "text": f"{len(open_assumptions)} program values are still assumptions "
                "awaiting owner confirmation",
            }
        )

    holds = (
        (parcel["properties"].get("holds") or [])
        + (constraints.get("holds") or [])
        + (layout.get("holds") or [])
    )
    for h in holds:
        findings.append({"id": h["id"], "severity": "minor", "text": f"Open hold: {h['text']}"})
    for f in layout.get("findings") or []:
        findings.append({"id": f["id"], "severity": f["severity"], "text": f["text"]})

    unconfirmed = bool(parcel["properties"].get("confirmation_required"))
    ev(
        "Parcel boundary is exact or confirmed by a person",
        None if unconfirmed else True,
        "confirmation required" if unconfirmed else "",
    )

    outcome = "fail" if failed else ("inconclusive" if unconfirmed else "pass")
    record = {
        "schema_version": "0.1.0",
        "package_id": package_id,
        "package_revision": revision,
        "output": {
            "path": output_path,
            "digest": {"algorithm": "sha256", "value": hashlib.sha256(output_bytes).hexdigest()},
        },
        "method": "agent-pre-check",
        "verifier": verifier,
        "evidence": evidence,
        "findings": findings,
        "outcome": outcome,
    }
    validate_record(record)
    return record
