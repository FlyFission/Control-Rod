"""Site constraints screen from public GIS services.

Every fact carries its source, URL, query, retrieval time and the SHA-256 of the response it
came from. A failed or empty query becomes a hold; no value is ever filled in by guesswork.
Distances and areas are measured in the parcel's UTM frame.
"""

from __future__ import annotations

import hashlib
import math
from typing import Any

from shapely.geometry import LineString, MultiLineString, Point, Polygon, box, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import nearest_points, unary_union

from .fetch import Fetcher, public_citation
from .geo import Frame, acres, ft, qty
from .sources import SOURCES

SFHA_ZONES = {"A", "AE", "AH", "AO", "AR", "A99", "V", "VE"}
DEFAULT_RADIUS_MI = 5.0
GRID_MAX_SIDE = 7  # elevation grid points per side, inside the parcel
M_PER_MI = 1609.344


def _esri_geom(g: dict) -> BaseGeometry | None:
    if g is None:
        return None
    if "x" in g and "y" in g:
        return Point(g["x"], g["y"])
    if "paths" in g:
        return MultiLineString([LineString(p) for p in g["paths"] if len(p) > 1])
    if "rings" in g:
        return unary_union([Polygon(r) for r in g["rings"] if len(r) > 3])
    return None


def features(data: dict | None) -> list[tuple[BaseGeometry, dict]]:
    """Reads either GeoJSON or Esri JSON features into (geometry, attributes) pairs."""
    out = []
    for f in (data or {}).get("features") or []:
        if "geometry" in f and isinstance(f.get("geometry"), dict) and "type" in f["geometry"]:
            geom = shape(f["geometry"])
            attrs = f.get("properties") or {}
        else:
            geom = _esri_geom(f.get("geometry"))
            attrs = f.get("attributes") or {}
        if geom is not None and not geom.is_empty:
            out.append((geom, attrs))
    return out


def _truncated(data: dict) -> bool:
    """ArcGIS sets exceededTransferLimit when a query returns only the first page."""
    props = data.get("properties") or {}
    return bool(data.get("exceededTransferLimit") or props.get("exceededTransferLimit"))


def _envelope(geom_ll: BaseGeometry) -> str:
    minx, miny, maxx, maxy = geom_ll.bounds
    return f"{minx:.7f},{miny:.7f},{maxx:.7f},{maxy:.7f}"


def _query_params(geom_ll: BaseGeometry, out_fields: str, fmt: str = "geojson") -> dict:
    return {
        "geometry": _envelope(geom_ll),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": out_fields,
        "returnGeometry": "true",
        "outSR": "4326",
        "f": fmt,
    }


def _pick(attrs: dict, *names: str) -> Any:
    low = {k.lower(): v for k, v in attrs.items()}
    for n in names:
        if n.lower() in low and low[n.lower()] not in (None, "", " "):
            return low[n.lower()]
    return None


