"""Geometry helpers. Every measurement is made in a projected CRS, never in degrees."""

from __future__ import annotations

from decimal import ROUND_HALF_EVEN, Decimal

import shapely
from pyproj import CRS, Transformer
from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry

WGS84 = CRS.from_epsg(4326)

# Exact definitions, not engineering judgments.
M2_PER_ACRE = 4046.8564224  # international acre
M_PER_FT = 0.3048  # international foot
FT2_PER_ACRE = 43560


def utm_crs(lon: float, lat: float) -> CRS:
    """UTM zone for a point; WGS 84 datum, north or south."""
    zone = int((lon + 180) // 6) + 1
    zone = min(max(zone, 1), 60)
    return CRS.from_epsg((32600 if lat >= 0 else 32700) + zone)


class Frame:
    """A local measuring frame: WGS 84 in, UTM metres out, and back."""

    def __init__(self, lon: float, lat: float) -> None:
        self.crs = utm_crs(lon, lat)
        self._fwd = Transformer.from_crs(WGS84, self.crs, always_xy=True)
        self._inv = Transformer.from_crs(self.crs, WGS84, always_xy=True)

    @property
    def epsg(self) -> str:
        return f"EPSG:{self.crs.to_epsg()}"

    def to_m(self, geom: BaseGeometry) -> BaseGeometry:
        return shapely.transform(geom, lambda x, y: self._fwd.transform(x, y), interleaved=False)

    def to_ll(self, geom: BaseGeometry) -> BaseGeometry:
        return shapely.transform(geom, lambda x, y: self._inv.transform(x, y), interleaved=False)

    @classmethod
    def for_geometry(cls, geom_ll: BaseGeometry) -> Frame:
        c = geom_ll.centroid
        return cls(c.x, c.y)


def qty(value: float, unit: str, places: int) -> dict:
    """A Quantity record: the value is a decimal string so no precision is implied or lost."""
    q = Decimal(repr(float(value))).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_EVEN)
    return {"value": format(q, "f"), "unit": unit}


def qval(q: dict | None) -> float | None:
    """Read a Quantity or a {value, status} parameter back as a float; None stays None."""
    if q is None:
        return None
    v = q.get("value")
    return None if v is None else float(Decimal(str(v)))


def acres(geom_m: BaseGeometry) -> float:
    return geom_m.area / M2_PER_ACRE


def ft(m: float) -> float:
    return m / M_PER_FT


def m(ft_: float) -> float:
    return ft_ * M_PER_FT


def geojson(geom: BaseGeometry) -> dict:
    return mapping(geom)


def from_geojson(obj: dict) -> BaseGeometry:
    return shape(obj)
