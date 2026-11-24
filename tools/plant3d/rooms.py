"""The eight room archetypes (design/art/blockout/tiles/tiles.json): control-room, work-bay, inspection, briefing, interface, lab, archive, yard.

Every room is authored in its own local layout frame: origin = the floor's back corner (where the two rear walls meet), +gx along the long
right wall, +gy along the short left wall (towards the viewer); walls are 7 thick, the two near walls are a low lip. Seat anchors come from
layout.json (the same grid the blockout uses); each anchor gets a chair (seat) or a floor mat (stand) and a face direction. Workers face the
rear (their backs and right cheek to the camera) so every screen on a desk or wall faces both the worker and the viewer; rows 0 face the
furniture on the rear wall, row 1 faces the mid-room desk or table. Everything is deterministic; no text anywhere.
"""
import json, math, time
from pathlib import Path
from mathutils import Matrix, Vector
import common as K
import kit
import scene as S
import worker as W
from scene import B, place, pol

LAY = K.LAYOUT
TILES = json.loads((K.ART / "blockout" / "tiles" / "tiles.json").read_text())
LIP = LAY["params"]["lip_height"]
T_WALL = 7.0
ARCH_TILE = {"control-room": "control-room-S", "work-bay": "work-bay-M", "inspection": "inspection-S", "briefing": "briefing-S",
             "interface": "interface-S", "lab": "lab-L", "archive": "archive-L", "yard": "yard-L"}
POSE_YAW = {"seated": -0.50, "stand": S.yaw_for(0.55, 1.0), "walk": S.yaw_for(1.0, 0.25)}

# crew per room (anchor number -> pose); standing poses go on "stand" anchors
CREW = {
    "your-office": {1: "needs-you", 2: "walking", 3: "working", 4: "waiting"},
    "process": {1: "working", 2: "working", 3: "waiting"},
    "mechanical": {1: "working", 2: "stuck", 3: "working"},
    "electrical": {1: "working", 2: "working", 3: "working"},
    "assurance": {1: "working", 2: "waiting", 3: "working"},
    "project-controls": {1: "working", 2: "working", 3: "waiting"},
    "verification": {1: "working", 2: "working", 3: "walking"},
    "review": {1: "waiting", 2: "waiting", 3: "working", 4: "working"},
    "interface": {1: "working", 2: "working", 3: "waiting"},
    "bench": {1: "working", 2: "working", 3: "working", 5: "working", 6: "stuck", 7: "working"},
}
LIT = set(CREW)


# ------------------------------------------------------------------------------------------------ small helpers
def seat_offsets(arch):
    """Seat anchors (n, x, y) relative to the room origin, from the first room of that archetype in layout.json."""
    rm = next(r for r in LAY["rooms"] if r["archetype"] == arch)
    return rm, [(i + 1, s["gx"] - rm["x"], s["gy"] - rm["y"]) for i, s in enumerate(rm["seats"])]


def chair(m, yaw=0.0):
    """Swivel chair, local frame: origin on the floor under the seat, seat top z=14, backrest behind (-y)."""
    m.push(Matrix.Rotation(yaw, 4, "Z"))
    for i in range(5):
        a = 2 * math.pi * i / 5 + 0.3
        m.box((math.cos(a) * 4.4, math.sin(a) * 4.4, 2.0), (8.8, 1.3, 0.9), "desk_dk", rot=(0, 0, a))
        m.cyl((math.cos(a) * 8.6, math.sin(a) * 8.6, 0), 1.0, 1.8, "desk_dk", 6, smooth=False)
    m.cyl((0, 0, 2.2), 1.0, 9.5, "metal", 8)
    m.box((0, 0, 12.6), (15.0, 14.0, 2.8), "chair", bevel=1.0)
    m.box((0, -6.8, 21.0), (13.0, 2.0, 11.0), "chair", bevel=0.8)
    m.box((0, -5.9, 15.6), (2.0, 1.6, 5.0), "metal")
    for sx in (-8.0, 8.0):
        m.box((sx, 0.3, 18.0), (1.2, 8.0, 1.2), "metal"); m.box((sx, -1.5, 15.5), (1.1, 1.1, 4.0), "metal")
    m.pop()


def stool_mat(m, w=20.0, d=13.0):
    m.box((0, 0, 0.3), (w, d, 0.6), "mat", bevel=0.2)


def kbd(m, c, scr_lit=True):
    m.box(c, (12, 4.4, 0.8), "desk_dk", bevel=0.2)
    m.box((c[0] + 9.0, c[1] + 0.3, c[2]), (2.4, 3.4, 0.9), "desk_dk")