class Screen:
    def __init__(self, parcel: dict, fetcher: Fetcher, radius_mi: float) -> None:
        geom = shape(parcel["geometry"])
        if geom.geom_type not in ("Polygon", "MultiPolygon"):
            raise ValueError("constraints need a parcel boundary; resolve the parcel first")
        self.parcel_ll = geom
        self.frame = Frame.for_geometry(geom)
        self.parcel_m = self.frame.to_m(geom)
        self.fetcher = fetcher
        self.radius_m = radius_mi * M_PER_MI
        self.radius_mi = radius_mi
        self.facts: list[dict] = []
        self.holds: list[dict] = []
        self.exclusions: dict[str, BaseGeometry] = {}
        self.nearest: dict[str, dict] = {}
        self.elevation: dict | None = None
        self._n = 0

    def fact(self, topic: str, text: str, cite: dict, value: dict | None = None, **extra) -> None:
        self._n += 1
        f = {
            "id": f"F-{self._n:03d}",
            "topic": topic,
            "text": text,
            "source": public_citation(cite),
        }
        if value is not None:
            f["value"] = value
        f.update(extra)
        self.facts.append(f)

    def hold(self, topic: str, text: str, cite: dict | None = None) -> None:
        h = {"id": f"HOLD-{topic.upper()}-{len(self.holds) + 1}", "topic": topic, "text": text}
        if cite is not None:
            h["source"] = public_citation(cite)
            if "error" in cite:
                h["error"] = cite["error"]
        self.holds.append(h)

    def search_area_ll(self) -> BaseGeometry:
        return self.frame.to_ll(self.parcel_m.buffer(self.radius_m))

    # Polygon overlays ------------------------------------------------------------------
    def _overlay(self, key: str, topic: str, out_fields: str, classify) -> None:
        s = SOURCES[key]
        data, cite = self.fetcher.get_json(
            s["name"], s["url"], _query_params(self.parcel_ll, out_fields)
        )
        if data is None:
            self.hold(topic, f"{s['name']} query failed; {topic} not screened", cite)
            return
        if _truncated(data):
            self.hold(topic, f"{s['name']} hit its record limit; {topic} screen incomplete", cite)
            return
        hits = []
        for geom, attrs in features(data):
            part = self.frame.to_m(geom).intersection(self.parcel_m)
            if part.is_empty or part.area <= 0:
                continue
            label, exclude = classify(attrs)
            hits.append((label, exclude, part))
        total = self.parcel_m.area
        if not hits:
            self.fact(topic, f"No mapped {topic} intersects the parcel", cite, qty(0, "acre", 3))
            return
        by_label: dict[str, list] = {}
        excl = []
        for label, exclude, part in hits:
            by_label.setdefault(label, []).append(part)
            if exclude:
                excl.append(part)
        for label, parts in sorted(by_label.items()):
            area = unary_union(parts)
            self.fact(
                topic,
                f"{label} covers {acres(area):.3f} acres "
                f"({100 * area.area / total:.1f}% of the parcel)",
                cite,
                qty(acres(area), "acre", 3),
                label=label,
            )
        if excl:
            self.exclusions[topic] = unary_union(excl)

    def flood(self) -> None:
        def cls(a):
            z = str(_pick(a, "FLD_ZONE") or "UNKNOWN").strip().upper()
            sub = _pick(a, "ZONE_SUBTY")
            label = f"Flood zone {z}" + (f" ({sub})" if sub else "")
            return label, z in SFHA_ZONES

        self._overlay("fema_nfhl", "flood", "FLD_ZONE,ZONE_SUBTY,SFHA_TF", cls)

    def wetlands(self) -> None:
        def cls(a):
            t = _pick(a, "WETLAND_TYPE", "Wetland_Type") or "Wetland"
            code = _pick(a, "ATTRIBUTE")
            return (f"{t}" + (f" ({code})" if code else "")), True

        self._overlay("usfws_nwi", "wetlands", "*", cls)

    # Elevation and slope ---------------------------------------------------------------
    def elevation_grid(self) -> None:
        s = SOURCES["usgs_epqs"]
        minx, miny, maxx, maxy = self.parcel_m.bounds
        side = max(maxx - minx, maxy - miny)
        spacing = side / (GRID_MAX_SIDE - 1)
        pts = []
        i = 0
        while minx + i * spacing <= maxx + 1e-6:
            j = 0
            while miny + j * spacing <= maxy + 1e-6:
                p = Point(minx + i * spacing, miny + j * spacing)
                if self.parcel_m.buffer(1e-6).contains(p):
                    pts.append((i, j, p))
                j += 1
            i += 1
        if len(pts) < 3:
            self.hold("slope", "Parcel too small for the elevation grid; slope not screened")
            return
        grid = {}
        cites = []
        for i, j, p in pts:
            ll = self.frame.to_ll(p)
            params = {
                "x": f"{ll.x:.7f}",
                "y": f"{ll.y:.7f}",
                "wkid": "4326",
                "units": "Feet",
                "includeDate": "false",
            }
            data, cite = self.fetcher.get_json(s["name"], s["url"], params)
            cites.append(public_citation(cite))
            try:
                z = float((data or {})["value"])
            except (KeyError, TypeError, ValueError):
                z = math.nan
            if not math.isfinite(z) or z < -1000:
                self.hold("slope", f"No elevation returned at {ll.y:.6f}, {ll.x:.6f}", cite)
                return
            grid[(i, j)] = {
                "x_m": round(p.x, 3),
                "y_m": round(p.y, 3),
                "lon": round(ll.x, 7),
                "lat": round(ll.y, 7),
                "elev_ft": z,
            }
        slopes = []
        for (i, j), g in grid.items():
            for di, dj in ((1, 0), (0, 1)):
                n = grid.get((i + di, j + dj))
                if n:
                    slopes.append(100 * abs(n["elev_ft"] - g["elev_ft"]) / ft(spacing))
        elevs = [g["elev_ft"] for g in grid.values()]
        cite0 = {
            "source": s["name"],
            "url": s["url"],
            "query": {"points": len(grid), "grid_spacing_m": round(spacing, 3)},
            "retrieved_at": cites[0]["retrieved_at"],
        }
        cite0["sha256"] = hashlib.sha256(
            "".join(c.get("sha256", "") for c in cites).encode()
        ).hexdigest()
        self.fact(
            "elevation",
            f"Elevation ranges {min(elevs):.1f} to {max(elevs):.1f} ft "
            f"over {len(grid)} grid points",
            cite0,
            qty(max(elevs) - min(elevs), "ft", 1),
            min=qty(min(elevs), "ft", 1),
            max=qty(max(elevs), "ft", 1),
        )
        if slopes:
            self.fact(
                "slope",
                f"Grid slope between neighbouring points: mean "
                f"{sum(slopes) / len(slopes):.1f}%, max {max(slopes):.1f}% at "
                f"{ft(spacing):.0f} ft spacing",
                cite0,
                qty(max(slopes), "%", 1),
                mean=qty(sum(slopes) / len(slopes), "%", 1),
            )
        self.elevation = {
            "frame": self.frame.epsg,
            "spacing_m": round(spacing, 3),
            "points": [dict(k=list(k), **v) for k, v in sorted(grid.items())],
            "point_citations": cites,
        }

    # Nearest infrastructure ------------------------------------------------------------
    def _nearest(self, key: str, topic: str, url: str, out_fields: str, fmt: str, describe) -> None:
        s = SOURCES[key]
        area = self.search_area_ll()
        data, cite = self.fetcher.get_json(s["name"], url, _query_params(area, out_fields, fmt))
        if data is None:
            self.hold(topic, f"{s['name']} query failed; nearest {topic} not screened", cite)
            return
        if _truncated(data):
            self.hold(topic, f"{s['name']} hit its record limit; nearest {topic} not certain", cite)
            return
        best = None
        for geom, attrs in features(data):
            gm = self.frame.to_m(geom)
            d = gm.distance(self.parcel_m)
            if best is None or d < best[0]:
                best = (d, gm, attrs)
        if best is None or best[0] > self.radius_m:
            self.fact(topic, f"No mapped {topic} within {self.radius_mi:g} mi of the parcel", cite)
            return
        d, gm, attrs = best
        on_parcel, on_feature = nearest_points(self.parcel_m, gm)
        desc = describe(attrs)
        self.fact(
            topic,
            f"Nearest {topic}: {desc}, "
            + (
                "crosses or touches the parcel"
                if d < 0.5
                else f"{ft(d):,.0f} ft ({d / M_PER_MI:.2f} mi) from the parcel boundary"
            ),
            cite,
            qty(ft(d), "ft", 0),
            feature=desc,
        )
        self.nearest[topic] = {
            "distance": qty(ft(d), "ft", 0),
            "description": desc,
            "point_on_feature_ll": list(self.frame.to_ll(on_feature).coords[0]),
            "point_on_parcel_ll": list(self.frame.to_ll(on_parcel).coords[0]),
        }

    def transmission(self) -> None:
        def d(a):
            v = _pick(a, "voltage", "VOLTAGE")
            o = _pick(a, "owner", "OWNER") or "owner not mapped"
            vt = "voltage not mapped" if v in (None, -999999) else f"{v:g} kV"
            ends = [
                e
                for e in (_pick(a, "sub_1", "SUB_1"), _pick(a, "sub_2", "SUB_2"))
                if e and not str(e).upper().startswith(("NOT AVAILABLE", "UNKNOWN"))
            ]
            return f"{vt} line, {o}" + (f", between {' and '.join(ends)}" if ends else "")

        s = SOURCES["hifld_transmission"]
        self._nearest(
            "hifld_transmission",
            "transmission line",
            s["url"],
            "voltage,owner,status,sub_1,sub_2",
            "geojson",
            d,
        )

    def substations(self) -> None:
        # No national substation layer could be verified: the public HIFLD substation service
        # found on 2026-10-22 held 128 features in one region, so an empty answer from it would
        # be a false "none nearby". The nearest transmission line names its end substations.
        self.hold(
            "substation",
            "Substations not screened: no verified national substation source; see the end "
            "substations named on the nearest transmission line, and confirm with the utility",
        )

    def gas(self) -> None:
        def d(a):
            op = _pick(a, "Operator", "OPERATOR") or "operator not mapped"
            t = _pick(a, "TYPEPIPE", "TypePipe")
            return f"{op}" + (f" ({t})" if t else "")

        s = SOURCES["eia_gas_pipelines"]
        self._nearest("eia_gas_pipelines", "gas pipeline", s["url"], "*", "geojson", d)

    def roads(self) -> None:
        s = SOURCES["census_roads"]
        found = []
        truncated = False
        for name, layer in s["layers"].items():
            url = f"{s['url']}/{layer}/query"
            data, cite = self.fetcher.get_json(
                s["name"], url, _query_params(self.search_area_ll(), "NAME,MTFCC")
            )
            if data is None:
                self.hold("road", f"TIGERweb {name} roads query failed", cite)
                continue
            if _truncated(data):
                # A first page only: the nearest road could be on a page not returned.
                self.hold(
                    "road",
                    f"TIGERweb {name} roads hit its record limit; nearest road not certain",
                    cite,
                )
                truncated = True
                continue
            for geom, attrs in features(data):
                gm = self.frame.to_m(geom)
                found.append((gm.distance(self.parcel_m), gm, attrs, cite, name))
        if truncated:
            return
        if not found:
            if not any(h["topic"] == "road" for h in self.holds):
                self.hold(
                    "road", f"No mapped road within {self.radius_mi:g} mi; access not screened"
                )
            return
        d, gm, attrs, cite, cls = min(found, key=lambda t: t[0])
        on_parcel, on_road = nearest_points(self.parcel_m, gm)
        name = _pick(attrs, "NAME") or "unnamed road"
        self.fact(
            "road",
            f"Nearest public road: {name} ({cls}), "
            + ("crosses or touches the parcel" if d < 0.5 else f"{ft(d):,.0f} ft from the parcel"),
            cite,
            qty(ft(d), "ft", 0),
            feature=name,
        )
        self.nearest["road"] = {
            "distance": qty(ft(d), "ft", 0),
            "description": name,
            "point_on_feature_ll": list(self.frame.to_ll(on_road).coords[0]),
            "point_on_parcel_ll": list(self.frame.to_ll(on_parcel).coords[0]),
        }

    def soils(self) -> None:
        self.hold(
            "soils",
            "Soils not screened: the NRCS Soil Data Access request format is not "
            "yet verified; pull the Web Soil Survey report for the parcel",
        )

    def run(self) -> dict:
        self.flood()
        self.wetlands()
        self.elevation_grid()
        self.transmission()
        self.substations()
        self.gas()
        self.roads()
        self.soils()
        return {
            "measured_in": self.frame.epsg,
            "search_radius": qty(self.radius_mi, "mi", 2),
            "facts": self.facts,
            "holds": self.holds,
            "exclusions": {k: mapping(self.frame.to_ll(v)) for k, v in self.exclusions.items()},
            "nearest": self.nearest,
            "elevation": self.elevation,
            "queries": [
                public_citation(c) | ({"error": c["error"]} if "error" in c else {})
                for c in self.fetcher.log
            ],
        }


def screen(
    parcel: dict, fetcher: Fetcher | None = None, radius_mi: float = DEFAULT_RADIUS_MI
) -> dict:
    return Screen(parcel, fetcher or Fetcher(), radius_mi).run()


def search_box(parcel: dict, radius_mi: float) -> Polygon:
    """Exposed for tests: the lon/lat envelope used for nearest-feature queries."""
    s = Screen(parcel, Fetcher(transport=lambda *_: b"{}"), radius_mi)
    return box(*s.search_area_ll().bounds)
