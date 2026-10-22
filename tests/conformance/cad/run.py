"""Conformance checks for the CADCraft drawing engine (ADR 0018).

Run:
    CADCRAFT_CLI=/path/to/cadcraft-cli uv run --with ezdxf --with pypdf --with pillow \\
        python tests/conformance/cad/run.py OUTDIR

Exits 0 only if every check passes. Writes OUTDIR/evidence.json with each check's result, the
CADCraft and library versions, and SHA-256 digests of every file the checks produced. Skips with
exit code 0 and a notice when CADCRAFT_CLI is not set, so it can sit beside CI until a pinned
CADCraft build is available there.
"""

from __future__ import annotations

import collections
import copy
import hashlib
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "packs" / "capital-projects" / "drawings"))

import render_sheet as rs  # noqa: E402

TEMPLATE = ROOT / "packs/capital-projects/drawings/sheet-ansi-d.json"
RECORD = ROOT / "packs/capital-projects/drawings/examples/fdn-200-001.record.json"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def census(cad: rs.Cad, path: Path | None = None) -> tuple[dict, list[str]]:
    if path is not None:
        cad.tool("open", {"path": str(path)})
    counts = cad.tool("inspect_drawing", {})["counts"]
    found = cad.tool("find_text", {"limit": 1000})
    texts = sorted(t["text"] for t in (found["texts"] if isinstance(found, dict) else found))
    return counts, texts


