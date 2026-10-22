"""Parcel resolution: whatever the person hands over becomes one boundary with its provenance.

Supported inputs: GeoJSON, KML, KMZ, zipped shapefile, WKT, "lat,lon" or "lat lon",
a street address, and a county parcel ID such as "Greenville County SC 0123456789".
A plat or survey PDF is read by an agent into calls for `cr-site plat closure`.
Only a boundary taken directly from a supplied geometry counts as exact; everything
else needs a person to confirm it before anything is built on it.
"""

from __future__ import annotations

import io
import json
import re
import xml.etree.ElementTree as ET  # noqa: S405 - parses a local file the user supplied
import zipfile
from importlib import resources
from pathlib import Path

import shapefile
import yaml
from shapely import wkt
from shapely.geometry import MultiPolygon, Point, Polygon, box, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from .fetch import Fetcher, public_citation
from .geo import M2_PER_ACRE, Frame, acres, qty
from .sources import SOURCES

_LATLON = re.compile(r"^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$")
_COUNTY = re.compile(
    r"^\s*(?P<county>[A-Za-z .'-]+?)\s+county\s*,?\s*(?P<state>[A-Za-z]{2})\s*[,:#]?\s*"
    r"(?:parcel|pin|tms|apn)?\s*[#:]?\s*(?P<pid>[0-9A-Za-z.\-]+)\s*$",
    re.IGNORECASE,
)


class ParcelError(ValueError):
    pass


def _polygons(geom: BaseGeometry) -> BaseGeometry:
    if isinstance(geom, Polygon | MultiPolygon):
        return geom
    polys = [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon | MultiPolygon)]
    if not polys:
        raise ParcelError(f"input holds no polygon (found {geom.geom_type})")
    return unary_union(polys)


def from_geojson(obj: dict) -> BaseGeometry:
    t = obj.get("type")
    if t == "FeatureCollection":
        return _polygons(unary_union([shape(f["geometry"]) for f in obj["features"]]))
    if t == "Feature":
        return _polygons(shape(obj["geometry"]))
    return _polygons(shape(obj))


def _coords(text: str) -> list[tuple[float, float]]:
    out = []
    for tok in text.split():
        parts = tok.split(",")
        out.append((float(parts[0]), float(parts[1])))
    return out


def from_kml(data: bytes) -> BaseGeometry:
    root = ET.fromstring(data)  # noqa: S314 - local file the user supplied
    polys = []
    for el in root.iter():
        if el.tag.split("}")[-1] != "Polygon":
            continue
        outer, holes = None, []
        for b in el:
            name = b.tag.split("}")[-1]
            ring = next((c for c in b.iter() if c.tag.split("}")[-1] == "coordinates"), None)
            if ring is None or not (ring.text or "").strip():
                continue
            if name == "outerBoundaryIs":
                outer = _coords(ring.text)
            elif name == "innerBoundaryIs":
                holes.append(_coords(ring.text))
        if outer:
            polys.append(Polygon(outer, holes))
    if not polys:
        raise ParcelError("KML holds no Polygon")
    return unary_union(polys)


def from_kmz(data: bytes) -> BaseGeometry:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        name = next((n for n in z.namelist() if n.lower().endswith(".kml")), None)
        if name is None:
            raise ParcelError("KMZ holds no .kml file")
        return from_kml(z.read(name))


def from_shapefile_zip(data: bytes) -> BaseGeometry:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = {Path(n).suffix.lower(): n for n in z.namelist()}
        if ".shp" not in names:
            raise ParcelError("zip holds no .shp file")
        if ".prj" in names:
            prj = z.read(names[".prj"]).decode("utf-8", "replace")
            if "GCS_WGS_1984" not in prj and "WGS 84" not in prj and "WGS_1984" not in prj:
                raise ParcelError(
                    "shapefile is not in WGS 84 longitude and latitude; reproject it first "
                    f"(projection: {prj[:80]})"
                )
        r = shapefile.Reader(
            shp=io.BytesIO(z.read(names[".shp"])),
            shx=io.BytesIO(z.read(names[".shx"])) if ".shx" in names else None,
            dbf=io.BytesIO(z.read(names[".dbf"])) if ".dbf" in names else None,
        )
        return _polygons(unary_union([shape(s.__geo_interface__) for s in r.shapes()]))


def load_registry() -> dict:
    text = resources.files("cr_site").joinpath("data/county_registry.yaml").read_text()
    return yaml.safe_load(text) or {}


def _feature(geom_ll: BaseGeometry, props: dict) -> dict:
    frame = Frame.for_geometry(geom_ll)
    gm = frame.to_m(geom_ll)
    c = geom_ll.centroid
    minx, miny, maxx, maxy = geom_ll.bounds
    props = {
        **props,
        "area": qty(acres(gm), "acre", 3),
        "centroid": [round(c.x, 7), round(c.y, 7)],
        "bbox": [round(minx, 7), round(miny, 7), round(maxx, 7), round(maxy, 7)],
        "measured_in": frame.epsg,
    }
    props.setdefault("holds", [])
    return {
        "type": "Feature",
        "geometry": json.loads(json.dumps(geom_ll.__geo_interface__)),
        "properties": props,
    }


def square_around(lon: float, lat: float, area_acres: float) -> BaseGeometry:
    frame = Frame(lon, lat)
    p = frame.to_m(Point(lon, lat))
    half = (area_acres * M2_PER_ACRE) ** 0.5 / 2
    return frame.to_ll(box(p.x - half, p.y - half, p.x + half, p.y + half))


