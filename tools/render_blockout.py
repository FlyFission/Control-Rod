#!/usr/bin/env python3
"""Step 0 blockout for the Control Rod redesign (spec 2026-11-24, sections 4 and 6.1).

Generates design/art/layout.json from a few parameters (ring radii, angles, room sizes), then renders
a true isometric (30 degree) flat-grey blockout from that file: back and front occlusion layers, a
mask per room, a phone crop, projected seat anchors and a report with sha256 digests. It is a
registration guide for image-to-image generation, not art. Place ids and seat counts come from
apps/web/src/features/office/plant-layout.ts (grid columns x rows per place).

Usage: python3 tools/render_blockout.py [--no-generate]   (default regenerates layout.json first)
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
    "inner_ring": {"radius": 730, "angles_deg": {"verification": -45, "review": 0, "your-office": 45, "interface": 90},
                   "size": {"w": 160, "d": 130, "h": 80}},
    "outer_arc": {"radius": 985, "centre_deg": -135, "step_deg": 24, "size": {"w": 170, "d": 130, "h": 90}},
    "yards": {"size": {"w": 240, "d": 140, "h": 40},
              "screen_centres": {"bench": [250, 1340], "quarantine": [2150, 1340], "document-control": [190, 140]}},
    "pipes": {"stage_ring_radius": 835, "hold_ring_radius": 858, "arc_step_deg": 4},
    "lip_height": 22,
    "seat_margin": 14,
}
# Seat grids (columns x rows), the same place ids and counts as plant-layout.ts.
BAYS = ["process", "mechanical", "electrical", "civil", "assurance", "project-controls"]
GRID = {**{b: (3, 2) for b in BAYS}, "your-office": (2, 2), "interface": (2, 2), "verification": (2, 2), "review": (2, 2),
        "bench": (4, 2), "document-control": (4, 2), "quarantine": (4, 2)}
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
def build_layout() -> dict:
    P = PARAMS
    rooms = {}

    def add(pid, cx, cy, size, ring, angle=None, radius=None):
        w, d, h = size["w"], size["d"], size["h"]
        cols, rows = GRID[pid]
        x, y = cx - w / 2, cy - d / 2
        m = P["seat_margin"]
        seats = []
        for r in range(rows):
            for c in range(cols):
                seats.append({"gx": r2(x + m + (w - 2 * m) * (c + 0.5) / cols), "gy": r2(y + m + (d - 2 * m) * (r + 0.5) / rows)})
        rooms[pid] = {"id": pid, "ring": ring, "angle_deg": angle, "ring_radius": radius, "x": r2(x), "y": r2(y), "w": w, "d": d,
                      "wall_height": h, "seat_grid": {"cols": cols, "rows": rows}, "seats": seats}

    ir = P["inner_ring"]
    for pid, a in ir["angles_deg"].items():
        t = math.radians(a)
        add(pid, ir["radius"] * math.cos(t), ir["radius"] * math.sin(t), ir["size"], "inner", a, ir["radius"])
    oa = P["outer_arc"]
    for i, pid in enumerate(BAYS):
        a = oa["centre_deg"] + (i - 2.5) * oa["step_deg"]
        t = math.radians(a)
        add(pid, oa["radius"] * math.cos(t), oa["radius"] * math.sin(t), oa["size"], "outer", a, oa["radius"])
    for pid, (sx, sy) in P["yards"]["screen_centres"].items():
        gx, gy = unproj(sx, sy)
        add(pid, gx, gy, P["yards"]["size"], "yard", math.degrees(math.atan2(gy, gx)), math.hypot(gx, gy))
    ordered = [rooms[p] for p in ORDER]
    n = 0
    for rm in ordered:
        for i, s in enumerate(rm["seats"]):
            n += 1
            s["n"], s["local"], s["id"] = n, i + 1, f"{rm['id']}:{i + 1}"

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


def room_polys(rm, lip):
    """(back polygons, front polygons), each (points, fill). Back: floor and the two far walls; front: the two near lips."""
    x0, y0, x1, y1, h, t = rm["x"], rm["y"], rm["x"] + rm["w"], rm["y"] + rm["d"], rm["wall_height"], 7
    back = [([proj(x0, y0), proj(x1, y0), proj(x1, y1), proj(x0, y1)], FLOOR),
            # north wall (inside face looks lower-left), west wall (inside face looks lower-right), with a top cap
            ([proj(x0, y0, 0), proj(x1, y0, 0), proj(x1, y0, h), proj(x0, y0, h)], FACE_L),
            ([proj(x0, y0, 0), proj(x0, y1, 0), proj(x0, y1, h), proj(x0, y0, h)], FACE_R),
            ([proj(x0, y0, h), proj(x1, y0, h), proj(x1, y0 + t, h), proj(x0, y0 + t, h)], TOP),
            ([proj(x0, y0, h), proj(x0, y1, h), proj(x0 + t, y1, h), proj(x0 + t, y0, h)], TOP)]
    front = [([proj(x0, y1, 0), proj(x1, y1, 0), proj(x1, y1, lip), proj(x0, y1, lip)], FACE_L),
             ([proj(x1, y0, 0), proj(x1, y1, 0), proj(x1, y1, lip), proj(x1, y0, lip)], FACE_R),
             ([proj(x0, y1, lip), proj(x1, y1, lip), proj(x1, y1 - t, lip), proj(x0, y1 - t, lip)], TOP),
             ([proj(x1, y0, lip), proj(x1, y1, lip), proj(x1 - t, y1, lip), proj(x1 - t, y0, lip)], TOP)]
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
        anchors["rooms"][pid] = {"bbox": bboxes[pid], "mask": f"room-masks/{pid}.png", "seats": sa}
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
    (OUT / "anchors.json").write_text(json.dumps(anchors, indent=1) + "\n")
    return {"anchors": anchors, "core_area": core_area}


def selfcheck(layout, res, report):
    assert report["core_share"] >= 0.25, f"core share {report['core_share']:.3f} < 0.25"
    anchors = res["anchors"]
    rects = {}
    for rm in layout["rooms"]:
        pid = rm["id"]
        x0, y0, x1, y1 = rm["x"], rm["y"], rm["x"] + rm["w"], rm["y"] + rm["d"]
        rects[pid] = (x0, y0, x1, y1)
        bx0, by0, bx1, by1 = anchors["rooms"][pid]["bbox"]
        assert 0 <= bx0 and 0 <= by0 and bx1 <= CANVAS_W and by1 <= CANVAS_H, f"{pid} bbox leaves the canvas"
        for s in rm["seats"]:
            assert x0 <= s["gx"] <= x1 and y0 <= s["gy"] <= y1, f"{s['id']} outside {pid} footprint"
        for s in anchors["rooms"][pid]["seats"]:
            assert bx0 <= s["x"] <= bx1 and by0 <= s["y"] <= by1, f"{s['id']} anchor outside {pid} bounds"
        # every room footprint stays off the containment circle
        nx, ny = min(max(0, x0), x1) if x0 <= 0 <= x1 else (x0 if x0 > 0 else x1), min(max(0, y0), y1) if y0 <= 0 <= y1 else (y0 if y0 > 0 else y1)
        assert math.hypot(nx, ny) > layout["core"]["radius"], f"{pid} overlaps the containment"
    ids = list(rects)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            ra, rb = rects[a], rects[b]
            assert ra[2] <= rb[0] or rb[2] <= ra[0] or ra[3] <= rb[1] or rb[3] <= ra[1], f"{a} and {b} footprints overlap"
    assert report["total_seats"] == sum(len(r["seats"]) for r in layout["rooms"])
    assert len(layout["rooms"]) == 13
    print("self-check passed")


def main():
    if "--no-generate" not in sys.argv:
        ART.mkdir(parents=True, exist_ok=True)
        LAYOUT.write_text(json.dumps(build_layout(), indent=1) + "\n")
    layout = json.loads(LAYOUT.read_text())
    PARAMS.update(layout["params"])
    res = render(layout)
    seat_pts = [(s["x"], s["y"]) for rm in res["anchors"]["rooms"].values() for s in rm["seats"]]
    mind = min(math.dist(a, b) for i, a in enumerate(seat_pts) for b in seat_pts[i + 1:])
    outputs = ["blockout-2400x1500.png", "blockout-back.png", "blockout-front.png", "blockout-390.png", "anchors.json"] + [
        f"room-masks/{rm['id']}.png" for rm in layout["rooms"]] + ["room-masks/core.png"]
    report = {
        "canvas": [CANVAS_W, CANVAS_H],
        "core_area_px": res["core_area"],
        "core_share": round(res["core_area"] / (CANVAS_W * CANVAS_H), 4),
        "total_seats": len(seat_pts),
        "seats_per_room": {rm["id"]: len(rm["seats"]) for rm in layout["rooms"]},
        "min_seat_anchor_distance_px": round(mind, 2),
        "sha256": {"design/art/layout.json": sha(LAYOUT), **{f"design/art/blockout/{o}": sha(OUT / o) for o in outputs}},
    }
    (OUT / "blockout-report.json").write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps(report, indent=1))
    selfcheck(layout, res, report)


if __name__ == "__main__":
    main()
