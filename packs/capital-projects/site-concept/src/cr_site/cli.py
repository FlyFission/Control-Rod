"""cr-site: the tools agents use for every number in a site concept package."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path


def _load(path: str) -> dict:
    return json.loads(Path(path).read_text())


def _write(path: str, obj: dict) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(obj, indent=2, default=list) + "\n")


def cmd_parcel(a: argparse.Namespace) -> int:
    from .parcel import resolve

    feat = resolve(a.input, acres_hint=a.acres)
    _write(a.out, feat)
    p = feat["properties"]
    area = p.get("area", {}).get("value", "unknown")
    print(
        f"{p['input_kind']}: {p['derivation']}, {area} acres, "
        f"confirmation required: {p['confirmation_required']}, holds: {len(p.get('holds', []))}"
    )
    return 0


def cmd_plat(a: argparse.Namespace) -> int:
    from .plat import to_feature, traverse

    calls = _load(a.calls)
    pob = None
    if a.pob:
        lat, lon = (float(x) for x in a.pob.split(","))
        pob = {"lat": lat, "lon": lon}
    elif calls.get("pob"):
        pob = calls["pob"]
    res = traverse(calls["calls"])
    feat = to_feature(res, pob)
    feat["properties"].pop("raw_points_ft", None)
    _write(a.out, feat)
    print(
        f"closure {res['closure_error']['value']} ft, precision {res['precision_ratio']}, "
        f"area {res['area']['value']} acres, findings: {len(res['findings'])}"
    )
    return 1 if res["findings"] else 0


def cmd_constraints(a: argparse.Namespace) -> int:
    from .constraints import screen

    res = screen(_load(a.parcel), radius_mi=a.radius_mi)
    _write(a.out, res)
    print(f"{len(res['facts'])} facts, {len(res['holds'])} holds")
    return 0


def cmd_layout(a: argparse.Namespace) -> int:
    from .layout import layout

    res = layout(_load(a.parcel), _load(a.constraints), _load(a.program))
    _write(a.out, res)
    print(
        f"{len(res['blocks'])} blocks placed, {len(res['unplaced'])} unplaced, "
        f"{len(res['holds'])} holds"
    )
    return 0


def cmd_plan(a: argparse.Namespace) -> int:
    from .plan import render_plan

    meta = _load(a.record)
    meta.setdefault("date", datetime.now(UTC).strftime("%Y-%m-%d"))
    cli = os.environ.get("CADCRAFT_CLI", "cadcraft-cli")
    res = render_plan(
        cli,
        _load(a.parcel),
        _load(a.constraints),
        _load(a.layout),
        _load(a.program),
        meta,
        Path(a.out_dir),
    )
    _write(
        str(Path(a.out_dir) / "plan-manifest.json"),
        {k: v for k, v in res.items() if k != "record"} | {"record": res["record"]},
    )
    print(
        f"plan rendered at {res['scale']}: " + ", ".join(v["path"] for v in res["outputs"].values())
    )
    return 0


def cmd_check(a: argparse.Namespace) -> int:
    from .check import run_check

    out = Path(a.layout)
    rec = run_check(
        _load(a.parcel),
        _load(a.layout),
        _load(a.constraints),
        _load(a.program),
        package_id=a.package_id,
        revision=a.revision,
        verifier=a.verifier,
        output_path=out.name,
        output_bytes=out.read_bytes(),
    )
    _write(a.out, rec)
    print(f"outcome: {rec['outcome']}, findings: {len(rec['findings'])}")
    return 0 if rec["outcome"] != "fail" else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="cr-site", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    pa = sub.add_parser("parcel", help="parcel tools")
    pas = pa.add_subparsers(dest="sub", required=True)
    r = pas.add_parser("resolve", help="any parcel input to a boundary with provenance")
    r.add_argument("--input", required=True, help="file path or text")
    r.add_argument("--acres", type=float, help="acreage for a point or address input")
    r.add_argument("--out", required=True)
    r.set_defaults(fn=cmd_parcel)

    pl = sub.add_parser("plat", help="plat tools")
    pls = pl.add_subparsers(dest="sub", required=True)
    c = pls.add_parser("closure", help="bearings and distances to a closed boundary")
    c.add_argument("--calls", required=True)
    c.add_argument("--pob", help="point of beginning as LAT,LON")
    c.add_argument("--out", required=True)
    c.set_defaults(fn=cmd_plat)

    cs = sub.add_parser("constraints", help="public GIS constraints screen")
    cs.add_argument("--parcel", required=True)
    cs.add_argument("--radius-mi", type=float, default=5.0)
    cs.add_argument("--out", required=True)
    cs.set_defaults(fn=cmd_constraints)

    ly = sub.add_parser("layout", help="deterministic block layout")
    for k in ("parcel", "constraints", "program", "out"):
        ly.add_argument(f"--{k}", required=True)
    ly.set_defaults(fn=cmd_layout)

    pn = sub.add_parser("plan", help="render the concept site plan sheet")
    for k in ("parcel", "constraints", "layout", "program", "record"):
        pn.add_argument(f"--{k}", required=True)
    pn.add_argument("--out-dir", required=True)
    pn.set_defaults(fn=cmd_plan)

    ck = sub.add_parser("check", help="deterministic pre-check; writes a VerificationRecord")
    for k in ("parcel", "layout", "constraints", "program", "out"):
        ck.add_argument(f"--{k}", required=True)
    ck.add_argument("--package-id", required=True)
    ck.add_argument("--revision", type=int, default=0)
    ck.add_argument("--verifier", default="pre-check agent")
    ck.set_defaults(fn=cmd_check)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.fn(args)
    except (ValueError, FileNotFoundError) as e:
        print(f"refused: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
