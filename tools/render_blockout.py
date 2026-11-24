#!/usr/bin/env python3
"""Step 0 blockout for the Control Rod redesign (spec 2026-11-24, sections 4 and 6.1).

Generates design/art/layout.json from a few parameters (ring radii, angles, room sizes), then renders
a true isometric (30 degree) flat-grey blockout from that file: back and front occlusion layers, a
mask per room, a phone crop, projected seat anchors and a report with sha256 digests. It is a
registration guide for image-to-image generation, not art. Place ids and seat counts come from
apps/web/src/features/office/plant-layout.ts (grid columns x rows per place).

It also renders the scalable split (spec section 4): a SITE plate (containment+core, ring road, pipelines and a flat pad
per room) and one standalone ROOM TILE per archetype x size actually used (blockout/tiles/), with tiles/tiles.json holding
canvas size, scale, the pad-anchor point and tile-local seat anchors. A tile lands on a pad by one offset:
tile top-left on the plate = pad - pad_anchor * (1 / scale). See design/art/tiles.md.

Usage: python3 tools/render_blockout.py [--no-generate]   (default regenerates layout.json first)
       python3 tools/render_blockout.py --rooms N          (dry run: lay out N rooms on rings and self-check; writes nothing)
Needs Pillow. Every number written to layout.json, anchors.json and the report comes from this script.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "design" / "art"
LAYOUT = ART / "layout.json"
OUT = ART / "blockout"

CANVAS_W, CANVAS_H = 2400, 1500
ANGLE = 30.0
C, S = math.cos(math.radians(ANGLE)), math.sin(math.radians(ANGLE))

# ---- parameters (recorded in layout.json) -------------------------------------------------------
PARAMS = {
    "origin_screen": [1200, 860],  # screen position of the ground-plane origin (the core centre)
    "core": {"radius": 510, "wall_height": 190, "lip_height": 40, "vessel_radius": 200, "vessel_height": 150},
    "inner_ring": {"radius": 730, "angles_deg": {"verification": -45, "review": 0, "your-office": 45, "interface": 90}},
    "outer_arc": {"radius": 985, "centre_deg": -135, "step_deg": 24},
    "yards": {"screen_centres": {"bench": [250, 1340], "quarantine": [2150, 1340], "document-control": [190, 140]}},
    "pipes": {"stage_ring_radius": 835, "hold_ring_radius": 858, "arc_step_deg": 4},
    "lip_height": 22,
    "seat_margin": 14,
    "ring_road": {"inner_radius": 815, "outer_radius": 880},
    "pad": {"skirt_height": 6, "reference": "back corner of the floor footprint (gx = x, gy = y), the point where the two back walls meet"},
    # Sizes by seat count and archetype wall heights; every room of one archetype x size shares one tile.
    "sizes": {"S": {"seats": 4, "cols": 2, "rows": 2, "w": 160, "d": 130},
              "M": {"seats": 6, "cols": 3, "rows": 2, "w": 170, "d": 130},
              "L": {"seats": 8, "cols": 4, "rows": 2, "w": 240, "d": 140}},
    "archetypes": {"control-room": {"wall_height": 80, "default_size": "S"}, "work-bay": {"wall_height": 90, "default_size": "M"},
                   "inspection": {"wall_height": 80, "default_size": "S"}, "briefing": {"wall_height": 80, "default_size": "S"},
                   "interface": {"wall_height": 80, "default_size": "S"}, "lab": {"wall_height": 40, "default_size": "L"},
                   "archive": {"wall_height": 40, "default_size": "L"}, "yard": {"wall_height": 40, "default_size": "L"}},
    # Fixed tile frame: every tile puts the floor's back corner at the same tile-local point, so the frame
    # only grows if a room larger than max_d / max_h is introduced (and then it is a deliberate re-cut).
    "tile": {"scale": 2.0, "margin": 10, "max_d": 160, "max_h": 120},
    # Generic ring layout used by --rooms N (and for any rooms added later): rooms on concentric rings, pitch from the largest footprint.
    "ring_layout": {"start_radius": 985, "gap": 24, "angle_offset_deg": 15},
}
# Seat grids (columns x rows), the same place ids and counts as plant-layout.ts.
BAYS = ["process", "mechanical", "electrical", "civil", "assurance", "project-controls"]
# Archetype and size (S 4 seats, M 6, L 8) per place; the seat grid follows from the size.
ROOM_ARCH = {**{b: ("work-bay", "M") for b in BAYS}, "your-office": ("control-room", "S"), "verification": ("inspection", "S"),
             "review": ("briefing", "S"), "interface": ("interface", "S"), "bench": ("lab", "L"),
             "document-control": ("archive", "L"), "quarantine": ("yard", "L")}
ORDER = BAYS + ["review", "interface", "verification", "your-office", "document-control", "bench", "quarantine"]
RING = {"your-office": "inner", "verification": "inner", "review": "inner", "interface": "inner",
        **{b: "outer" for b in BAYS}, "bench": "yard", "document-control": "yard", "quarantine": "yard"}

r2 = lambda v: round(float(v), 2)


def proj(gx, gy, gz=0.0):
    ox, oy = PARAMS["origin_screen"]
    return (ox + (gx - gy) * C, oy + (gx + gy) * S - gz)


def unproj(sx, sy):
    ox, oy = PARAMS["origin_screen"]
    a, b = (sx - ox) / C, (sy - oy) / S  # gx - gy, gx + gy
    return ((a + b) / 2, (b - a) / 2)


# ---- layout generation ----------------------------------------------------------------------------
def make_room(pid, arch, size, cx, cy, ring, angle=None, radius=None):
    """One room from its centre on the ground plane: footprint, seat grid, archetype, size and pad reference corner."""
    P = PARAMS
    sz, ar = P["sizes"][size], P["archetypes"][arch]
    w, d, h = sz["w"], sz["d"], ar["wall_height"]
    cols, rows = sz["cols"], sz["rows"]
    x, y = cx - w / 2, cy - d / 2
    sx, sy = proj(x, y)
    return {"id": pid, "archetype": arch, "size": size, "ring": ring, "angle_deg": angle, "ring_radius": radius,
            "x": r2(x), "y": r2(y), "w": w, "d": d, "wall_height": h, "seat_grid": {"cols": cols, "rows": rows},
            "seats": seat_points(x, y, w, d, cols, rows),
            "pad": {"gx": r2(x), "gy": r2(y), "sx": r2(sx), "sy": r2(sy)}}


def seat_points(x, y, w, d, cols, rows):
    m = PARAMS["seat_margin"]
    return [{"gx": r2(x + m + (w - 2 * m) * (c + 0.5) / cols), "gy": r2(y + m + (d - 2 * m) * (r + 0.5) / rows)}
            for r in range(rows) for c in range(cols)]


def ring_slots(n):
    """Centres for n rooms on concentric rings (ring parameter), spaced so no two footprints can touch: pitch is the
    diagonal of the largest footprint plus a gap, and the centre distance on a ring and between rings is at least the pitch."""
    P = PARAMS
    pitch = max(math.hypot(s["w"], s["d"]) for s in P["sizes"].values()) + P["ring_layout"]["gap"]
    slots, k, left = [], 0, n
    while left > 0:
        radius = P["ring_layout"]["start_radius"] + k * pitch
        count = min(left, int(2 * math.pi * radius // pitch))
        for i in range(count):
            a = P["ring_layout"]["angle_offset_deg"] * k + 360.0 * i / count
            slots.append((radius * math.cos(math.radians(a)), radius * math.sin(math.radians(a)), f"ring{k + 1}", a, radius))
        left -= count
        k += 1
    return slots


def build_rooms_ring(n):
    """N generic rooms cycling through the archetypes at their default size (dry run, and the recipe for new rooms)."""
    archs = list(PARAMS["archetypes"])
    return [make_room(f"room-{i + 1:02d}", archs[i % len(archs)], PARAMS["archetypes"][archs[i % len(archs)]]["default_size"], *slot)
            for i, slot in enumerate(ring_slots(n))]


def number_seats(ordered):
    n = 0
    for rm in ordered:
        for i, s in enumerate(rm["seats"]):
            n += 1
            s["n"], s["local"], s["id"] = n, i + 1, f"{rm['id']}:{i + 1}"


def build_layout() -> dict:
    P = PARAMS
    rooms = {}

    def add(pid, cx, cy, ring, angle=None, radius=None):
        rooms[pid] = make_room(pid, *ROOM_ARCH[pid], cx, cy, ring, angle, radius)

    ir = P["inner_ring"]
    for pid, a in ir["angles_deg"].items():
        t = math.radians(a)
        add(pid, ir["radius"] * math.cos(t), ir["radius"] * math.sin(t), "inner", a, ir["radius"])
    oa = P["outer_arc"]
    for i, pid in enumerate(BAYS):
        a = oa["centre_deg"] + (i - 2.5) * oa["step_deg"]
        t = math.radians(a)
        add(pid, oa["radius"] * math.cos(t), oa["radius"] * math.sin(t), "outer", a, oa["radius"])
    for pid, (sx, sy) in P["yards"]["screen_centres"].items():
        gx, gy = unproj(sx, sy)
        add(pid, gx, gy, "yard", math.degrees(math.atan2(gy, gx)), math.hypot(gx, gy))
    ordered = [rooms[p] for p in ORDER]
    number_seats(ordered)

    def centre(rm): return (rm["x"] + rm["w"] / 2, rm["y"] + rm["d"] / 2)

    def ang(rm): return math.degrees(math.atan2(centre(rm)[1], centre(rm)[0]))

    def ring_path(a0, a1, radius):
        d = (a1 - a0 + 180) % 360 - 180
        steps = max(1, int(abs(d) // P["pipes"]["arc_step_deg"]))
        return [(radius * math.cos(math.radians(a0 + d * k / steps)), radius * math.sin(math.radians(a0 + d * k / steps))) for k in range(steps + 1)]

    def route(src, dst, radius):
        a0, a1 = ang(rooms[src]), ang(rooms[dst])
        pts = [centre(rooms[src])] + ring_path(a0, a1, radius) + [centre(rooms[dst])]
        return [[r2(x), r2(y)] for x, y in pts]

    sr, hr = P["pipes"]["stage_ring_radius"], P["pipes"]["hold_ring_radius"]
    pipes = []
    for b in BAYS:
        pipes.append({"id": f"{b}->verification", "kind": "stage", "from": b, "to": "verification", "points": route(b, "verification", sr)})
    for a, b in [("verification", "review"), ("review", "your-office"), ("verification", "your-office")]:
        pipes.append({"id": f"{a}->{b}", "kind": "stage", "from": a, "to": b, "points": route(a, b, sr)})
    for pid in ORDER:
        if pid != "quarantine":
            pipes.append({"id": f"{pid}->quarantine", "kind": "hold", "from": pid, "to": "quarantine", "points": route(pid, "quarantine", hr)})
    return {
        "schema": 1, "canvas": {"width": CANVAS_W, "height": CANVAS_H},
        "projection": {"kind": "isometric", "angle_deg": ANGLE, "origin_screen": P["origin_screen"],
                       "formula": "sx = ox + (gx - gy) * cos(angle); sy = oy + (gx + gy) * sin(angle) - gz"},
        "units": "ground-plane pixels (1 unit = 1 screen px along an isometric axis); origin is the core centre",
        "source": "tools/render_blockout.py; place ids and seat grids mirror apps/web/src/features/office/plant-layout.ts",
        "params": P,
        "core": {"id": "core", "cx": 0, "cy": 0, **P["core"]},
        "rooms": ordered, "pipelines": pipes,
    }


# ---- rendering ------------------------------------------------------------------------------------
TOP, FACE_L, FACE_R = (205, 205, 205, 255), (158, 158, 158, 255), (118, 118, 118, 255)
FLOOR, EDGE, BG = (186, 186, 186, 255), (70, 70, 70, 255), (52, 52, 52, 255)


def poly(d, pts, fill, edge=True):
    d.polygon([(round(x, 1), round(y, 1)) for x, y in pts], fill=fill, outline=EDGE if edge else None)


def box_quad(gs, z0, z1):
    return [proj(gx, gy, z0) for gx, gy in gs[:2]] + [proj(gx, gy, z1) for gx, gy in reversed(gs[:2])]


def room_polys(rm, lip, pj=proj):
    """(back polygons, front polygons), each (points, fill). Back: floor and the two far walls; front: the two near lips."""
    x0, y0, x1, y1, h, t = rm["x"], rm["y"], rm["x"] + rm["w"], rm["y"] + rm["d"], rm["wall_height"], 7
    back = [([pj(x0, y0), pj(x1, y0), pj(x1, y1), pj(x0, y1)], FLOOR),
            # north wall (inside face looks lower-left), west wall (inside face looks lower-right), with a top cap
            ([pj(x0, y0, 0), pj(x1, y0, 0), pj(x1, y0, h), pj(x0, y0, h)], FACE_L),
            ([pj(x0, y0, 0), pj(x0, y1, 0), pj(x0, y1, h), pj(x0, y0, h)], FACE_R),
            ([pj(x0, y0, h), pj(x1, y0, h), pj(x1, y0 + t, h), pj(x0, y0 + t, h)], TOP),
            ([pj(x0, y0, h), pj(x0, y1, h), pj(x0 + t, y1, h), pj(x0 + t, y0, h)], TOP)]
    front = [([pj(x0, y1, 0), pj(x1, y1, 0), pj(x1, y1, lip), pj(x0, y1, lip)], FACE_L),
             ([pj(x1, y0, 0), pj(x1, y1, 0), pj(x1, y1, lip), pj(x1, y0, lip)], FACE_R),
             ([pj(x0, y1, lip), pj(x1, y1, lip), pj(x1, y1 - t, lip), pj(x0, y1 - t, lip)], TOP),
             ([pj(x1, y0, lip), pj(x1, y1, lip), pj(x1 - t, y1, lip), pj(x1 - t, y0, lip)], TOP)]
    return back, front


def arc(r, a0, a1, z, n=48):
    return [proj(r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), r * math.sin(math.radians(a0 + (a1 - a0) * k / n)), z) for k in range(n + 1)]


def core_polys(core):
    """Containment cutaway. Ground angle -225..-45 faces away from the viewer (back half), -45..135 is the near half."""
    R, H, lip, vr, vh = core["radius"], core["wall_height"], core["lip_height"], core["vessel_radius"], core["vessel_height"]
    thick = 14
    back, front = [], []
    back.append((arc(R, 0, 360, 0, 120), FLOOR))
    # back half inner wall: left part (ground -225..-135) faces lower-right, right part (-135..-45) faces lower-left
    for a0, a1, shade in ((-225, -135, FACE_R), (-135, -45, FACE_L)):
        back.append((arc(R, a0, a1, 0) + arc(R, a1, a0, H), shade))
    back.append((arc(R, -225, -45, H) + arc(R - thick, -45, -225, H), TOP))
    # the vessel stands in the middle
    back.append((arc(vr, 0, 360, vh, 96), TOP))
    for a0, a1, shade in ((-45, 135, None),):
        pass
    side_l = arc(vr, 45, 225, 0, 48) + arc(vr, 225, 45, vh, 48)  # near-left half of the vessel body
    side_r = arc(vr, -135, 45, 0, 48) + arc(vr, 45, -135, vh, 48)
    # draw vessel sides before its top so the top cap reads on top
    back.insert(len(back) - 1, (side_l, FACE_L))
    back.insert(len(back) - 1, (side_r, FACE_R))
    # near half lip, cut low
    for a0, a1, shade in ((-45, 45, FACE_R), (45, 135, FACE_L)):
        front.append((arc(R, a0, a1, 0) + arc(R, a1, a0, lip), shade))
    front.append((arc(R, -45, 135, lip) + arc(R - thick, 135, -45, lip), TOP))
    return back, front


def silhouette_polys(core):
    R, H = core["radius"], core["wall_height"]
    ell0, ell1 = arc(R, 0, 360, 0, 120), arc(R, 0, 360, H, 120)
    xs = [p[0] for p in ell0]
    ymid0 = proj(0, 0)[1]
    body = [(min(xs), ymid0), (min(xs), ymid0 - H), (max(xs), ymid0 - H), (max(xs), ymid0)]
    return [ell0, ell1, body]


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def new_layer():
    im = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def depth(rm):
    return (rm["x"] + rm["w"] / 2) + (rm["y"] + rm["d"] / 2)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


PAD_TOP, PAD_SKIRT, ROAD = (176, 176, 176, 255), (96, 96, 96, 255), (84, 84, 84, 255)


def pad_polys(rm, pj=proj):
    """Flat low slab for a room footprint: top at ground level, skirt dropping below it on the two near sides. No walls."""
    x0, y0, x1, y1, k = rm["x"], rm["y"], rm["x"] + rm["w"], rm["y"] + rm["d"], PARAMS["pad"]["skirt_height"]
    return [([pj(x0, y1, 0), pj(x1, y1, 0), pj(x1, y1, -k), pj(x0, y1, -k)], FACE_L),
            ([pj(x1, y0, 0), pj(x1, y1, 0), pj(x1, y1, -k), pj(x1, y0, -k)], PAD_SKIRT),
            ([pj(x0, y0), pj(x1, y0), pj(x1, y1), pj(x0, y1)], PAD_TOP)]


def tile_groups(rooms):
    """Tile specs keyed '<archetype>-<size>' from the rooms that use them; one footprint and seat grid per key."""
    T = PARAMS["tile"]
    groups = {}
    for rm in rooms:
        key = f"{rm['archetype']}-{rm['size']}"
        sig = (rm["w"], rm["d"], rm["wall_height"], rm["seat_grid"]["cols"], rm["seat_grid"]["rows"])
        assert groups.setdefault(key, {"sig": sig, "rooms": []})["sig"] == sig, f"rooms of {key} disagree on footprint or seat grid"
        groups[key]["rooms"].append(rm["id"])
    specs = {}
    for key, g in sorted(groups.items()):
        w, d, h, cols, rows = g["sig"]
        assert d <= T["max_d"] and h <= T["max_h"], f"{key} exceeds the tile frame"
        k, m = T["scale"], T["margin"]
        ax, ay = m + k * C * T["max_d"], m + k * T["max_h"]
        pj = lambda gx, gy, gz=0.0, ax=ax, ay=ay, k=k: (ax + (gx - gy) * C * k, ay + (gx + gy) * S * k - gz * k)
        rm = {"x": 0.0, "y": 0.0, "w": w, "d": d, "wall_height": h}
        seats = [{"local": i + 1, "x": r2(pj(s["gx"], s["gy"])[0]), "y": r2(pj(s["gx"], s["gy"])[1])} for i, s in enumerate(seat_points(0, 0, w, d, cols, rows))]
        specs[key] = {"key": key, "pj": pj, "rm": rm, "w": w, "d": d, "h": h, "anchor": [r2(ax), r2(ay)], "rooms": g["rooms"],
                      "canvas": [math.ceil(ax + k * C * w + m), math.ceil(ay + k * S * (w + d) + m)], "seats": seats,
                      "footprint_px": [[r2(v) for v in pj(gx, gy)] for gx, gy in ((0, 0), (w, 0), (w, d), (0, d))]}
    return specs


def render_tile(spec, lip):
    """(full tile, front-only tile) as transparent RGBA images: the cutaway volume standalone."""
    full, front = (Image.new("RGBA", tuple(spec["canvas"]), (0, 0, 0, 0)) for _ in range(2))
    bp, fp = room_polys(spec["rm"], lip, spec["pj"])
    fd, frd = ImageDraw.Draw(full), ImageDraw.Draw(front)
    for pts, fill in bp:
        poly(fd, pts, fill)
    for pts, fill in fp:
        poly(fd, pts, fill)
        poly(frd, pts, fill)
    return full, front


def render_site(layout):
    """Site plate: ground, ring road, pipelines, a flat pad per room, containment+core cutaway. Returns the composite."""
    P, core = PARAMS, layout["core"]
    im = Image.new("RGBA", (CANVAS_W, CANVAS_H), BG)
    d = ImageDraw.Draw(im)
    rr = P["ring_road"]
    d.polygon(arc(rr["outer_radius"], 0, 360, 0, 180), fill=ROAD, outline=EDGE)
    d.polygon(arc(rr["inner_radius"], 0, 360, 0, 180), fill=BG, outline=EDGE)
    for p in layout["pipelines"]:
        col, width = ((235, 235, 235, 255), 4) if p["kind"] == "stage" else ((120, 120, 120, 255), 3)
        d.line([proj(x, y) for x, y in p["points"]], fill=col, width=width, joint="curve")
    for rm in sorted(layout["rooms"], key=depth):
        for pts, fill in pad_polys(rm):
            poly(d, pts, fill)
    bp, fp = core_polys(core)
    for pts, fill in bp + fp:
        poly(d, pts, fill)
    f_room = font(15)
    for rm in layout["rooms"]:
        lx, ly = proj(rm["x"] + rm["w"] / 2, rm["y"] + rm["d"] / 2)
        d.text((lx, ly), f"{rm['id']}\n{rm['archetype']}-{rm['size']}", font=f_room, fill=(30, 30, 30, 255), anchor="mm", align="center")
    cx, cy = proj(0, 0)
    d.text((cx, cy + 6), "containment + core", font=f_room, fill=(30, 30, 30, 255), anchor="mm")
    return im


def tile_checks(layout, specs, tile_dir=None):
    """Place every room's tile on its pad by the one-offset rule and compare with the room itself. Returns worst errors."""
    k = PARAMS["tile"]["scale"]
    worst_fp = worst_seat = 0.0
    for rm in layout["rooms"]:
        spec = specs[f"{rm['archetype']}-{rm['size']}"]
        ox, oy = rm["pad"]["sx"] - spec["anchor"][0] / k, rm["pad"]["sy"] - spec["anchor"][1] / k  # tile top-left on the plate
        plate = [proj(rm["x"], rm["y"]), proj(rm["x"] + rm["w"], rm["y"]), proj(rm["x"] + rm["w"], rm["y"] + rm["d"]), proj(rm["x"], rm["y"] + rm["d"])]
        for (tx, ty), (px, py) in zip(spec["footprint_px"], plate):
            worst_fp = max(worst_fp, math.hypot(ox + tx / k - px, oy + ty / k - py))
        tpoly = spec["footprint_px"]
        for ts, rs in zip(spec["seats"], rm["seats"]):
            sx, sy = proj(rs["gx"], rs["gy"])
            worst_seat = max(worst_seat, math.hypot(ox + ts["x"] / k - sx, oy + ts["y"] / k - sy))
            assert in_quad(tpoly, ts["x"], ts["y"]), f"{rm['id']} seat {ts['local']} outside the tile floor"
    assert worst_fp <= 2, f"tile footprint off its pad by {worst_fp:.2f}px"
    assert worst_seat <= 2, f"tile seat anchor off the plate seat by {worst_seat:.2f}px"
    return round(worst_fp, 3), round(worst_seat, 3)


