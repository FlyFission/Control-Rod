"""Fixtures. No test touches the network.

The service responses here are built in the documented response shapes (GeoJSON or Esri JSON
features, Census geocoder addressMatches, EPQS `value`). They are not recordings of live
responses: live calls were not possible from the build environment. Their shapes follow
the service directory pages and documentation listed in cr_site/sources.py.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

from cr_site.fetch import Fetcher

# A rectangular test parcel near Greenville, SC: about 2000 ft east-west by 1500 ft north-south.
W, S, E, N = -82.30000, 34.75000, -82.29333, 34.75412


def parcel_geojson() -> dict:
    ring = [[W, S], [E, S], [E, N], [W, N], [W, S]]
    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [ring]},
        "properties": {"name": "test parcel"},
    }


def _fc(features: list[dict]) -> bytes:
    return json.dumps({"type": "FeatureCollection", "features": features}).encode()


def _poly(ring, **props) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [ring]},
        "properties": props,
    }


def _line(coords, **props) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": coords},
        "properties": props,
    }


def elevation(lon: float, lat: float) -> float:
    # A gentle rise to the north plus a steep drop in the south-east corner.
    z = 900.0 + (lat - S) * 20000.0
    if lon > -82.2945 and lat < 34.7512:
        z -= 60.0
    return round(z, 2)


def fixture_transport(url: str, params: dict, timeout: float) -> bytes:
    if "NFHL" in url:
        ae = [[W, S], [W + 0.0007, S], [W + 0.0007, N], [W, N], [W, S]]
        x = [[W + 0.0007, S], [E, S], [E, N], [W + 0.0007, N], [W + 0.0007, S]]
        return _fc(
            [
                _poly(ae, FLD_ZONE="AE", ZONE_SUBTY=None, SFHA_TF="T"),
                _poly(x, FLD_ZONE="X", ZONE_SUBTY="AREA OF MINIMAL FLOOD HAZARD", SFHA_TF="F"),
            ]
        )
    if "wetlandsmapservice" in url:
        wet = [
            [E - 0.0006, N - 0.0005],
            [E, N - 0.0005],
            [E, N],
            [E - 0.0006, N],
            [E - 0.0006, N - 0.0005],
        ]
        return _fc(
            [_poly(wet, WETLAND_TYPE="Freshwater Forested/Shrub Wetland", ATTRIBUTE="PFO1A")]
        )
    if "epqs" in url:
        return json.dumps(
            {
                "value": elevation(float(params["x"]), float(params["y"])),
                "location": {"x": float(params["x"]), "y": float(params["y"])},
            }
        ).encode()
    if "Energy_Transition_Atlas" in url:
        return _fc(
            [
                _line(
                    [[E + 0.009, S - 0.01], [E + 0.009, N + 0.01]],
                    voltage=115,
                    owner="EXAMPLE POWER CO",
                    sub_1="EXAMPLE SUB",
                    sub_2="NOT AVAILABLE",
                    status="IN SERVICE",
                )
            ]
        )
    if "substations" in url:
        return json.dumps(
            {
                "features": [
                    {
                        "geometry": {"x": E + 0.0095, "y": N + 0.002},
                        "attributes": {"NAME": "EXAMPLE SUB", "MAX_VOLT": 115},
                    }
                ]
            }
        ).encode()
    if "Natural_Gas_Pipelines" in url:
        return _fc(
            [
                _line(
                    [[W - 0.02, S - 0.02], [W - 0.02, N + 0.02]],
                    Operator="EXAMPLE GAS",
                    TYPEPIPE="Interstate",
                )
            ]
        )
    if "Transportation/MapServer/2" in url:
        return _fc([])
    if "Transportation/MapServer/8" in url:
        return _fc(
            [
                _line(
                    [[W - 0.003, S - 0.00015], [E + 0.003, S - 0.00015]],
                    NAME="Example Rd",
                    MTFCC="S1400",
                )
            ]
        )
    if "geocoder" in url:
        return json.dumps(
            {
                "result": {
                    "addressMatches": [
                        {
                            "matchedAddress": "1 EXAMPLE RD, GREENVILLE, SC, 29601",
                            "coordinates": {"x": (W + E) / 2, "y": (S + N) / 2},
                        }
                    ]
                }
            }
        ).encode()
    raise AssertionError(f"unexpected URL {url}")


def failing_transport(url: str, params: dict, timeout: float) -> bytes:
    raise TimeoutError("timed out")


@pytest.fixture
def fetcher() -> Fetcher:
    return Fetcher(
        transport=fixture_transport, clock=lambda: datetime(2026, 10, 22, 16, 0, tzinfo=UTC)
    )


@pytest.fixture
def parcel_file(tmp_path):
    p = tmp_path / "parcel.geojson"
    p.write_text(json.dumps(parcel_geojson()))
    return p
