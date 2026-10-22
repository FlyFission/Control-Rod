"""Deterministic concept layout: program blocks placed as rectangles inside the buildable area.

Buildable area = parcel, minus the property setback, minus SFHA flood zones and mapped
wetlands, minus elevation-grid cells steeper than the program's slope limit. Blocks are placed
largest first at the first position (closest to the access point) where they fit with the
required spacing. A block whose size is null is never placed; it is listed as a hold.
"""

from __future__ import annotations

import numpy as np
import shapely
from shapely.geometry import LineString, Point, box, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import nearest_points, unary_union

from .geo import FT2_PER_ACRE, Frame, ft, m, qty, qval

STEP_FT = 10.0  # placement search grid; a search setting, not a design value


class LayoutError(ValueError):
    pass


def _param(program: dict, name: str) -> dict | None:
    return (program.get("parameters") or {}).get(name)


def parameter_status(program: dict) -> list[dict]:
    """Every program value with its status, for the notes column and the pre-check."""
    out = []
    for name, p in (program.get("parameters") or {}).items():
        out.append({"name": name, **p})
    for b in program.get("blocks") or []:
        for k in ("count", "width", "depth"):
            out.append({"name": f"{b['id']}.{k}", **b[k]})
    return out


def _steep_cells(constraints: dict, frame: Frame, limit_pct: float) -> BaseGeometry | None:
    el = constraints.get("elevation")
    if not el:
        return None
    if el.get("frame") != frame.epsg:
        raise LayoutError("elevation grid was measured in a different frame")
    s = float(el["spacing_m"])
    pts = {tuple(p["k"]): p for p in el["points"]}
    cells = []
    for (i, j), p in pts.items():
        worst = 0.0
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = pts.get((i + di, j + dj))
            if n:
                worst = max(worst, 100 * abs(n["elev_ft"] - p["elev_ft"]) / ft(s))
        if worst > limit_pct:
            cells.append(
                box(p["x_m"] - s / 2, p["y_m"] - s / 2, p["x_m"] + s / 2, p["y_m"] + s / 2)
            )
    return unary_union(cells) if cells else None