def resolve(inp: str, *, acres_hint: float | None = None, fetcher: Fetcher | None = None) -> dict:
    """Resolves any supported input to a GeoJSON Feature with provenance and holds."""
    fetcher = fetcher or Fetcher()
    path = Path(inp)
    if len(inp) < 4096 and path.exists() and path.is_file():
        data = path.read_bytes()
        suffix = path.suffix.lower()
        src = {"kind": "file", "name": path.name}
        if suffix in (".geojson", ".json"):
            geom = from_geojson(json.loads(data))
            return _feature(
                geom,
                {
                    "input_kind": "geojson",
                    "derivation": "exact",
                    "confirmation_required": False,
                    "sources": [src],
                },
            )
        if suffix == ".kml":
            return _feature(
                from_kml(data),
                {
                    "input_kind": "kml",
                    "derivation": "exact",
                    "confirmation_required": False,
                    "sources": [src],
                },
            )
        if suffix == ".kmz":
            return _feature(
                from_kmz(data),
                {
                    "input_kind": "kmz",
                    "derivation": "exact",
                    "confirmation_required": False,
                    "sources": [src],
                },
            )
        if suffix == ".zip":
            return _feature(
                from_shapefile_zip(data),
                {
                    "input_kind": "shapefile",
                    "derivation": "exact",
                    "confirmation_required": False,
                    "sources": [src],
                },
            )
        if suffix == ".pdf":
            raise ParcelError(
                "a plat or survey PDF is read by an agent: write its calls to calls.json and "
                "run `cr-site plat closure --calls calls.json --pob LAT,LON`"
            )
        inp = data.decode("utf-8", "replace")
    text = inp.strip()
    if text.upper().startswith(("POLYGON", "MULTIPOLYGON")):
        return _feature(
            _polygons(wkt.loads(text)),
            {
                "input_kind": "wkt",
                "derivation": "exact",
                "confirmation_required": False,
                "sources": [{"kind": "text"}],
            },
        )
    if text.startswith("{"):
        return _feature(
            from_geojson(json.loads(text)),
            {
                "input_kind": "geojson",
                "derivation": "exact",
                "confirmation_required": False,
                "sources": [{"kind": "text"}],
            },
        )
    m = _LATLON.match(text)
    if m:
        lat, lon = float(m.group(1)), float(m.group(2))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ParcelError("coordinates out of range; give latitude first, then longitude")
        return _from_point(lon, lat, "coordinates", [{"kind": "text", "value": text}], acres_hint)
    m = _COUNTY.match(text)
    if m:
        return _from_county(
            m.group("county").strip(), m.group("state").upper(), m.group("pid"), fetcher
        )
    return _from_address(text, fetcher, acres_hint)


def _from_point(lon: float, lat: float, kind: str, sources: list, acres_hint: float | None) -> dict:
    if acres_hint is None:
        feat = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "input_kind": kind,
                "derivation": "approximate-from-point",
                "confirmation_required": True,
                "sources": sources,
                "holds": [
                    {
                        "id": "HOLD-PARCEL-ACRES",
                        "text": "Only a point is known; give the parcel acreage or boundary",
                    }
                ],
            },
        }
        return feat
    return _feature(
        square_around(lon, lat, acres_hint),
        {
            "input_kind": kind,
            "derivation": "approximate-from-point",
            "confirmation_required": True,
            "sources": sources,
            "holds": [
                {
                    "id": "HOLD-PARCEL-BOUNDARY",
                    "text": f"Boundary is a {acres_hint:g}-acre square around the point; "
                    "confirm or replace with the real boundary",
                }
            ],
        },
    )


def _from_address(text: str, fetcher: Fetcher, acres_hint: float | None) -> dict:
    s = SOURCES["census_geocoder"]
    data, cite = fetcher.get_json(s["name"], s["url"], {**s["params"], "address": text})
    matches = (((data or {}).get("result") or {}).get("addressMatches")) or []
    if not matches:
        reason = cite.get("error", "no address match")
        raise ParcelError(
            f"address could not be geocoded ({reason}); give coordinates or a boundary"
        )
    best = matches[0]
    lon, lat = float(best["coordinates"]["x"]), float(best["coordinates"]["y"])
    src = {**public_citation(cite), "matched_address": best.get("matchedAddress", "")}
    feat = _from_point(lon, lat, "address", [src], acres_hint)
    feat["properties"]["holds"].append(
        {
            "id": "HOLD-PARCEL-GEOCODE",
            "text": "Address was geocoded to a point; confirm it lies on the intended parcel",
        }
    )
    return feat


def _from_county(county: str, state: str, pid: str, fetcher: Fetcher) -> dict:
    reg = load_registry().get("counties") or {}
    key = f"{county.lower()} county, {state.lower()}"
    entry = reg.get(key)
    if entry is None:
        raise ParcelError(
            f"no parcel service registered for {county} County, {state}. Add one to "
            "cr_site/data/county_registry.yaml (see the file header), or supply a boundary file"
        )
    field = entry["id_field"]
    if not re.fullmatch(r"[0-9A-Za-z.\-]+", pid):
        raise ParcelError("parcel ID may hold only letters, digits, dots and hyphens")
    params = {
        "where": f"{field}='{pid}'",
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "geojson",
    }
    data, cite = fetcher.get_json(entry["name"], entry["url"], params)
    feats = (data or {}).get("features") or []
    if not feats:
        raise ParcelError(
            f"county service returned no parcel {pid} ({cite.get('error', 'no match')})"
        )
    geom = from_geojson({"type": "FeatureCollection", "features": feats})
    return _feature(
        geom,
        {
            "input_kind": "county-parcel-id",
            "derivation": "inferred-from-county",
            "confirmation_required": True,
            "parcel_id": pid,
            "sources": [public_citation(cite)],
            "holds": [
                {
                    "id": "HOLD-PARCEL-COUNTY",
                    "text": "County GIS boundaries are not surveys; confirm before design",
                }
            ],
        },
    )