def in_quad(q, x, y):
    sign = [(q[(i + 1) % 4][0] - q[i][0]) * (y - q[i][1]) - (q[(i + 1) % 4][1] - q[i][1]) * (x - q[i][0]) for i in range(4)]
    return all(v >= 0 for v in sign) or all(v <= 0 for v in sign)


def render(layout: dict) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "room-masks").mkdir(exist_ok=True)
    lip = layout["params"]["lip_height"]
    core = layout["core"]
    rooms = layout["rooms"]
    back, bd = new_layer()
    front, fd = new_layer()
    ground, gd = new_layer()

    # pipelines on the ground, under everything
    for p in layout["pipelines"]:
        pts = [proj(x, y) for x, y in p["points"]]
        col, width = ((235, 235, 235, 255), 4) if p["kind"] == "stage" else ((120, 120, 120, 255), 3)
        gd.line(pts, fill=col, width=width, joint="curve")

    items = [("core", -1e9, core)] + [(rm["id"], depth(rm), rm) for rm in rooms]
    # painter's order by ground depth; the core is large, so it sits by its own centre
    items.sort(key=lambda t: 0 if t[0] == "core" else depth(t[2]))
    bboxes, mask_polys = {}, {}
    for pid, _, obj in items:
        if pid == "core":
            bp, fp = core_polys(core)
        else:
            bp, fp = room_polys(obj, lip)
        for pts, fill in bp:
            poly(bd, pts, fill)
        for pts, fill in fp:
            poly(fd, pts, fill)
        allpts = [pt for pts, _ in bp + fp for pt in pts]
        if pid == "core":
            allpts = [pt for pts in silhouette_polys(core) for pt in pts]
            mask_polys[pid] = silhouette_polys(core)
        else:
            mask_polys[pid] = [pts for pts, _ in bp + fp]
        xs, ys = [p[0] for p in allpts], [p[1] for p in allpts]
        bboxes[pid] = [math.floor(min(xs)), math.floor(min(ys)), math.ceil(max(xs)), math.ceil(max(ys))]

    # composite: ground pipes, back layer, front layer, then annotations
    comp = Image.new("RGBA", (CANVAS_W, CANVAS_H), BG)
    for layer in (ground, back, front):
        comp = Image.alpha_composite(comp, layer)
    cd = ImageDraw.Draw(comp)
    f_seat, f_room = font(11), font(15)
    anchors = {"canvas": [CANVAS_W, CANVAS_H], "rooms": {}, "core": {"bbox": bboxes["core"]}}
    for rm in rooms:
        pid = rm["id"]
        sa = []
        for s in rm["seats"]:
            sx, sy = proj(s["gx"], s["gy"])
            sa.append({"n": s["n"], "id": s["id"], "x": r2(sx), "y": r2(sy)})
            cd.ellipse([sx - 5, sy - 5, sx + 5, sy + 5], fill=(30, 30, 30, 255), outline=(255, 255, 255, 255))
            cd.text((sx + 7, sy - 7), str(s["n"]), font=f_seat, fill=(20, 20, 20, 255), stroke_width=1, stroke_fill=(235, 235, 235, 255))
        lx, ly = proj(rm["x"] + rm["w"] / 2, rm["y"] + rm["d"] + 4)
        cd.text((lx, ly + 2), pid, font=f_room, fill=(235, 235, 235, 255), anchor="mt", stroke_width=2, stroke_fill=(30, 30, 30, 255))
        anchors["rooms"][pid] = {"archetype": rm["archetype"], "size": rm["size"], "tile": f"tiles/{rm['archetype']}-{rm['size']}.png",
                                 "pad": {"x": rm["pad"]["sx"], "y": rm["pad"]["sy"]}, "bbox": bboxes[pid], "mask": f"room-masks/{pid}.png", "seats": sa}
    cx, cy = proj(0, 0)
    cd.text((cx, cy + 6), "containment + core", font=f_room, fill=(30, 30, 30, 255), anchor="mm")

    # masks: white on black, cropped to the room's bounding box (full-canvas coordinates in anchors.json)
    core_area = 0
    for pid, polys in mask_polys.items():
        m = Image.new("L", (CANVAS_W, CANVAS_H), 0)
        md = ImageDraw.Draw(m)
        for pts in polys:
            md.polygon([(round(x, 1), round(y, 1)) for x, y in pts], fill=255)
        if pid == "core":
            core_area = m.histogram()[255]
        x0, y0, x1, y1 = bboxes[pid]
        m.crop((max(0, x0), max(0, y0), min(CANVAS_W, x1 + 1), min(CANVAS_H, y1 + 1))).save(OUT / "room-masks" / f"{pid}.png", optimize=False)

    comp.convert("RGB").save(OUT / "blockout-2400x1500.png")
    back.save(OUT / "blockout-back.png")
    front.save(OUT / "blockout-front.png")
    # phone crop of the core: full-height strip with the phone aspect, centred on the core, scaled to 780 x 1688
    cw = round(CANVAS_H * 780 / 1688)
    x0 = round(cx - cw / 2)
    comp.convert("RGB").crop((x0, 0, x0 + cw, CANVAS_H)).resize((780, 1688), Image.LANCZOS).save(OUT / "blockout-390.png")
    anchors["phone_crop"] = {"file": "blockout-390.png", "canvas_box": [x0, 0, x0 + cw, CANVAS_H], "size": [780, 1688]}

    # site plate and its phone crop
    site = render_site(layout)
    site.convert("RGB").save(OUT / "site-2400x1500.png")
    site.convert("RGB").crop((x0, 0, x0 + cw, CANVAS_H)).resize((780, 1688), Image.LANCZOS).save(OUT / "site-390.png")
    anchors["site"] = {"file": "site-2400x1500.png", "phone_crop": {"file": "site-390.png", "canvas_box": [x0, 0, x0 + cw, CANVAS_H], "size": [780, 1688]},
                       "pad_reference": PARAMS["pad"]["reference"], "tiles": "tiles/tiles.json"}

    # standalone room tiles, one per archetype x size in use
    (OUT / "tiles").mkdir(exist_ok=True)
    specs = tile_groups(rooms)
    T = PARAMS["tile"]
    tiles = {"schema": 1, "scale": T["scale"], "scale_note": "tile px per plate px; a tile is drawn at 2x the plate so it can be painted with more detail",
             "frame": {"max_d": T["max_d"], "max_h": T["max_h"], "margin": T["margin"]},
             "placement": "tile top-left on the 2400x1500 plate = pad - pad_anchor / scale; draw it at 1/scale of its pixel size; seat feet = top-left + seat / scale",
             "tiles": {}}
    for key, sp in specs.items():
        full, front_t = render_tile(sp, layout["params"]["lip_height"])
        full.save(OUT / "tiles" / f"{key}.png")
        front_t.save(OUT / "tiles" / f"{key}-front.png")
        tiles["tiles"][key] = {"file": f"{key}.png", "front": f"{key}-front.png", "archetype": key.rsplit("-", 1)[0], "size": key.rsplit("-", 1)[1],
                               "canvas": sp["canvas"], "scale": T["scale"], "pad_anchor": sp["anchor"],
                               "footprint": {"w": sp["w"], "d": sp["d"], "wall_height": sp["h"]}, "footprint_px": sp["footprint_px"],
                               "seats": sp["seats"], "used_by": sp["rooms"]}
    (OUT / "tiles" / "tiles.json").write_text(json.dumps(tiles, indent=1) + "\n")
    (OUT / "anchors.json").write_text(json.dumps(anchors, indent=1) + "\n")
    return {"anchors": anchors, "core_area": core_area, "specs": specs, "tile_keys": list(specs)}