def monitor(m, c, w, h, lit, yaw=0.0, back=True):
    """Flat monitor on a stand, screen facing the worker (and so the camera): local back (-y) face."""
    x, y, z = c
    m.box((x, y, z + 0.4), (8.0, 4.4, 0.8), "desk_dk", bevel=0.2)
    m.box((x, y + 0.8, z + 3.0), (1.8, 1.0, 5.0), "desk_dk")
    m.box((x, y + 1.2, z + 5.0 + h / 2), (w, 1.3, h), {"back": "screen_on" if lit else "screen_off", "*": "desk_dk"}, bevel=0.2)


def desk_ws(m, lit, width=40.0, monitors=1, plain=False):
    """Workstation desk in the chair-local frame (worker at the origin facing +y)."""
    m.box((0, 22, 24.2), (width, 17, 1.8), "desk_top", bevel=0.6)
    for sx in (-1, 1):
        m.box((sx * (width / 2 - 0.9), 22, 11.6), (1.4, 16, 23.2), "desk")
    m.box((0, 30.2, 17.0), (width - 3, 1.0, 12), "desk_dk")
    m.box((width / 2 - 8, 22, 9.5), (10, 15, 17), {"back": "desk", "*": "desk"}, bevel=0.3)
    if not plain:
        for k in range(monitors):
            monitor(m, ((k - (monitors - 1) / 2) * 15.0, 27.0, 25.1), 14.0 if monitors > 1 else 16.0, 9.5, lit)
        kbd(m, (0, 15.5, 25.5))


def pid_art(f, x0, y0, z0, z1, x1, lit, face="+gy"):
    """Piping-and-instrumentation drawing: a tank, branching lines, valve symbols and instrument bubbles drawn as flat marks on a wall board
    (north wall: board in x, face +gy at y)."""
    w, h = x1 - x0, z1 - z0
    L = "mimic" if lit else "screen_off"
    f.lbox(x0, y0, x1, y0 + 0.9, z0, z1, {"+gy": "panel", "*": "desk_dk"})
    f.lbox(x0, y0 + 0.9, x1, y0 + 1.3, z0, z0 + 1.4, "trim"); f.lbox(x0, y0 + 0.9, x1, y0 + 1.3, z1 - 1.4, z1, "trim")
    def seg(a, b, c, d_, t=0.8):
        f.lbox(x0 + a * w, y0 + 0.9, x0 + b * w, y0 + 1.2, z0 + c * h, z0 + c * h + t, L) if abs(c - d_) < 1e-6 else \
            f.lbox(x0 + a * w, y0 + 0.9, x0 + a * w + t, y0 + 1.2, z0 + min(c, d_) * h, z0 + max(c, d_) * h, L)
    seg(0.06, 0.94, 0.52, 0.52)
    for a, c, d_ in ((0.22, 0.52, 0.86), (0.44, 0.52, 0.18), (0.66, 0.52, 0.86), (0.82, 0.52, 0.18)):
        seg(a, 0, c, d_)
    seg(0.22, 0.44, 0.86, 0.86); seg(0.66, 0.9, 0.86, 0.86); seg(0.44, 0.82, 0.18, 0.18)
    f.lbox(x0 + 0.05 * w, y0 + 0.9, x0 + 0.13 * w, y0 + 1.3, z0 + 0.38 * h, z0 + 0.7 * h, L)             # vessel
    for a, c in ((0.33, 0.52), (0.55, 0.52), (0.74, 0.52), (0.44, 0.35), (0.22, 0.7)):                   # valve symbols (bow-tie)
        f.lbox(x0 + a * w - 1.6, y0 + 0.9, x0 + a * w + 1.6, y0 + 1.4, z0 + c * h - 1.4, z0 + c * h + 1.4, "trim")
    for a, c in ((0.28, 0.9), (0.62, 0.9), (0.83, 0.34), (0.46, 0.08)):                                    # instrument bubbles
        f.cyl(B(x0 + a * w, y0 + 1.0, z0 + c * h - 1.7), 2.2, 0.5, L, 12) if False else f.lbox(x0 + a * w - 2, y0 + 0.9, x0 + a * w + 2, y0 + 1.5, z0 + c * h - 2, z0 + c * h + 2, "trim")


def shell(m, f, w, d, h, floor_mat="floor", front_only=False):
    t = T_WALL
    wm_n = {"+gy": "wall", "-gy": "wall_out", "+gx": "hatch_r", "-gx": "wall_out", "top": "hatch_r", "bottom": "wall"}
    wm_w = {"+gx": "wall", "-gx": "wall_out", "+gy": "hatch_r", "-gy": "wall_out", "top": "hatch_r", "bottom": "wall"}
    lm = {"top": "hatch_r", "-gy": "wall", "-gx": "wall", "+gy": "wall_out", "+gx": "wall_out", "bottom": "wall"}
    if not front_only:
        m.lbox(0, 0, w, t, 0, h, wm_n)
        m.lbox(0, t, t, d, 0, h, wm_w)
        m.lbox(0, 0, w, d, -0.5, 0, {"top": floor_mat, "*": "floor"})
        # trims: skirting, picture rail and a conduit run on both rear walls
        f.lbox(t, t, w - 1, t + 0.8, 0, 3.5, "trim"); f.lbox(t, t, t + 0.8, d - 1, 0, 3.5, "trim")
        zr = h - 6
        f.lbox(t, t, w - 1, t + 1.4, zr, zr + 1.6, "trim"); f.lbox(t, t, t + 1.4, d - 1, zr, zr + 1.6, "trim")
        f.lbox(t, t, w - 1, t + 2.6, zr - 6.0, zr - 4.2, "metal_dk"); f.lbox(t, t, t + 2.6, d - 1, zr - 6.0, zr - 4.2, "metal_dk")
    m.lbox(0, d - t, w, d, 0, LIP, lm)
    m.lbox(w - t, t, w, d - t, 0, LIP, lm)


