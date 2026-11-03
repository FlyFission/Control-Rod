"""End to end: GeoJSON parcel to constraints, layout, rendered plan and a passing pre-check.

The plan render needs CADCraft; set CADCRAFT_CLI to a cadcraft-cli build or this test skips.
Set CR_SITE_KEEP to a directory to keep the rendered sheet.
"""

import json
import os
from pathlib import Path

import pytest
from pypdf import PdfReader

from cr_site.check import run_check
from cr_site.constraints import screen
from cr_site.layout import layout
from cr_site.parcel import resolve
from cr_site.plan import render_plan

PACK = Path(__file__).resolve().parents[1]


@pytest.mark.skipif(not os.environ.get("CADCRAFT_CLI"), reason="CADCRAFT_CLI not set")
def test_parcel_to_plan(parcel_file, fetcher, tmp_path):
    out = Path(os.environ.get("CR_SITE_KEEP") or tmp_path)
    program = json.loads((PACK / "examples" / "program.example.json").read_text())
    meta = json.loads((PACK / "examples" / "plan-meta.example.json").read_text())

    parcel = resolve(str(parcel_file))
    cons = screen(parcel, fetcher=fetcher)
    lay = layout(parcel, cons, program)
    for name, obj in (("parcel", parcel), ("constraints", cons), ("layout", lay)):
        (out / f"{name}.json").write_text(json.dumps(obj, indent=2))

    res = render_plan(os.environ["CADCRAFT_CLI"], parcel, cons, lay, program, meta, out)
    assert res["scale"] == "1\" = 100'"
    pdf = out / res["outputs"]["pdf"]["path"]
    page = PdfReader(str(pdf)).pages[0]
    assert (round(float(page.mediabox.width)), round(float(page.mediabox.height))) == (2448, 1584)
    text = "".join(page.extract_text().split())
    for want in (
        "CONCEPTSITEPLAN",
        "SITE-C-001",
        "DATAHALL1",
        "GRAPHICSCALE",
        "LEGEND",
        "EXAMPLEVALUESFORTESTINGONLY",
        "HOLDS",
    ):
        assert want in text, want

    rec = run_check(
        parcel,
        lay,
        cons,
        program,
        package_id="WP-EXAMPLE",
        revision=0,
        verifier="pre-check agent",
        output_path="layout.json",
        output_bytes=(out / "layout.json").read_bytes(),
    )
    (out / "pre-check.json").write_text(json.dumps(rec, indent=2))
    assert rec["outcome"] == "pass"