def geometry_checks(layout):
    """Checks that need no rendering: footprints off the containment and each other, seats inside footprints."""
    rects = {}
    for rm in layout["rooms"]:
        pid = rm["id"]
        x0, y0, x1, y1 = rm["x"], rm["y"], rm["x"] + rm["w"], rm["y"] + rm["d"]
        rects[pid] = (x0, y0, x1, y1)
        for s in rm["seats"]:
            assert x0 <= s["gx"] <= x1 and y0 <= s["gy"] <= y1, f"{s['id']} outside {pid} footprint"
        nx, ny = min(max(0, x0), x1) if x0 <= 0 <= x1 else (x0 if x0 > 0 else x1), min(max(0, y0), y1) if y0 <= 0 <= y1 else (y0 if y0 > 0 else y1)
        assert math.hypot(nx, ny) > layout["core"]["radius"], f"{pid} overlaps the containment"
    ids = list(rects)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            ra, rb = rects[a], rects[b]
            assert ra[2] <= rb[0] or rb[2] <= ra[0] or ra[3] <= rb[1] or rb[3] <= ra[1], f"{a} and {b} footprints overlap"


def selfcheck(layout, res, report):
    assert report["core_share"] >= 0.25, f"core share {report['core_share']:.3f} < 0.25"
    anchors = res["anchors"]
    geometry_checks(layout)
    fp_err, seat_err = tile_checks(layout, res["specs"])
    report["tile_checks"] = {"max_footprint_error_px": fp_err, "max_seat_error_px": seat_err}
    for key in res["tile_keys"]:  # rendered pixels: the floor centre and every seat are opaque in the tile, and the pad is flat on the site plate
        sp = res["specs"][key]
        im = Image.open(OUT / "tiles" / f"{key}.png")
        assert im.size == tuple(sp["canvas"])
        cx, cy = sp["pj"](sp["w"] / 2, sp["d"] / 2)
        assert im.getpixel((round(cx), round(cy)))[3] == 255, f"{key} floor centre is not painted"
        assert all(im.getpixel((round(t["x"]), round(t["y"])))[3] == 255 for t in sp["seats"]), f"{key} seat off the painted floor"
    site = Image.open(OUT / "site-2400x1500.png")
    for rm in layout["rooms"]:
        assert site.getpixel((round(proj(rm["x"] + 6, rm["y"] + rm["d"] / 2)[0]), round(proj(rm["x"] + 6, rm["y"] + rm["d"] / 2)[1])))[:3] != BG[:3], f"{rm['id']} has no pad on the site plate"
    for rm in layout["rooms"]:
        pid = rm["id"]
        bx0, by0, bx1, by1 = anchors["rooms"][pid]["bbox"]
        assert 0 <= bx0 and 0 <= by0 and bx1 <= CANVAS_W and by1 <= CANVAS_H, f"{pid} bbox leaves the canvas"
        for s in anchors["rooms"][pid]["seats"]:
            assert bx0 <= s["x"] <= bx1 and by0 <= s["y"] <= by1, f"{s['id']} anchor outside {pid} bounds"
    assert report["total_seats"] == sum(len(r["seats"]) for r in layout["rooms"])
    assert len(layout["rooms"]) == 13
    print("self-check passed")