def layout(parcel: dict, constraints: dict, program: dict) -> dict:
    geom = shape(parcel["geometry"])
    if geom.geom_type not in ("Polygon", "MultiPolygon"):
        raise LayoutError("layout needs a parcel boundary")
    frame = Frame.for_geometry(geom)
    if constraints.get("measured_in") not in (None, frame.epsg):
        raise LayoutError("constraints were measured in a different frame than this parcel")
    pm = frame.to_m(geom)
    holds: list[dict] = []
    findings: list[dict] = []

    setback_ft = qval(_param(program, "property_setback"))
    if setback_ft is None:
        holds.append(
            {"id": "HOLD-SETBACK", "text": "Property setback not set; layout applies none"}
        )
        setback_ft = 0.0
    setback_line = pm.buffer(-m(setback_ft)) if setback_ft > 0 else pm
    removed = []
    for key, g in (constraints.get("exclusions") or {}).items():
        removed.append((key, frame.to_m(shape(g))))
    slope = qval(_param(program, "max_buildable_slope"))
    if slope is None:
        holds.append(
            {
                "id": "HOLD-SLOPE-LIMIT",
                "text": "Maximum buildable slope not set; steep ground not excluded",
            }
        )
    else:
        steep = _steep_cells(constraints, frame, slope)
        if steep is not None:
            removed.append(("steep", steep))
    buildable = setback_line
    for _, g in removed:
        buildable = buildable.difference(g)
    if buildable.is_empty:
        raise LayoutError("no buildable area remains after setbacks and exclusions")

    spacing_ft = qval(_param(program, "block_spacing"))
    if spacing_ft is None:
        holds.append({"id": "HOLD-SPACING", "text": "Block spacing not set; blocks may touch"})
        spacing_ft = 0.0

    entry = None
    road = (constraints.get("nearest") or {}).get("road")
    if road:
        entry = frame.to_m(Point(road["point_on_parcel_ll"]))
        road_pt = frame.to_m(Point(road["point_on_feature_ll"]))
    else:
        holds.append({"id": "HOLD-ACCESS", "text": "No road found; access point not set"})
        minx, miny, maxx, maxy = buildable.bounds
        entry = Point(minx, maxy)
        road_pt = None

    instances = []
    for b in program.get("blocks") or []:
        w, d, n = qval(b["width"]), qval(b["depth"]), qval(b["count"])
        if w is None or d is None or n is None:
            holds.append(
                {
                    "id": f"HOLD-BLOCK-{b['id'].upper()}",
                    "text": f"{b['label']}: size or count not set by the owner; not placed",
                }
            )
            continue
        if w <= 0 or d <= 0 or n < 0 or n != int(n):
            raise LayoutError(f"{b['label']}: width and depth must be positive, count whole")
        for k in range(int(n)):
            tag = f"{b['label']} {k + 1}" if n > 1 else b["label"]
            instances.append({"id": b["id"], "instance": k + 1, "label": tag, "w": w, "d": d})
    instances.sort(key=lambda x: (-(x["w"] * x["d"]), x["id"], x["instance"]))

    prepared = buildable
    shapely.prepare(prepared)
    minx, miny, maxx, maxy = buildable.bounds
    step = m(STEP_FT)
    placed: list[dict] = []
    placed_union = None
    unplaced = []
    for inst in instances:
        best = None
        for rot, (w, d) in enumerate(((inst["w"], inst["d"]), (inst["d"], inst["w"]))):
            wm, dm = m(w), m(d)
            xs = np.arange(minx, maxx - wm + 1e-9, step)
            ys = np.arange(miny, maxy - dm + 1e-9, step)
            if len(xs) == 0 or len(ys) == 0:
                continue
            gx, gy = np.meshgrid(xs, ys)
            gx, gy = gx.ravel(), gy.ravel()
            boxes = shapely.box(gx, gy, gx + wm, gy + dm)
            ok = shapely.contains(prepared, boxes)
            if placed_union is not None:
                if spacing_ft > 0:
                    ok &= shapely.distance(boxes, placed_union) >= m(spacing_ft) - 1e-6
                else:
                    ok &= ~shapely.intersects(boxes, placed_union)
            idx = np.nonzero(ok)[0]
            if len(idx) == 0:
                continue
            cx, cy = gx[idx] + wm / 2, gy[idx] + dm / 2
            dist = np.hypot(cx - entry.x, cy - entry.y)
            order = np.lexsort((gx[idx], -gy[idx], np.round(dist, 6)))
            k = idx[order[0]]
            cand = (float(np.round(dist[order[0]], 6)), rot, boxes[k])
            if best is None or cand[:2] < best[:2]:
                best = cand
        if best is None:
            unplaced.append(
                {
                    "id": inst["id"],
                    "label": inst["label"],
                    "reason": "does not fit in the remaining buildable area",
                }
            )
            findings.append(
                {
                    "id": f"LAYOUT-UNPLACED-{len(unplaced)}",
                    "severity": "major",
                    "text": f"{inst['label']} does not fit in the buildable area",
                }
            )
            continue
        _, rot, rect = best
        placed_union = rect if placed_union is None else unary_union([placed_union, rect])
        w, d = (inst["w"], inst["d"]) if rot == 0 else (inst["d"], inst["w"])
        placed.append({**inst, "rect": rect, "rotated": bool(rot), "w_ft": w, "d_ft": d})

    access = None
    width = qval(_param(program, "access_road_width"))
    if width is None:
        holds.append({"id": "HOLD-ROAD-WIDTH", "text": "Access road width not set by the owner"})
    if placed and road_pt is not None:
        target = min(placed, key=lambda p: p["rect"].distance(entry))
        _, on_block = nearest_points(entry, target["rect"].boundary)
        line = LineString([road_pt, entry, on_block])
        crossed = [k for k, g in removed if line.intersects(g)]
        for k in crossed:
            findings.append(
                {
                    "id": f"ACCESS-CROSSES-{k.upper()}",
                    "severity": "minor",
                    "text": f"Access road centreline crosses excluded ground ({k})",
                }
            )
        access = {
            "line_ll": mapping(frame.to_ll(line)),
            "length": qty(ft(line.length), "ft", 0),
            "width": qty(width, "ft", 1) if width is not None else None,
            "serves": target["label"],
        }

    def area_q(g: BaseGeometry) -> dict:
        return {
            "acres": qty(g.area / m(1) ** 2 / FT2_PER_ACRE, "acre", 3),
            "ft2": qty(g.area / m(1) ** 2, "ft2", 0),
        }

    blocks_out = []
    for p in placed:
        r = p["rect"]
        blocks_out.append(
            {
                "id": p["id"],
                "instance": p["instance"],
                "label": p["label"],
                "width": qty(p["w_ft"], "ft", 1),
                "depth": qty(p["d_ft"], "ft", 1),
                "rotated": p["rotated"],
                "polygon_ll": mapping(frame.to_ll(r)),
                "area": area_q(r),
            }
        )
    return {
        "measured_in": frame.epsg,
        "parcel_area": area_q(pm),
        "setback": qty(setback_ft, "ft", 1),
        "setback_line_ll": mapping(frame.to_ll(setback_line)),
        "buildable_ll": mapping(frame.to_ll(buildable)),
        "buildable_area": area_q(buildable),
        "excluded": [
            {
                "kind": k,
                "area": area_q(g.intersection(pm)),
                "polygon_ll": mapping(frame.to_ll(g.intersection(pm))),
            }
            for k, g in removed
        ],
        "block_spacing": qty(spacing_ft, "ft", 1),
        "blocks": blocks_out,
        "unplaced": unplaced,
        "access_road": access,
        "entry_ll": list(frame.to_ll(entry).coords[0]),
        "holds": holds,
        "findings": findings,
        "parameters": parameter_status(program),
        "search_step": qty(STEP_FT, "ft", 1),
        "rule": "deterministic: largest block first, nearest feasible position to the access "
        "point; no randomness",
    }