def main() -> int:
    cli = os.environ.get("CADCRAFT_CLI")
    if not cli:
        print("skipped: set CADCRAFT_CLI to a pinned cadcraft-cli build")
        return 0
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "cad-evidence").resolve()
    out.mkdir(parents=True, exist_ok=True)
    tpl, rec = json.loads(TEMPLATE.read_text()), json.loads(RECORD.read_text())
    checks: list[dict] = []

    def check(cid: str, claim: str, ok: bool, detail: str) -> None:
        checks.append({"id": cid, "claim": claim, "pass": bool(ok), "detail": detail})
        print(("PASS " if ok else "FAIL ") + cid + ": " + detail)

    # Capture the live drawing before any writer serializes it. Reopening an already
    # saved DXF as the baseline would hide content lost by the first save.
    base: tuple[dict, list[str]] | None = None

    class BeforeSaveCad(rs.Cad):
        def tool(self, name: str, args: dict):
            nonlocal base
            if name == "save" and base is None:
                base = census(self)
            return super().tool(name, args)

    # CAD-01 render from template and record.
    with patch.object(rs, "Cad", BeforeSaveCad):
        res = rs.render(cli, tpl, rec, out / "sheet")
    if base is None:
        raise AssertionError("renderer never reached its first save")
    files = {k: out / "sheet" / v["path"] for k, v in res["outputs"].items()}
    check(
        "CAD-01",
        "A sheet renders from template and record alone",
        all(f.exists() for f in files.values()),
        ", ".join(sorted(files)),
    )

    # CAD-02 true-size PDF with searchable title block and notes headings.
    from pypdf import PdfReader

    page = PdfReader(str(files["pdf"])).pages[0]
    size = (round(float(page.mediabox.width)), round(float(page.mediabox.height)))
    # Word spacing in extracted PDF text depends on the extractor, so compare without whitespace.
    text = "".join(page.extract_text().split())
    want = [str(v) for v in rec["titleBlock"].values() if v != "-"] + [
        s["heading"] for s in tpl["notes"]["sections"]
    ]
    missing = [w for w in want if "".join(w.split()) not in text]
    check(
        "CAD-02",
        "PDF is ANSI D at true size with searchable title block and notes",
        size == (2448, 1584) and not missing,
        f"size {size}, missing text {missing}",
    )

    # CAD-03 and CAD-04 round trips of our own sheet.
    for cid, src in (("CAD-03", files["dxf"]), ("CAD-04", files["dwg"])):
        got = census(rs.Cad(cli), src)
        check(
            cid,
            f"{src.suffix} reopens with identical entities and texts",
            got == base,
            f"counts {got[0]}",
        )
    cad = rs.Cad(cli)
    cad.tool("open", {"path": str(files["dwg"])})
    second = out / "sheet" / "second.dwg"
    cad.tool("save", {"path": str(second)})
    check(
        "CAD-05",
        "A second DWG save and reopen changes nothing",
        census(rs.Cad(cli), second) == base,
        second.name,
    )

    # CAD-06 a drawing made by another program keeps its entities, xdata, attributes and layers.
    import ezdxf
    from ezdxf.math import Vec2
    from ezdxf.render import mleader

    doc = ezdxf.new("R2018", setup=True)
    msp = doc.modelspace()
    doc.layers.add("S-FNDN", color=3)
    doc.appids.add("CUSTOMERAPP")
    msp.add_line((0, 0), (10, 0), dxfattribs={"layer": "S-FNDN"}).set_xdata(
        "CUSTOMERAPP", [(1000, "TAG P-101A")]
    )
    msp.add_lwpolyline([(0, 0, 0, 0, 0.5), (5, 0), (5, 5), (0, 5)], format="xyseb", close=True)
    msp.add_circle((2, 2), 1)
    msp.add_arc((7, 7), 2, 0, 120)
    msp.add_ellipse((10, 10), major_axis=(3, 0), ratio=0.4)
    msp.add_spline([(0, 0), (2, 3), (5, 1), (8, 4)])
    msp.add_text("ANCHOR BOLT", dxfattribs={"height": 0.2}).set_placement((1, 6))
    msp.add_mtext("NOTES:\\P1. CONCRETE", dxfattribs={"char_height": 0.15}).set_location((12, 6))
    msp.add_linear_dim(base=(0, -2), p1=(0, 0), p2=(10, 0)).render()
    hatch = msp.add_hatch(color=2)
    hatch.paths.add_polyline_path([(20, 0), (24, 0), (24, 3), (20, 3)])
    hatch.set_pattern_fill("ANSI31", scale=0.5)
    blk = doc.blocks.new("EQUIP_TAG")
    blk.add_circle((0, 0), 0.5)
    blk.add_attdef("TAG", (-0.3, -0.1), dxfattribs={"height": 0.15})
    msp.add_blockref("EQUIP_TAG", (15, 15)).add_auto_attribs({"TAG": "P-101A"})
    msp.add_leader([(15, 15), (17, 17), (19, 17)])
    ml = msp.add_multileader_mtext("Standard")
    ml.set_content("SEE DETAIL 3")
    ml.add_leader_line(mleader.ConnectionSide.left, [Vec2(25, 10)])
    ml.build(insert=Vec2(27, 12))
    msp.add_point((30, 30))
    msp.add_xline((0, 0), (1, 1))
    msp.add_solid([(40, 0), (41, 0), (40, 1)])
    foreign = out / "foreign.dxf"
    doc.saveas(foreign)

    def ez(p: Path):
        d = ezdxf.readfile(p)
        m = d.modelspace()
        return (
            dict(collections.Counter(e.dxftype() for e in m)),
            sum(1 for e in m if e.has_xdata("CUSTOMERAPP")),
            [a.dxf.text for e in m.query("INSERT") for a in e.attribs],
            sorted(layer.dxf.name for layer in d.layers),
        )

    cad = rs.Cad(cli)
    cad.tool("open", {"path": str(foreign)})
    kept = out / "foreign_saved.dxf"
    cad.tool("save", {"path": str(kept)})
    a, b = ez(foreign), ez(kept)
    check(
        "CAD-06",
        "A foreign DXF keeps every entity, its xdata, attributes and layers through a save",
        a == b,
        f"{len(a[0])} entity types; xdata {b[1]}; attributes {b[2]}",
    )

    # CAD-07 to CAD-09 refusals: a sheet that would break the standard is never written.
    def refused(cid: str, claim: str, mutate) -> None:
        bad = copy.deepcopy(rec)
        mutate(bad)
        try:
            rs.render(cli, tpl, bad, out / cid)
            check(cid, claim, False, "rendered when it should have been refused")
        except rs.SheetError as e:
            check(cid, claim, not (out / cid).exists(), f"refused: {e}")

    refused(
        "CAD-07",
        "A record missing a title block field is refused",
        lambda r: r["titleBlock"].pop("REV"),
    )
    refused(
        "CAD-08",
        "A value too long for its cell is refused",
        lambda r: r["titleBlock"].__setitem__("PREPARED", "AGENT FDN-200, BASELINE 3, RUN 17"),
    )
    refused(
        "CAD-09",
        "Notes that overflow the notes column are refused",
        lambda r: r["notes"].__setitem__("general", ["THIS NOTE REPEATS TO FILL THE COLUMN."] * 80),
    )

    import PIL
    import pypdf

    produced = sorted(p for p in out.rglob("*") if p.is_file() and p.name != "evidence.json")
    evidence = {
        "tool": res["tool"],
        "libraries": {
            "ezdxf": ezdxf.__version__,
            "pypdf": pypdf.__version__,
            "pillow": PIL.__version__,
        },
        "template_sha256": sha(TEMPLATE),
        "record_sha256": sha(RECORD),
        "checks": checks,
        "files": {str(p.relative_to(out)): sha(p) for p in produced},
    }
    (out / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    return 0 if all(c["pass"] for c in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
