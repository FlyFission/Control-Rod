"""Concept site plan sheet, drawn through CADCraft on the standard ANSI D template.

The drawing area holds the parcel, setback, buildable area, excluded ground, program blocks,
access road, north arrow, graphic scale and legend at a standard engineering scale. The
right-hand column carries the title block, revision block and notes, every entry built from
the parcel, constraints, layout and program records.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

from .geo import Frame

SCALES_FT_PER_IN = (50, 100, 200, 300, 400, 500, 1000)
LEGEND_BAND_IN = 2.6
PAD_IN = 0.75


def _drawings_dir() -> Path:
    for parent in Path(__file__).resolve().parents:
        cand = parent / "drawings" / "render_sheet.py"
        if cand.is_file():
            return cand.parent
        cand = parent / "packs" / "capital-projects" / "drawings" / "render_sheet.py"
        if cand.is_file():
            return cand.parent
    raise FileNotFoundError("packs/capital-projects/drawings/render_sheet.py not found")


def _render_sheet():
    d = _drawings_dir()
    spec = importlib.util.spec_from_file_location("render_sheet", d / "render_sheet.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("render_sheet", mod)
    spec.loader.exec_module(mod)
    return mod, d / "sheet-ansi-d.json"


def _rings(g: BaseGeometry) -> list[list[tuple[float, float]]]:
    polys = [g] if g.geom_type == "Polygon" else list(getattr(g, "geoms", []))
    out = []
    for p in polys:
        if p.geom_type != "Polygon" or p.is_empty:
            continue
        out.append(list(p.exterior.coords))
        out.extend(list(r.coords) for r in p.interiors)
    return out


def _fit_height(metrics, text: str, room: float, h0: float) -> float:
    """Largest text height up to h0 (down to 0.06 in) that fits the room, in inches."""
    h = h0
    while h > 0.06 and metrics.width(text, h) > room:
        h = round(h - 0.01, 3)
    return h


def _fit_label(metrics, label: str, room: float) -> list[tuple[str, float]]:
    """One line if it fits at a readable height, otherwise two lines split between words."""
    h = _fit_height(metrics, label, room, 0.12)
    words = label.split()
    if metrics.width(label, h) <= room or len(words) < 2:
        return [(label, h)]
    cut = min(
        range(1, len(words)), key=lambda i: abs(len(" ".join(words[:i])) - len(" ".join(words[i:])))
    )
    parts = [" ".join(words[:cut]), " ".join(words[cut:])]
    h = min(_fit_height(metrics, p, room, 0.12) for p in parts)
    return [(p, h) for p in parts]


def choose_scale(width_ft: float, height_ft: float, room_w_in: float, room_h_in: float) -> int:
    for s in SCALES_FT_PER_IN:
        if width_ft / s <= room_w_in and height_ft / s <= room_h_in:
            return s
    raise ValueError("site is larger than 1 inch = 1000 ft on an ANSI D sheet; split it")


def _list(items: list[str]) -> list[str]:
    return items or ["NONE."]


def build_record(
    parcel: dict, constraints: dict, layout: dict, program: dict, *, meta: dict, scale_ft: int
) -> dict:
    p = parcel["properties"]
    sources = sorted(
        {
            (c["source"], c["retrieved_at"][:10])
            for c in constraints.get("queries", [])
            if "sha256" in c
        }
    )
    inputs = [
        f"PARCEL: {p.get('input_kind', 'boundary').upper()}, "
        f"{p['derivation'].upper()}, {p['area']['value']} ACRES"
    ]
    inputs += [f"{name.upper()}, RETRIEVED {day}" for name, day in sources]
    holds = [
        h["text"].upper().rstrip(".") + "."
        for h in (p.get("holds") or [])
        + (constraints.get("holds") or [])
        + (layout.get("holds") or [])
    ]
    assumptions = []
    params = program.get("parameters") or {}
    for name, v in params.items():
        if v.get("status") == "assumption" and v.get("value") is not None:
            assumptions.append(
                f"{name.replace('_', ' ').upper()}: {v['value']} {v['unit'].upper()}"
                " (ASSUMPTION, OWNER TO CONFIRM)"
            )
    for b in program.get("blocks") or []:
        vals = [b["count"]["value"], b["width"]["value"], b["depth"]["value"]]
        if all(x is not None for x in vals) and "assumption" in {
            b[k]["status"] for k in ("count", "width", "depth")
        }:
            assumptions.append(f"{b['label']}: {vals[0]} AT {vals[1]} X {vals[2]} FT (ASSUMPTION)")
    if "EXAMPLE" in (program.get("label") or "").upper():
        assumptions.insert(0, "PROGRAM VALUES ARE EXAMPLE VALUES FOR TESTING ONLY.")
    general = [
        "CONCEPT ONLY. NOT FOR CONSTRUCTION, PERMITTING OR PURCHASE.",
        f"AREAS AND DISTANCES MEASURED IN {layout['measured_in']} (UTM), INTERNATIONAL FEET.",
        "BOUNDARY, CONSTRAINTS AND PROGRAM ARE SUBJECT TO THE HOLDS AND ASSUMPTIONS BELOW.",
    ]
    return {
        "titleBlock": {
            "PROJECT": meta["project"],
            "TITLE": meta.get("title", "CONCEPT SITE PLAN"),
            "DWGNO": meta["dwgno"],
            "REV": meta.get("rev", "A"),
            "SCALE": f"1\" = {scale_ft}'",
            "SHEET": meta.get("sheet", "1 OF 1"),
            "PREPARED": meta.get("prepared", "-"),
            "VERIFIED": meta.get("verified", "-"),
            "APPROVED": meta.get("approved", "-"),
            "STATUS": meta.get("status", "PRELIMINARY"),
        },
        "revisions": [
            {
                "REV": meta.get("rev", "A"),
                "DATE": meta["date"],
                "DESCRIPTION": meta.get("rev_description", "CONCEPT FOR OWNER REVIEW"),
                "APPR": "-",
            }
        ],
        "notes": {
            "general": general,
            "references": _list(meta.get("references", [])),
            "inputs": inputs,
            "holds": _list(holds),
            "assumptions": _list(assumptions),
            "preparation": _list(meta.get("preparation", [])),
        },
    }


def render_plan(
    cli: str,
    parcel: dict,
    constraints: dict,
    layout: dict,
    program: dict,
    meta: dict,
    out_dir: Path,
) -> dict:
    rs, tpl_path = _render_sheet()
    tpl = json.loads(tpl_path.read_text())
    geom = shape(parcel["geometry"])
    frame = Frame.for_geometry(geom)

    def to_ft(g: BaseGeometry) -> BaseGeometry:
        from shapely.affinity import scale as sc

        return sc(frame.to_m(g), 1 / 0.3048, 1 / 0.3048, origin=(0, 0))

    parcel_ft = to_ft(geom)
    extent = parcel_ft
    road = (constraints.get("nearest") or {}).get("road")
    access = layout.get("access_road")
    if access:
        extent = extent.union(to_ft(shape(access["line_ll"])))
    minx, miny, maxx, maxy = extent.bounds

    W, H, m = (float(tpl["sheet"][k]) for k in ("width", "height", "margin"))
    cx = W - m - float(tpl["rightColumn"]["width"])
    room_w = cx - m - 2 * PAD_IN
    room_h = H - 2 * m - 2 * PAD_IN - LEGEND_BAND_IN
    s = choose_scale(maxx - minx, maxy - miny, room_w, room_h)
    ox = m + PAD_IN + room_w / 2 - (minx + maxx) / 2 / s
    oy = m + PAD_IN + LEGEND_BAND_IN + room_h / 2 - (miny + maxy) / 2 / s

    def xy(x: float, y: float) -> list[float]:
        return [round(ox + x / s, 4), round(oy + y / s, 4)]

    def ring_pts(g: BaseGeometry) -> list[list[list[float]]]:
        return [[xy(x, y) for x, y in r[:-1]] for r in _rings(g)]

    record = build_record(parcel, constraints, layout, program, meta=meta, scale_ft=s)
    metrics = rs.Metrics(cli, tpl["font"])

    def draw(cad, area):
        x0, y0, x1, y1 = area
        for ltype in ("DASHED", "PHANTOM", "HIDDEN"):
            try:
                cad.ex("linetype", {"load": ltype})
            except rs.SheetError:
                pass
        layers = [
            ("C-PROP", 7, "PHANTOM", 0.5),
            ("C-SETBACK", 8, "DASHED", 0.25),
            ("C-BUILD", 3, "Continuous", 0.18),
            ("C-EXCL", 1, "Continuous", 0.18),
            ("C-BLOCK", 5, "Continuous", 0.35),
            ("C-ROAD", 30, "Continuous", 0.35),
            ("C-ANNO", 7, "Continuous", 0.18),
        ]
        for name, color, lt, lw in layers:
            try:
                cad.ex(
                    "layer.new", {"name": name, "color": color, "linetype": lt, "lineweight": lw}
                )
            except rs.SheetError:
                cad.ex("layer.new", {"name": name, "color": color, "lineweight": lw})

        def on(layer):
            cad.ex("layer.current", {"name": layer})

        on("C-PROP")
        for r in ring_pts(parcel_ft):
            cad.ex("pline", {"vertices": r, "closed": True})
        on("C-SETBACK")
        for r in ring_pts(to_ft(shape(layout["setback_line_ll"]))):
            cad.ex("pline", {"vertices": r, "closed": True})
        on("C-BUILD")
        for r in ring_pts(to_ft(shape(layout["buildable_ll"]))):
            cad.ex("pline", {"vertices": r, "closed": True})
        on("C-EXCL")
        for ex in layout.get("excluded") or []:
            kind = ex["kind"]
            part = to_ft(shape(ex["polygon_ll"])).intersection(parcel_ft)
            for r in ring_pts(part):
                h = cad.ex("pline", {"vertices": r, "closed": True})
                if isinstance(h, dict) and "handle" in h:
                    try:
                        cad.ex(
                            "hatch", {"handles": [h["handle"]], "pattern": "ANSI31", "scale": 2.0}
                        )
                    except rs.SheetError:
                        pass
            if not part.is_empty:
                c = part.representative_point()
                cad.ex(
                    "text",
                    {"at": xy(c.x, c.y), "text": kind.upper(), "height": 0.1, "justify": "MC"},
                )
        on("C-BLOCK")
        for b in layout["blocks"]:
            g = to_ft(shape(b["polygon_ll"]))
            for r in ring_pts(g):
                cad.ex("pline", {"vertices": r, "closed": True})
            c = g.centroid
            room = 0.9 * (g.bounds[2] - g.bounds[0]) / s  # block width on paper, inches
            lines = _fit_label(metrics, b["label"], room)
            lines.append(
                (
                    f"{b['area']['acres']['value']} AC",
                    _fit_height(metrics, f"{b['area']['acres']['value']} AC", room, 0.1),
                )
            )
            step = 0.18
            top = (len(lines) - 1) * step / 2
            for k, (text, h) in enumerate(lines):
                cad.ex(
                    "text",
                    {
                        "at": xy(c.x, c.y + (top - k * step) * s),
                        "text": text,
                        "height": h,
                        "justify": "MC",
                    },
                )
        on("C-ROAD")
        if access:
            line = to_ft(shape(access["line_ll"]))
            cad.ex("pline", {"vertices": [xy(x, y) for x, y in line.coords]})
            mid = line.interpolate(0.5, normalized=True)
            label = "ACCESS ROAD" + (
                f", {access['width']['value']} FT" if access.get("width") else ""
            )
            cad.ex(
                "text",
                {"at": xy(mid.x, mid.y + 0.12 * s), "text": label, "height": 0.1, "justify": "MC"},
            )
        if road:
            cad.ex(
                "text",
                {
                    "at": xy(
                        *to_ft(
                            shape({"type": "Point", "coordinates": road["point_on_feature_ll"]})
                        ).coords[0]
                    ),
                    "text": road["description"].upper(),
                    "height": 0.1,
                    "justify": "ML",
                },
            )

        on("C-ANNO")
        # Graphic scale: four one-inch segments, labelled in feet.
        bx, by = x0 + PAD_IN, y0 + 1.4
        cad.ex(
            "text",
            {"at": [bx, by + 0.45], "text": "GRAPHIC SCALE", "height": 0.14, "justify": "ML"},
        )
        cad.ex("line", {"points": [[bx, by], [bx + 4, by]]})
        for i in range(5):
            cad.ex("line", {"points": [[bx + i, by], [bx + i, by + 0.15]]})
            cad.ex(
                "text",
                {"at": [bx + i, by - 0.2], "text": f"{i * s}'", "height": 0.1, "justify": "MC"},
            )
        cad.ex(
            "text",
            {"at": [bx, by - 0.55], "text": f"SCALE: 1\" = {s}'", "height": 0.14, "justify": "ML"},
        )
        # North arrow: grid north of the measuring frame.
        nx, ny = x1 - PAD_IN - 1.2, y0 + 1.0
        cad.ex(
            "pline", {"vertices": [[nx, ny], [nx + 0.25, ny + 0.9], [nx + 0.5, ny]], "closed": True}
        )
        cad.ex("line", {"points": [[nx + 0.25, ny], [nx + 0.25, ny + 0.9]]})
        cad.ex("text", {"at": [nx + 0.25, ny + 1.15], "text": "N", "height": 0.24, "justify": "MC"})
        cad.ex(
            "text",
            {
                "at": [nx + 0.25, ny - 0.25],
                "text": f"GRID NORTH, {layout['measured_in']}",
                "height": 0.08,
                "justify": "MC",
            },
        )
        # Legend.
        lx, ly = x0 + PAD_IN + 6.0, y0 + 2.1
        cad.ex("text", {"at": [lx, ly + 0.3], "text": "LEGEND", "height": 0.14, "justify": "ML"})
        entries = [
            ("C-PROP", "PROPERTY LINE"),
            ("C-SETBACK", f"SETBACK, {layout['setback']['value']} FT"),
            ("C-BUILD", "BUILDABLE AREA"),
            ("C-EXCL", "EXCLUDED: FLOOD, WETLANDS, STEEP"),
            ("C-BLOCK", "PROGRAM BLOCK"),
            ("C-ROAD", "ACCESS ROAD CENTRELINE"),
        ]
        for i, (layer, text) in enumerate(entries):
            yy = ly - 0.3 * i
            on(layer)
            cad.ex("line", {"points": [[lx, yy], [lx + 0.8, yy]]})
            on("C-ANNO")
            cad.ex("text", {"at": [lx + 1.0, yy], "text": text, "height": 0.1, "justify": "ML"})

    try:
        result = rs.render(cli, tpl, record, out_dir, draw=draw)
    except rs.SheetError as e:
        raise ValueError(f"sheet refused: {e}") from e
    result["scale"] = f"1\" = {s}'"
    result["record"] = record
    return result
