import pytest

from cr_site.geo import qval
from cr_site.plat import PlatError, azimuth_deg, to_feature, traverse


@pytest.mark.parametrize(
    ("bearing", "az"),
    [
        ("N 45°30'00\" E", 45.5),
        ("S 10d E", 170.0),
        ("S 30°15' W", 210.25),
        ("N 89°59'60\" W", 270.0),
        ("n 0 e", 0.0),
    ],
)
def test_bearings(bearing, az):
    assert azimuth_deg(bearing) == pytest.approx(az)


def test_bad_bearing():
    with pytest.raises(PlatError):
        azimuth_deg("NE 45")


def square(dist="660.00"):
    return [
        {"bearing": "N 0 E", "distance": dist},
        {"bearing": "S 90 E", "distance": dist},
        {"bearing": "S 0 E", "distance": dist},
        {"bearing": "N 90 W", "distance": dist},
    ]


def test_closed_square_is_ten_acres():
    r = traverse(square())
    assert r["closure_error"]["value"] == "0.000"
    assert r["precision_ratio"] == "1:inf"
    assert r["area"] == {"value": "10.000", "unit": "acre"}
    assert r["findings"] == []


def test_misclosure_is_a_finding():
    calls = square()
    calls[1]["distance"] = "660.50"
    r = traverse(calls)
    assert qval(r["closure_error"]) == pytest.approx(0.5, abs=1e-3)
    assert r["precision_ratio"] == "1:5281"
    assert r["findings"][0]["id"] == "PLAT-PRECISION"


def test_small_misclosure_passes():
    calls = square()
    calls[1]["distance"] = "660.10"
    r = traverse(calls)
    assert r["findings"] == []


def test_feature_with_pob_has_same_area():
    from shapely.geometry import shape

    from cr_site.geo import Frame, acres

    f = to_feature(traverse(square()), {"lat": 34.75, "lon": -82.3})
    g = shape(f["geometry"])
    assert acres(Frame.for_geometry(g).to_m(g)) == pytest.approx(10.0, rel=1e-3)
    assert f["properties"]["confirmation_required"] is True
    ids = {h["id"] for h in f["properties"]["holds"]}
    assert {"HOLD-PLAT-BEARINGS", "HOLD-PLAT-GRID"} <= ids


def test_feature_without_pob_is_a_hold():
    f = to_feature(traverse(square()), None)
    assert "HOLD-PLAT-POB" in {h["id"] for h in f["properties"]["holds"]}


def test_too_few_calls():
    with pytest.raises(PlatError):
        traverse(square()[:2])
