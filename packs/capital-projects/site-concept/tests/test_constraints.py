import json

import pytest

from cr_site.constraints import screen
from cr_site.fetch import Fetcher
from cr_site.geo import qval
from cr_site.parcel import resolve

from .conftest import failing_transport, fixture_transport


@pytest.fixture
def parcel(parcel_file):
    return resolve(str(parcel_file))


def test_screen_facts_are_cited(parcel, fetcher):
    r = screen(parcel, fetcher=fetcher)
    topics = {f["topic"] for f in r["facts"]}
    assert {
        "flood",
        "wetlands",
        "elevation",
        "slope",
        "transmission line",
        "gas pipeline",
        "road",
    } <= topics
    for f in r["facts"]:
        assert f["source"]["sha256"]
        assert f["source"]["retrieved_at"] == "2026-10-22T16:00:00Z"
        assert f["source"]["url"].startswith("https://")
    assert set(r["exclusions"]) == {"flood", "wetlands"}
    assert [h["topic"] for h in r["holds"]] == ["substation", "soils"]


def test_flood_zone_split(parcel, fetcher):
    r = screen(parcel, fetcher=fetcher)
    flood = {f["label"]: qval(f["value"]) for f in r["facts"] if f["topic"] == "flood"}
    assert set(flood) == {"Flood zone AE", "Flood zone X (AREA OF MINIMAL FLOOD HAZARD)"}
    assert sum(flood.values()) == pytest.approx(qval(parcel["properties"]["area"]), rel=1e-3)


def test_nearest_road_and_line(parcel, fetcher):
    r = screen(parcel, fetcher=fetcher)
    road = r["nearest"]["road"]
    assert road["description"] == "Example Rd"
    assert qval(road["distance"]) == pytest.approx(54.7, abs=1.0)
    line = r["nearest"]["transmission line"]
    assert "115 kV" in line["description"]
    assert line["description"].endswith("between EXAMPLE SUB")
    assert qval(line["distance"]) > 2500


def test_failures_become_holds(parcel):
    r = screen(parcel, fetcher=Fetcher(transport=failing_transport))
    assert r["facts"] == []
    topics = {h["topic"] for h in r["holds"]}
    assert {
        "flood",
        "wetlands",
        "slope",
        "transmission line",
        "substation",
        "gas pipeline",
        "road",
        "soils",
    } <= topics
    assert all("error" in h for h in r["holds"] if h["topic"] != "soils" and "source" in h)


def test_point_parcel_is_refused(fetcher):
    with pytest.raises(ValueError, match="boundary"):
        screen(resolve("34.75 -82.3"), fetcher=fetcher)


def test_truncated_answer_is_a_hold(parcel):
    def truncated(url, params, timeout):
        if "NFHL" in url:
            return json.dumps(
                {"type": "FeatureCollection", "features": [], "exceededTransferLimit": True}
            ).encode()
        return fixture_transport(url, params, timeout)

    r = screen(parcel, fetcher=Fetcher(transport=truncated))
    assert "flood" not in {f["topic"] for f in r["facts"]}
    assert any(h["topic"] == "flood" and "record limit" in h["text"] for h in r["holds"])


def test_one_retry_recovers_a_transient_failure(parcel):
    seen = set()

    def flaky(url, params, timeout):
        if "NFHL" in url and url not in seen:
            seen.add(url)
            raise TimeoutError("first try times out")
        return fixture_transport(url, params, timeout)

    r = screen(parcel, fetcher=Fetcher(transport=flaky))
    assert "flood" in {f["topic"] for f in r["facts"]}


def test_truncated_road_query_is_a_hold_and_names_no_road(parcel_file):
    from datetime import UTC, datetime

    def transport(url, params, timeout):
        body = fixture_transport(url, params, timeout)
        if "Transportation/MapServer/8" in url:
            data = json.loads(body)
            data["exceededTransferLimit"] = True
            return json.dumps(data).encode()
        return body

    f = Fetcher(transport=transport, clock=lambda: datetime(2026, 10, 22, 16, 0, tzinfo=UTC))
    out = screen(resolve(str(parcel_file)), fetcher=f)
    assert any(h["topic"] == "road" and "record limit" in h["text"] for h in out["holds"])
    assert not any(x["topic"] == "road" for x in out["facts"])


def test_failed_local_road_layer_names_no_road(parcel_file):
    from datetime import UTC, datetime

    def transport(url, params, timeout):
        if "Transportation/MapServer/8" in url:
            return failing_transport(url, params, timeout)
        return fixture_transport(url, params, timeout)

    f = Fetcher(transport=transport, clock=lambda: datetime(2026, 10, 22, 16, 0, tzinfo=UTC))
    out = screen(resolve(str(parcel_file)), fetcher=f)
    assert any(h["topic"] == "road" and "failed" in h["text"] for h in out["holds"])
    assert not any(x["topic"] == "road" for x in out["facts"])