# ------------------------------------------------------------------------------------------------ archetypes
def run_console(m, f, kind, a0, ln, lit, annun=True, depth=22.0, hz=66.0, tag=0):
    """Walk-up control board run with a sloped bench, an upright instrument panel and an annunciator band. kind 'N' runs along the north
    wall (x from a0, length ln), 'W' along the west wall (y from a0). Returns nothing."""
    sgn = -1.0 if kind == "N" else 1.0
    mat_f = (Matrix.Translation((a0, -T_WALL, 0)) if kind == "N" else Matrix.Translation((T_WALL, -a0, 0)) @ Matrix.Rotation(-math.pi / 2, 4, "Z"))
    m.push(mat_f); f.push(mat_f)
    prof = [(sgn * depth, 0), (sgn * depth, 25), (sgn * 15.5, 31), (sgn * 11.5, 31), (sgn * 11.5, 0)]
    m.prism(prof, 0, ln, {"top": "desk_top", "front": "desk", "back": "desk", "*": "desk"})
    # upright panel and annunciator band (faces towards the room)
    m.box((ln / 2, sgn * 5.5, 36.0), (ln, 11.0, 10.0), {"*": "panel"}, bevel=0.0) if False else None
    m.box((ln / 2, sgn * 5.5, (31 + hz) / 2), (ln, 11.0, hz - 31), {"*": "panel"})
    n = max(1, int(ln // 15))
    cw = ln / n
    for i in range(n):
        x0 = i * cw + 1.2
        for r_, (z0, z1) in enumerate(((33, 41), (43.5, 51.5), (54, 61))):
            f.box((x0 + cw / 2 - 0.6, sgn * 11.2, (z0 + z1) / 2), (cw - 2.4, 0.5, z1 - z0), {"*": "desk_dk"})
            # instrument faces: dim grid of small squares, a few lit
            cols = 4
            for k in range(cols):
                lit_k = lit and ((i * 3 + k * 2 + r_) % 5 == 0)
                f.box((x0 + 1.2 + (k + 0.5) * (cw - 4.8) / cols, sgn * 11.65, (z0 + z1) / 2 + ((k + r_) % 2) * 0.8), ((cw - 4.8) / cols - 0.9, 0.4, (z1 - z0) - 3.0 - ((k + r_) % 2) * 1.6),
                      {"*": "led" if lit_k else "led_dk"})
    # annunciator window tiles along the top: nearly all dark, a few dim cyan
    for i in range(int(ln // 6)):
        for r_ in range(2):
            on = lit and ((i * 7 + r_ * 3 + tag) % 13 == 0)
            f.box((3.0 + i * 6.0, sgn * 11.5, 63.2 + r_ * 4.4), (4.9, 0.5, 3.4), {"*": "annun_lit" if on else "annun"})
    f.box((ln / 2, sgn * 5.5, hz + 0.6), (ln, 11.2, 1.2), "trim")
    f.pop(); m.pop()


def control_room(cx, m, f, w, d, h, lit):
    # horseshoe: north run, rear-corner block, west run (open towards the viewer)
    run_console(m, f, "N", 38.0, 84.0, lit, tag=1)
    run_console(m, f, "W", 38.0, 62.0, lit, tag=5)
    m.lbox(7, 7, 38, 38, 0, 31, {"*": "desk", "top": "desk_top"})                       # rear-corner block, chamfer-like step
    m.lbox(7, 7, 29, 29, 31, 66, {"*": "panel"})
    for k in range(2):
        f.lbox(10 + k * 9, 29.3, 17.5 + k * 9, 29.8, 36, 56, {"*": "led" if (lit and k == 0) else "led_dk"})
        f.lbox(29.3, 10 + k * 9, 29.8, 17.5 + k * 9, 36, 56, {"*": "led_dk"})
    for i in range(4):
        on = lit and i == 2
        f.lbox(9 + i * 5, 29.3, 13.4 + i * 5, 29.8, 63.0, 66.0, {"*": "annun_lit" if on else "annun"})
    # plant overview mimic on the north wall beside the end of the boards, level with the upper panels
    x0, x1 = 128.0, 153.0
    pid_art(f, x0, T_WALL, 34, 72, x1, lit)
    # SRO desk on the centre line, behind an aisle, wholly in the rear half
    m.lbox(38, 54, 122, 70, 0, 24.5, {"top": "desk_top", "*": "desk"}, 0.6)
    for sx, k in ((55, 0), (105, 1)):
        f.push(place(sx, 64, 0, 24.5)); monitor(f, (0, 0, 0), 15.0, 9.5, lit); f.pop()
    f.lbox(76, 58, 84, 66, 24.5, 32, {"*": "desk_dk", "top": "desk"})                       # binder stand
    for k in range(4):
        f.lbox(77 + k * 1.6, 58.5, 78.2 + k * 1.6, 65.5, 24.5, 30 + (k % 2) * 1.2, "paper")
    f.lbox(88, 60, 100, 68, 24.5, 25.2, "paper")                                              # logbook
    return [(1, "stand", "stand", 0.0), (2, "stand", "stand", 0.0), (3, "seat", "seat", 0.0), (4, "seat", "seat", 0.0)]


def work_bay(cx, m, f, w, d, h, lit):
    # engineering workstation bench against the long north wall (three positions on the seat grid, two with monitors)
    m.lbox(8, 7, 160, 27, 0, 24.0, {"top": "desk_top", "*": "desk"}, 0.6)
    m.lbox(8, 8, 160, 26, 0, 2, "desk_dk")
    for x in (37.7, 85.0):
        f.push(place(x, 19, 0, 24.0)); monitor(f, (0, 0, 0), 16.0, 10.5, lit); kbd(f, (0, 9.5, 0.1)); f.pop()
    f.push(place(132.3, 19, 0, 24.0)); kbd(f, (0, 9.5, 0.1)); f.lbox(-9, -4, 9, 3, 0, 1.0, "paper"); f.pop()
    # large drawing flat at the rear-corner end, work-package binders beside it
    f.lbox(9, 9, 25, 25, 24.0, 24.5, "paper")
    f.lbox(10.5, 11, 23.5, 12, 24.5, 24.6, "paper_dk"); f.lbox(10.5, 15, 22, 16, 24.5, 24.6, "paper_dk")
    for k in range(5):
        f.lbox(26.2 + k * 1.2, 10, 27.2 + k * 1.2, 24, 24.0, 31 - (k % 2) * 1.5, "desk_top" if k % 2 else "metal")
    # P&ID board above the bench
    pid_art(f, 62, T_WALL, 44, 82, 150, lit)
    # shallow vertical plan rack on the west wall, drawings hanging edge-on in broad groups
    m.lbox(7, 38, 19, 104, 0, 3, "desk_dk")
    f.lbox(7, 38, 9, 104, 3, 66, "metal_dk")
    for g in range(3):
        y0 = 42 + g * 21
        f.lbox(9, y0, 11, y0 + 17, 60, 64, "metal")
        for k in range(8):
            f.lbox(9.5, y0 + 1 + k * 2.0, 18, y0 + 1.6 + k * 2.0, 6, 59, "paper" if (k % 3) else "paper_dk")
    f.lbox(9, 38, 18.5, 40, 4, 62, "metal_dk"); f.lbox(9, 102, 18.5, 104, 4, 62, "metal_dk")
    return [(1, "seat", "seat", 0.0), (2, "seat", "seat", 0.0), (3, "seat", "seat", 0.0), (4, "stand", "stand", 0.0), (5, "stand", "stand", 0.0), (6, "stand", "stand", 0.0)]


def inspection(cx, m, f, w, d, h, lit):
    m.lbox(36, 7, 152, 27, 0, 25.0, {"top": "desk_top", "*": "desk"}, 0.6)
    # QA/QC bench top: granite surface plate, gauge blocks, portal test rig with a dial gauge and display
    f.lbox(100, 10, 144, 24, 25.0, 26.3, "metal_dk")
    for k in range(5):
        f.lbox(104 + k * 6, 14, 108.6 + k * 6, 18, 26.3, 29 + k, "steel")
    for x in (102, 140):
        f.lbox(x, 10, x + 2.2, 12.2, 26.3, 52, "steel"); f.lbox(x, 21.8, x + 2.2, 24, 26.3, 52, "steel")
    f.lbox(101, 10, 143, 12.2, 50, 53, "metal"); f.lbox(101, 21.8, 143, 24, 50, 53, "metal"); f.lbox(118, 10, 125, 24, 50, 53, "metal")
    f.cyl(B(121.5, 17, 33), 1.0, 17, "steel", 6)
    f.lbox(128, 15, 138, 17, 54, 62, {"+gy": "screen_on" if lit else "screen_off", "*": "desk_dk"})
    for x, ww in ((38.5, 16), (68, 16)):
        f.push(place(x + 8, 19, 0, 25.0)); monitor(f, (0, 0, 0), ww, 9.5, lit); kbd(f, (0, 9.0, 0.1)); f.pop()
    f.lbox(83, 10, 96, 24, 25.0, 25.5, "paper")                                                # inspection records
    # calibration cart (rolling), instruments on its top shelf
    m.lbox(9, 34, 31, 56, 12, 14, "desk_top", 0.4)
    m.lbox(9, 34, 31, 56, 24, 26, "desk_top", 0.4)
    for cx_, cy_ in ((10, 35), (30, 35), (10, 55), (30, 55)):
        m.lbox(cx_ - 0.7, cy_ - 0.7, cx_ + 0.7, cy_ + 0.7, 3, 26, "metal")
        m.cyl(B(cx_, cy_, 0), 1.6, 3, "desk_dk", 8, smooth=False)
    f.lbox(11, 36, 22, 46, 26, 33, {"top": "desk", "+gy": "screen_on" if lit else "screen_off", "*": "desk_dk"}, 0.3)
    f.lbox(24, 38, 29, 50, 26, 30, "metal"); f.lbox(12, 48, 28, 54, 14, 21, "metal_dk")
    f.lbox(9, 56, 31, 57, 26, 38, "metal"); f.lbox(30, 34, 31, 57, 26, 38, "metal")              # push handle frame
    return [(1, "seat", "seat", 0.0), (2, "seat", "seat", 0.0), (3, "stand", "stand", 0.0), (4, "stand", "stand", 0.0)]


def briefing(cx, m, f, w, d, h, lit):
    # work control centre table with chairs both sides, wall board of work cards
    m.lbox(36, 54, 124, 76, 0, 24.0, {"top": "desk_top", "*": "desk_dk"}, 0.6)
    m.lbox(40, 58, 120, 72, 0, 22.4, "desk_dk")
    for x in (55, 105):
        f.push(place(x, 62, 0, 24.0)); monitor(f, (0, 0, 0), 13.0, 8.5, lit); f.pop()
    for k in range(4):
        f.lbox(76 + k * 4.4, 58, 79.6 + k * 4.4, 70, 24.0, 24.8 + (k % 2) * 0.6, "paper")
    f.lbox(40, 66, 52, 70, 24.0, 24.9, "paper"); f.lbox(108, 62, 120, 70, 24.0, 24.9, "paper_dk")
    x0, x1, z0, z1 = 22.0, 140.0, 28.0, 74.0
    f.lbox(x0, T_WALL, x1, T_WALL + 0.9, z0, z1, {"+gy": "panel", "*": "desk_dk"})
    f.lbox(x0, T_WALL + 0.9, x1, T_WALL + 1.4, z1 - 5, z1, "trim")
    ncol = 5
    cw = (x1 - x0) / ncol
    for c in range(ncol):
        f.lbox(x0 + c * cw + 2, T_WALL + 0.9, x0 + (c + 1) * cw - 2, T_WALL + 1.3, z1 - 11, z1 - 6.4, "annun_lit" if (lit and c % 2 == 0) else "annun")
        for r in range(3):
            if (c * 3 + r) % 4 != 3 or c < 2:
                f.lbox(x0 + c * cw + 3.2, T_WALL + 0.9, x0 + (c + 1) * cw - 3.2, T_WALL + 1.3, z1 - 19.5 - r * 8.6, z1 - 13.5 - r * 8.6,
                       "led" if (lit and (c + r) % 3 == 0) else "led_dk")
    return [(1, "seat", "seat", math.pi), (2, "seat", "seat", math.pi), (3, "seat", "seat", 0.0), (4, "seat", "seat", 0.0)]


def interface(cx, m, f, w, d, h, lit):
    m.lbox(10, 60, 150, 68, 0, 28.0, {"top": "desk_top", "*": "desk"}, 0.6)            # service counter
    m.lbox(10, 68, 150, 69, 22, 28.5, "trim")
    for x in (47, 113):
        # rear desk (staff facing the counter) and front desk (visitor side), seat anchors on either side of the counter
        m.lbox(x - 20, 46, x + 20, 58, 0, 24.0, {"top": "desk_top", "*": "desk"}, 0.6)
        f.push(place(x, 52, 0, 24.0)); monitor(f, (0, 0, 0), 14.0, 9.0, lit); f.pop()
        m.lbox(x - 20, 74, x + 20, 84, 0, 24.0, {"top": "desk_top", "*": "desk"}, 0.6)
        f.push(place(x, 79, math.pi, 24.0)); monitor(f, (0, 0, 0), 14.0, 9.0, lit); f.pop()
        f.lbox(x - 9, 61, x + 9, 66, 28.0, 28.8, "paper")
    f.lbox(76, 61, 84, 66, 28.0, 36, {"*": "desk_dk", "top": "desk"})
    return [(1, "seat", "seat", math.pi), (2, "seat", "seat", math.pi), (3, "seat", "seat", 0.0), (4, "seat", "seat", 0.0)]


def lab(cx, m, f, w, d, h, lit):
    # I&C shop: long instrument bench with scopes and power supplies, an island bench, parts bins
    m.lbox(10, 7, 232, 26, 0, 26.0, {"top": "desk_top", "*": "desk"}, 0.6)
    f.lbox(8, 7, 232, 9, 26, 31, "metal_dk")
    for k, x in enumerate((40.5, 93.5, 146.5, 199.5)):
        f.push(place(x, 19, 0, 26.0))
        f.box((0, 0.6, 5.0), (20, 8, 8.5), {"back": "desk", "*": "desk_dk"}, bevel=0.3)
        f.box((0, -0.7, 5.0), (17, 0.4, 5.5), {"back": "screen_on" if lit else "screen_off", "*": "desk_dk"})
        f.box((13, 1, 2.8), (6, 7, 5.6), "metal_dk", bevel=0.3); f.box((13, -2.6, 3.6), (4.8, 0.4, 2.2), "led" if lit else "led_dk")
        f.box((-14, 2, 2.0), (8, 8, 4.0), "metal", bevel=0.3)
        kbd(f, (0, -6.3, 0.4))
        f.pop()
    for k in range(5):
        f.lbox(12 + k * 11, 8, 20 + k * 11, 13, 31, 38, {"+gy": "rack_door" if False else "desk", "*": "desk_dk"})
    m.lbox(22, 62, 220, 78, 0, 26.0, {"top": "desk_top", "*": "desk"}, 0.6)
    for k, x in enumerate((44, 96, 148, 198)):
        f.push(place(x, 70, math.pi, 26.0)); f.box((0, 0, 4.0), (22, 6, 7.0), {"back": "desk", "*": "desk_dk"}, bevel=0.3)
        f.box((0, 3.1, 4.8), (17, 0.4, 4.6), {"back": "screen_on" if lit else "screen_off", "*": "desk_dk"})
        f.pop()
        f.lbox(x + 14, 64, x + 24, 72, 26.0, 29.5, "metal")
        f.lbox(x - 24, 64, x - 14, 72, 26.0, 30.5, "metal_dk")
    for k in range(6):
        f.lbox(9, 36 + k * 13, 20, 46 + k * 13, 0, 11 + (k % 2) * 3, {"top": "desk_top", "*": "desk_dk"})
    return [(i + 1, "seat", "seat", 0.0) for i in range(4)] + [(i + 5, "seat", "seat", 0.0) for i in range(4)]


def archive(cx, m, f, w, d, h, lit):
    # records vault: rows of shelving (bays with box files) along the north wall and an island, cabinet run on the west wall, reading desks
    for r_, (y0, y1) in enumerate(((7, 22), (58, 70))):
        for b in range(8 if r_ == 0 else 5):
            x0 = (24 if r_ == 0 else 100) + b * (26.0 if r_ == 0 else 24.0)
            wid = 24.0 if r_ == 0 else 22.0
            f.lbox(x0, y0, x0 + wid, y1, 0, 37, {"+gy": "rack_door" if False else "desk_dk", "*": "metal_dk"})
            for lv in range(4):
                f.lbox(x0 + 0.5, y1 - 0.2, x0 + wid - 0.5, y1 + 0.2, 1.5 + lv * 9.0, 2.5 + lv * 9.0, "metal")
                for k in range(int(wid // 4.2)):
                    f.lbox(x0 + 1.0 + k * 4.2, y1 + 0.2, x0 + 4.6 + k * 4.2, y1 + 4.5 if r_ == 0 else y1 + 3.2, 2.5 + lv * 9.0, 10.0 + lv * 9.0,
                           "desk_top" if (k + lv + b) % 3 else "paper_dk")
    for k in range(5):
        m.lbox(8, 30 + k * 18, 22, 44 + k * 18, 0, 20 if k % 2 == 0 else 16, {"top": "desk_top", "*": "desk"}, 0.4)
        f.lbox(8.2, 33 + k * 18, 8.9 + 13.8, 33.6 + k * 18, 8, 8.6, "metal") if False else None
    for x in (40.5, 93.5, 146.5, 199.5):
        m.lbox(x - 18, 28, x + 18, 38, 0, 24.0, {"top": "desk_top", "*": "desk"}, 0.5)
        f.push(place(x, 33, 0, 24.0)); monitor(f, (0, 0, 0), 14.0, 9.0, lit); f.pop()
    return [(i + 1, "seat", "seat", 0.0) for i in range(4)] + [(i + 5, "stand", "stand", 0.0) for i in range(4)]


def yard(cx, m, f, w, d, h, lit):
    # roofless radwaste yard: palletised drums, a shielded cask on its cradle, cyan/white boundary rope on stanchions
    for i in range(4):
        for j in range(3):
            dx, dy = 150 + i * 19, 12 + j * 20
            m.lbox(dx - 8, dy - 8, dx + 8, dy + 8, 0, 3, "desk_dk")
            m.cyl(B(dx, dy, 3), 7, 19, "drum", 14)
            for zz in (8, 15):
                m.cyl(B(dx, dy, zz), 7.35, 1.2, "metal", 14)
            m.cyl(B(dx, dy, 22), 6.6, 0.6, "metal_dk", 14)
    cxx, cyy = 70, 24
    m.lbox(cxx - 36, cyy - 11, cxx + 36, cyy + 11, 0, 5, "desk_dk")
    for xx in (-22, 22):
        m.lbox(cxx + xx - 4, cyy - 9, cxx + xx + 4, cyy + 9, 5, 12, "metal_dk")
    m.cone(B(cxx - 30, cyy, 21), B(cxx + 30, cyy, 21), 14, 14, {"side": "cask", "cap": "metal"}, 24)
    for xx in (-20, -8, 4, 16):
        m.cone(B(cxx + xx, cyy, 21), B(cxx + xx + 2.0, cyy, 21), 14.6, 14.6, "cask_band", 24, False)
    m.cone(B(cxx + 30, cyy, 21), B(cxx + 36, cyy, 21), 9, 9, "metal", 16)
    for z in (6.5,):
        pass
    # boundary rope
    pts = [(14, 52), (226, 52)]
    post_pos = []
    rp = cx.mesher("rope_y"); rq = cx.mesher("rope_post")
    segs = [((14, 52), (226, 52)), ((14, 52), (14, 12)), ((226, 52), (226, 12))]
    for (a, b) in segs:
        n = max(2, int(math.hypot(b[0] - a[0], b[1] - a[1]) // 30))
        P_ = []
        for k in range(n + 1):
            x = a[0] + (b[0] - a[0]) * k / n; y = a[1] + (b[1] - a[1]) * k / n
            rq.cyl(B(x, y, 0), 1.0, 15, "metal", 6, smooth=False)
            rq.ellipsoid(B(x, y, 15.6), (1.7, 1.7, 1.7), "rope")
            P_.append(Vector((x, -y, 13.2)))
        for k in range(n):
            q0, q1 = P_[k], P_[k + 1]
            seg = [q0 + (q1 - q0) * s / 6 + Vector((0, 0, -2.0 * 4 * (s / 6) * (1 - s / 6))) for s in range(7)]
            rp.tube(seg, 0.5, "rope" if k % 2 == 0 else "rope2", 5, caps=False)
    return [(i + 1, "stand", "stand", 0.0) for i in range(8)], rp, rq


BUILD = {"control-room": control_room, "work-bay": work_bay, "inspection": inspection, "briefing": briefing, "interface": interface,
         "lab": lab, "archive": archive, "yard": yard}


# ------------------------------------------------------------------------------------------------ assembly
def build_room(cx, rid, arch, ox, oy, w, d, h, lit, crew=None, reg=None, front_only=False, with_crew=True):
    reg = reg if reg is not None else cx.reg["rooms"].setdefault(rid, [])
    m = cx.mesher(f"room_{rid}"); f = cx.mesher(f"roomf_{rid}")
    m.push(Matrix.Translation((ox, -oy, 0))); f.push(Matrix.Translation((ox, -oy, 0)))
    shell(m, f, w, d, h, "floor_yard" if arch == "yard" else "floor", front_only)
    if front_only:
        m.pop(); f.pop()
        cx.done(m, "main", reg); cx.done(f, "fine", reg)
        return []
    out = BUILD[arch](cx, m, f, w, d, h, lit)
    extra = None
    if arch == "yard":
        anchors, rp, rq = out
        for mm in (rp, rq):
            mm.xf = Matrix.Translation((ox, -oy, 0))
        # the rope meshers were authored in the room frame without our push: shift their vertices instead
        for mm in (rp, rq):
            for v in mm.bm.verts:
                v.co += Vector((ox, -oy, 0))
        cx.done(rp, "none", reg); cx.done(rq, "fine", reg)
    else:
        anchors = out
    # seat anchors: chair or mat
    rm0, offs = seat_offsets(arch)
    for (n, kind, _k2, yaw), (n2, sx, sy) in zip(anchors, offs):
        if kind == "seat":
            f.push(place(sx, sy, yaw)); chair(f); f.pop()
        elif arch != "yard" or True:
            f.push(place(sx, sy, 0)); stool_mat(f); f.pop()
    m.pop(); f.pop()
    cx.done(m, "main", reg); cx.done(f, "fine", reg)
    if with_crew and lit and crew:
        crew_build(cx, rid, anchors, offs, ox, oy, crew)
    return anchors


def crew_build(cx, rid, anchors, offs, ox, oy, crew, accent="accent"):
    g = cx.mesher(f"crew_{rid}")
    for (n, kind, _k, yaw), (n2, sx, sy) in zip(anchors, offs):
        pose = crew.get(n)
        if not pose:
            continue
        if kind == "seat":
            g.push(place(ox + sx, oy + sy, yaw - 0.5 if abs(yaw) < 1e-6 else yaw + 0.5)); W.build_worker(g, pose, accent); g.pop()
        else:
            yw = POSE_YAW["walk"] if pose == "walking" else POSE_YAW["stand"]
            g.push(place(ox + sx, oy + sy, yw)); W.build_worker(g, pose, accent); g.pop()
            if pose == "needs-you":
                ring = cx.mesher(f"ring_{rid}")
                ring.sector(7.5, 9.0, 0, 360, 0.0, 0.5, 40, {"*": "amber_ring"}, closed=True)
                ring.sector(13.5, 14.5, 0, 360, 0.0, 0.5, 40, {"*": "amber_ring"}, closed=True)
                for v in ring.bm.verts:
                    v.co += Vector((ox + sx, -(oy + sy), 0))
                cx.done(ring, "none", cx.reg["crew"].setdefault(rid, []))
    cx.done(g, "fine", cx.reg["crew"].setdefault(rid, []))


def build_all(cx, state, crew=True, only=None, lit_ids=None):
    for rm in LAY["rooms"]:
        if only and rm["id"] not in only:
            continue
        lit = rm["id"] in (lit_ids if lit_ids is not None else LIT)
        build_room(cx, rm["id"], rm["archetype"], rm["x"], rm["y"], rm["w"], rm["d"], rm["wall_height"], lit, CREW.get(rm["id"]) if lit else None,
                   with_crew=crew)


# ------------------------------------------------------------------------------------------------ tiles and sprites
def tile_camera_centre(spec):
    """Canvas point (plate px) that must land in the middle of the tile image so the room's back corner (layout 0,0 -> proj) hits pad_anchor."""
    ax, ay = spec["pad_anchor"]; k = spec["scale"]
    cw, ch = spec["canvas"]
    p0 = K.proj(0, 0, 0)
    return (p0[0] - (ax - cw / 2) / k, p0[1] - (ay - ch / 2) / k)


def render_tiles(out, samples, R, only=None):
    times = {}
    for arch, key in ARCH_TILE.items():
        if only and key not in only and arch not in only:
            continue
        spec = TILES["tiles"][key]
        rm0 = next(r for r in LAY["rooms"] if r["archetype"] == arch)
        fp = spec["footprint"]
        for variant in ("lit", "dark", "front"):
            R.reset()
            book = S.make_book("healthy")
            cx = S.Ctx(book)
            build_room(cx, "t", arch, 0, 0, fp["w"], fp["d"], fp["wall_height"], variant != "dark", None, front_only=(variant == "front"), with_crew=False)
            R.render_pair(cx, out, f"tile_{key}_{variant}", spec["scale"], samples, "healthy", True, glow_pass=False, res=tuple(spec["canvas"]),
                          cam_centre=tile_camera_centre(spec), tscale=1.0)
            times[f"{key}_{variant}"] = True
    return times


def render_sprites(out, samples, R):
    """Worker sprites, transparent, 520x520 at scale 4 (a standing worker is ~226 px tall). Anchor = floor point under the hips, written to
    raw/sprites.json. Seated poses are shown on a bare chair (the chair is part of the sprite sheet only: sprites/*_chair.png has it, the
    plain sprite does not) facing the in-plant direction; `face` renders show every pose turned to the camera to check the face."""
    import bpy
    meta = {}
    for variant in ("plant", "face"):
        for pose in ("working", "waiting", "stuck", "needs-you", "walking"):
            R.reset()
            book = S.make_book("healthy")
            cx = S.Ctx(book)
            f = cx.mesher("spr")
            seated = W.POSES[pose]["seated"]
            if variant == "plant":
                yaw = -0.5 if seated else (POSE_YAW["walk"] if pose == "walking" else POSE_YAW["stand"])
            else:
                yaw = S.yaw_for(0.55, 1.0) if not seated else S.yaw_for(0.55, 1.0)
            f.push(place(0, 0, yaw)); W.build_worker(f, pose, "accent"); f.pop()
            cx.done(f, "fine", cx.reg["site"])
            if pose == "needs-you":
                ring = cx.mesher("ring"); ring.sector(7.5, 9.0, 0, 360, 0, 0.5, 40, {"*": "amber_ring"}, closed=True)
                cx.done(ring, "none", cx.reg["site"])
            sc_ = 4.0
            centre = K.proj(0, 0, 26)
            R.render_pair(cx, out, f"sprite_{variant}_{pose}", sc_, samples + 8, "healthy", True, glow_pass=False, res=(520, 520), cam_centre=centre, tscale=2.6)
            meta[f"{variant}_{pose}"] = {"anchor_px": [260, 260 + 26 * sc_], "scale": sc_, "seated": seated, "yaw_rad": yaw}
    (out / "raw" / "sprites.json").write_text(json.dumps(meta, indent=1))
    return {"sprites": True}
