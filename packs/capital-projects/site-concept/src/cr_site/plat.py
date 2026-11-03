"""Plat traverse: bearings and distances to a closed boundary, with closure and precision.

An agent reads the calls off a plat; this module does all the arithmetic. Precision worse
than 1:10,000 is reported as a finding. The basis of bearings (record, grid or magnetic) is
always a hold until a person confirms it.
"""

from __future__ import annotations

import math
import re

from shapely.geometry import Polygon

from .geo import FT2_PER_ACRE, M_PER_FT, Frame, qty

PRECISION_LIMIT = 10_000

_BEARING = re.compile(
    r"^\s*([NS])\s*(\d+(?:\.\d+)?)\s*(?:[°d]\s*)?(?:(\d+(?:\.\d+)?)\s*['m]\s*)?"
    r"(?:(\d+(?:\.\d+)?)\s*(?:\"|''|s)\s*)?([EW])\s*$",
    re.IGNORECASE,
)


class PlatError(ValueError):
    pass


def azimuth_deg(bearing: str) -> float:
    """Quadrant bearing such as N 45°30'15" E to an azimuth in degrees clockwise from north."""
    m = _BEARING.match(bearing.replace("º", "°"))
    if not m:
        raise PlatError(f"cannot read bearing {bearing!r}")
    ns, d, mi, s, ew = m.groups()
    angle = float(d) + float(mi or 0) / 60 + float(s or 0) / 3600
    if angle > 90:
        raise PlatError(f"quadrant bearing over 90 degrees: {bearing!r}")
    ns, ew = ns.upper(), ew.upper()
    if ns == "N" and ew == "E":
        return angle
    if ns == "S" and ew == "E":
        return 180 - angle
    if ns == "S" and ew == "W":
        return 180 + angle
    return (360 - angle) % 360


def traverse(calls: list[dict]) -> dict:
    """Runs the traverse in feet from the point of beginning at (0, 0).

    Each call has `distance` (decimal string, feet) and either `bearing` (quadrant) or
    `azimuth` (degrees). Returns raw points, closure, precision, and compass-rule adjusted
    points and area.
    """
    if len(calls) < 3:
        raise PlatError("a closed boundary needs at least three calls")
    pts = [(0.0, 0.0)]
    legs = []
    for i, c in enumerate(calls, 1):
        dist = float(str(c["distance"]))
        if dist <= 0:
            raise PlatError(f"call {i}: distance must be positive")
        az = float(str(c["azimuth"])) if "azimuth" in c else azimuth_deg(c["bearing"])
        de = dist * math.sin(math.radians(az))
        dn = dist * math.cos(math.radians(az))
        legs.append((dist, de, dn))
        x, y = pts[-1]
        pts.append((x + de, y + dn))
    perimeter = sum(d for d, _, _ in legs)
    err_e, err_n = pts[-1]
    closure = math.hypot(err_e, err_n)
    if closure < 1e-9:  # below floating-point noise for any real traverse
        closure = 0.0
    precision = math.inf if closure == 0 else perimeter / closure
    # Compass (Bowditch) rule: distribute the misclosure in proportion to leg length.
    adj = [(0.0, 0.0)]
    run = 0.0
    for dist, de, dn in legs:
        run += dist
        x, y = adj[-1]
        adj.append((x + de - err_e * dist / perimeter, y + dn - err_n * dist / perimeter))
    poly = Polygon(adj[:-1])
    if not poly.is_valid:
        raise PlatError("the adjusted boundary crosses itself; check the calls")
    findings = []
    if precision < PRECISION_LIMIT:
        findings.append(
            {
                "id": "PLAT-PRECISION",
                "severity": "major",
                "text": f"traverse precision 1:{precision:,.0f} is worse than "
                f"1:{PRECISION_LIMIT:,}",
            }
        )
    return {
        "raw_points_ft": pts,
        "adjusted_points_ft": adj,
        "perimeter": qty(perimeter, "ft", 2),
        "closure_error": qty(closure, "ft", 3),
        "precision_ratio": "1:inf" if math.isinf(precision) else f"1:{precision:.0f}",
        "area": qty(poly.area / FT2_PER_ACRE, "acre", 3),
        "area_ft2": qty(poly.area, "ft2", 0),
        "findings": findings,
        "polygon_ft": poly,
    }


def to_feature(result: dict, pob: dict | None) -> dict:
    """GeoJSON Feature for the adjusted boundary. Without a tied point of beginning the
    boundary stays in local feet and cannot be placed on a map."""
    poly_ft: Polygon = result["polygon_ft"]
    props = {k: v for k, v in result.items() if k not in ("polygon_ft",)}
    props["derivation"] = "inferred-from-plat"
    props["confirmation_required"] = True
    holds = [
        {
            "id": "HOLD-PLAT-BEARINGS",
            "text": "Basis of bearings (record, grid or magnetic) must be confirmed against "
            "the plat",
        }
    ]
    if pob is None:
        holds.append(
            {
                "id": "HOLD-PLAT-POB",
                "text": "Point of beginning is not tied to coordinates; give pob lat and lon",
            }
        )
        props["holds"] = holds
        coords = [[x, y] for x, y in poly_ft.exterior.coords]
        return {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [coords]},
            "properties": {**props, "crs": "local feet from point of beginning"},
        }
    frame = Frame(float(pob["lon"]), float(pob["lat"]))
    ox, oy = frame._fwd.transform(float(pob["lon"]), float(pob["lat"]))
    ring_m = [(ox + x * M_PER_FT, oy + y * M_PER_FT) for x, y in poly_ft.exterior.coords]
    ll = frame.to_ll(Polygon(ring_m))
    props["holds"] = holds + [
        {
            "id": "HOLD-PLAT-GRID",
            "text": f"Bearings were applied as grid bearings in {frame.epsg}; confirm or rotate",
        }
    ]
    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [[list(c) for c in ll.exterior.coords]]},
        "properties": props,
    }