def dry_run(n):
    """Lay out n generic rooms on rings and run every check that needs no rendering. Writes nothing."""
    rooms = build_rooms_ring(n)
    number_seats(rooms)
    layout = {"core": {"radius": PARAMS["core"]["radius"]}, "rooms": rooms}
    geometry_checks(layout)
    specs = tile_groups(rooms)
    fp_err, seat_err = tile_checks(layout, specs)
    off = [r["id"] for r in rooms if not all(0 <= v <= lim for v, lim in zip(proj(r["x"] + r["w"] / 2, r["y"] + r["d"] / 2), (CANVAS_W, CANVAS_H)))]
    rings = {}
    for r in rooms:
        rings[r["ring"]] = rings.get(r["ring"], 0) + 1
    print(json.dumps({"rooms": n, "rings": rings, "tiles_needed": sorted(specs), "max_footprint_error_px": fp_err, "max_seat_error_px": seat_err,
                      "rooms_off_the_2400x1500_plate": len(off), "note": "off-plate rooms need a larger site plate; nothing was written"}, indent=1))
    print("dry-run self-check passed")


def main():
    if "--rooms" in sys.argv:
        dry_run(int(sys.argv[sys.argv.index("--rooms") + 1]))
        return
    if "--no-generate" not in sys.argv:
        ART.mkdir(parents=True, exist_ok=True)
        LAYOUT.write_text(json.dumps(build_layout(), indent=1) + "\n")
    layout = json.loads(LAYOUT.read_text())
    PARAMS.update(layout["params"])
    res = render(layout)
    seat_pts = [(s["x"], s["y"]) for rm in res["anchors"]["rooms"].values() for s in rm["seats"]]
    mind = min(math.dist(a, b) for i, a in enumerate(seat_pts) for b in seat_pts[i + 1:])
    outputs = ["blockout-2400x1500.png", "blockout-back.png", "blockout-front.png", "blockout-390.png", "anchors.json"] + [
        f"room-masks/{rm['id']}.png" for rm in layout["rooms"]] + ["room-masks/core.png", "site-2400x1500.png", "site-390.png", "tiles/tiles.json"] + [
        f"tiles/{k}{suf}.png" for k in res["tile_keys"] for suf in ("", "-front")]
    report = {
        "canvas": [CANVAS_W, CANVAS_H],
        "core_area_px": res["core_area"],
        "core_share": round(res["core_area"] / (CANVAS_W * CANVAS_H), 4),
        "total_seats": len(seat_pts),
        "seats_per_room": {rm["id"]: len(rm["seats"]) for rm in layout["rooms"]},
        "min_seat_anchor_distance_px": round(mind, 2),
        "tiles": res["tile_keys"],
        "sha256": {"design/art/layout.json": sha(LAYOUT), **{f"design/art/blockout/{o}": sha(OUT / o) for o in outputs}},
    }
    (OUT / "blockout-report.json").write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps(report, indent=1))
    selfcheck(layout, res, report)


if __name__ == "__main__":
    main()
