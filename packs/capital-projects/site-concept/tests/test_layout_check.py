import copy
import json
from pathlib import Path

import pytest
from shapely.geometry import shape

from cr_site.check import run_check
from cr_site.constraints import screen
from cr_site.layout import layout
from cr_site.parcel import resolve

PACK = Path(__file__).resolve().parents[1]
EXAMPLE = json.loads((PACK / "examples" / "program.example.json").read_text())
TYPICAL = json.loads((PACK / "typicals" / "data-center-50mw.json").read_text())


@pytest.fixture
def inputs(parcel_file, fetcher):
    parcel = resolve(str(parcel_file))
    return parcel, screen(parcel, fetcher=fetcher)


def _check(parcel, lay, cons, prog):
    return run_check(
        parcel,
        lay,
        cons,
        prog,
        package_id="WP-TEST",
        revision=0,
        verifier="test",
        output_path="layout.json",
        output_bytes=json.dumps(lay).encode(),
    )


def test_example_program_places_all_blocks(inputs):
    parcel, cons = inputs
    lay = layout(parcel, cons, EXAMPLE)
    assert [b["label"] for b in lay["blocks"]][:2] == ["DATA HALL 1", "DATA HALL 2"]
    assert lay["unplaced"] == []
    assert len(lay["blocks"]) == 8
    assert {e["kind"] for e in lay["excluded"]} == {"flood", "wetlands", "steep"}
    assert lay["access_road"]["width"]["value"] == "30.0"


def test_layout_is_deterministic(inputs):
    parcel, cons = inputs
    assert layout(parcel, cons, EXAMPLE) == layout(parcel, cons, EXAMPLE)


def test_typical_with_nulls_places_nothing_and_lists_holds(inputs):
    parcel, cons = inputs
    lay = layout(parcel, cons, TYPICAL)
    assert lay["blocks"] == []
    ids = {h["id"] for h in lay["holds"]}
    assert {
        "HOLD-SETBACK",
        "HOLD-SLOPE-LIMIT",
        "HOLD-SPACING",
        "HOLD-ROAD-WIDTH",
        "HOLD-BLOCK-DATA_HALLS",
        "HOLD-BLOCK-SUBSTATION",
    } <= ids


def test_typical_invents_no_numbers():
    params = list(TYPICAL["parameters"].values())
    for b in TYPICAL["blocks"]:
        params += [b["count"], b["width"], b["depth"]]
    non_null = [p for p in params if p["value"] is not None]
    assert non_null == [TYPICAL["parameters"]["capacity"]]
    assert all(p["status"] == "assumption" for p in params)


def test_check_passes_and_validates(inputs):
    parcel, cons = inputs
    lay = layout(parcel, cons, EXAMPLE)
    rec = _check(parcel, lay, cons, EXAMPLE)
    assert rec["outcome"] == "pass"
    assert all(e["status"] == "pass" for e in rec["evidence"])
    assert rec["method"] == "agent-pre-check"


def test_check_catches_tampered_area(inputs):
    parcel, cons = inputs
    lay = layout(parcel, cons, EXAMPLE)
    bad = copy.deepcopy(lay)
    bad["blocks"][0]["area"]["ft2"]["value"] = "1"
    assert _check(parcel, bad, cons, EXAMPLE)["outcome"] == "fail"


def test_check_catches_a_block_moved_into_the_setback(inputs):
    parcel, cons = inputs
    lay = layout(parcel, cons, EXAMPLE)
    bad = copy.deepcopy(lay)
    g = shape(parcel["geometry"])
    minx, miny, _, _ = g.bounds
    w = 0.0005
    bad["blocks"][0]["polygon_ll"] = {
        "type": "Polygon",
        "coordinates": [
            [[minx, miny], [minx + w, miny], [minx + w, miny + w], [minx, miny + w], [minx, miny]]
        ],
    }
    rec = _check(parcel, bad, cons, EXAMPLE)
    assert rec["outcome"] == "fail"
    assert any("setback" in f["text"] for f in rec["findings"])


def test_uncited_fact_fails(inputs):
    parcel, cons = inputs
    lay = layout(parcel, cons, EXAMPLE)
    bad = copy.deepcopy(cons)
    bad["facts"][0]["source"].pop("sha256")
    assert _check(parcel, lay, bad, EXAMPLE)["outcome"] == "fail"


def test_unconfirmed_boundary_is_inconclusive(fetcher):
    parcel = resolve("34.7521, -82.2967", acres_hint=69)
    cons = screen(parcel, fetcher=fetcher)
    lay = layout(parcel, cons, EXAMPLE)
    assert _check(parcel, lay, cons, EXAMPLE)["outcome"] == "inconclusive"
