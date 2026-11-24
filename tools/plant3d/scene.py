"""Scripted plant scene built from design/art/layout.json. Everything is parametric and deterministic (no randomness).

build(opts) -> registry of Blender objects grouped for the renderer: site, rooms[id], crew[id], plus glow-capable materials in opts['book'].
Archetypes: control-room (your-office: horseshoe boards, overview panel, supervisor desk) and work-bay (the other 12), each topped by a
small per-room prop set (QA bench, work-control board, I&C shop, records vault, radwaste yard). Containment carries vessel/cavity, vessel head,
steam generators with reactor coolant pumps, polar crane, operating deck, catwalk and pipework. Warm colour exists only as the needs-you lamp.
"""
import math
import bpy
from mathutils import Matrix, Vector
import common as K
import kit
from kit import Mesher, Book, mix, P, WHITE, PALE
import worker as W

LAY = K.LAYOUT
CORE = LAY["core"]
R = CORE["radius"]
ROOMS = K.rooms()
GROUND_Z = -6.0
CREW = {
    "your-office": {1: "working", 2: "working", 4: "working", "stand": (3, "needs-you")},
    "process": {1: "working", 2: "working", 3: "waiting", 5: "working", 6: "working"},
    "mechanical": {1: "working", 2: "stuck", 4: "working", 5: "waiting"},
    "electrical": {2: "working", 3: "working", 5: "working"},
    "assurance": {1: "working", 3: "waiting", 4: "working"},
    "project-controls": {1: "working", 2: "working", 4: "waiting"},
    "verification": {1: "working", 2: "working", "walk": True},
    "review": {1: "waiting", 2: "waiting", 3: "working"},
}
LIT = set(CREW)
ACCENTS = ["accent"]


def pol(r, a):
    return (r * math.cos(math.radians(a)), r * math.sin(math.radians(a)))


def B(gx, gy, z=0.0):
    return Vector((gx, -gy, z))


def place(gx, gy, yaw=0.0, z=0.0):
    return Matrix.Translation((gx, -gy, z)) @ Matrix.Rotation(yaw, 4, "Z")


def yaw_for(dx, dy):
    return math.atan2(-dx, -dy)


# ------------------------------------------------------------------------------------------------ materials
def make_book(state):
    b = Book()
    sf, lw, gl, sc, gd = P["surface"], P["linework"], P["core-glow"], P["screen"], P["ground"]
    scram = state == "scram"
    t = b.tone
    t("ground", gd, amb=None, ao=0, pat=("grid", 100.0, 0.9), pat_col=mix(gd, lw, 0.32))
    t("road", mix(gd, sf, 0.9), amb=None, ao=0, pat=("grid", 100.0, 0.9), pat_col=mix(gd, lw, 0.32))
    t("floor", mix(sf, lw, 0.28), amb=0.55, ao=0.0, pat=("grid", 20.0, 0.8), pat_col=mix(sf, lw, 0.62))
    t("floor_lit", mix(sf, lw, 0.34), amb=0.55, ao=0.0, pat=("grid", 20.0, 0.8), pat_col=mix(sf, sc, 0.55), emit=sc, emit_k=0.05)
    t("pad", mix(sf, lw, 0.2), amb=0.8, ao=0.0)
    t("wall", mix(sf, lw, 0.5), pat=("seam", 30.0, 30.0, 0.7), pat_col=mix(sf, lw, 0.45))
    t("wall_out", mix(sf, lw, 0.36), pat=("seam", 30.0, 30.0, 0.7), pat_col=mix(sf, lw, 0.3), ao=0.2)
    t("hatch", mix(lw, PALE, 0.05), amb=0.6, ao=0, pat=("hatch", 3.4, 1.1), pat_col=mix(lw, PALE, 0.55))
    t("trim", mix(lw, PALE, 0.08))
    t("metal", mix(lw, PALE, 0.28))
    t("metal_dk", mix(sf, lw, 0.6))
    t("desk", mix(lw, PALE, 0.2)); t("desk_top", mix(lw, PALE, 0.38)); t("desk_dk", mix(sf, lw, 0.6))
    t("chair", mix(lw, PALE, 0.08)); t("kbd", mix(sf, lw, 0.9), emit=sc, emit_k=0.12)
    t("rack", mix(lw, PALE, 0.3)); t("rack_door", mix(sf, lw, 0.95), pat=("seam", 8.0, 12.0, 0.6), pat_col=mix(sf, lw, 0.4))
    t("cable", mix(sf, lw, 0.5))
    on = 0.0 if scram else 1.0
    t("screen_on", mix(sc, PALE, 0.15), amb=None, ao=0, emit=sc, emit_k=1.7 * (0.7 if scram else 1.0), emit_pat="bars")
    t("screen_off", mix(sf, lw, 0.4), amb=None, ao=0, emit=sc, emit_k=0.10, emit_pat="bars")
    t("led", mix(sc, PALE, 0.3), amb=None, ao=0, emit=sc, emit_k=1.1)
    t("pipe_st", mix(lw, PALE, 0.3), emit=sc, emit_k=0.16); t("pipe_hold", mix(lw, PALE, 0.15), emit=sc, emit_k=0.05)
    t("flange", mix(lw, PALE, 0.5))
    t("line_em", PALE, amb=None, ao=0, emit=PALE, emit_k=0.45)
    t("rope", PALE, amb=None, ao=0, emit=PALE, emit_k=1.6)
    t("vessel", mix(lw, PALE, 0.2)); t("vessel_in", mix(sf, lw, 0.6)); t("concrete", mix(sf, lw, 0.42), ao=0.4)
    t("steel", mix(lw, PALE, 0.3)); t("dome", mix(lw, PALE, 0.45))
    t("core_floor", mix(gd, sf, 0.9), amb=0.4, ao=0.0, pat=("grid", 30.0, 0.9), pat_col=mix(sf, lw, 0.7),
      emit=(P["trip"] if scram else gl), emit_k=(0.10 if scram else 0.22), radial=(None, 1.0, 150.0))
    wcol, wk = (P["trip"], 0.3) if scram else (gl, 0.22)
    t("water", mix(wcol, (0.0, 0.1, 0.2), 0.3), amb=None, ao=0, emit=wcol, emit_k=wk, emit_pat="voronoi", alpha=0.40)
    t("water_floor", mix(sf, wcol, 0.2), amb=None, ao=0, emit=wcol, emit_k=0.10 if not scram else 0.03)
    t("beam", wcol, amb=None, ao=0, emit=wcol, emit_k=0.9 if not scram else 0.0, alpha=0.10)
    t("rod", mix(gl, WHITE, 0.45), amb=None, ao=0, emit=mix(gl, WHITE, 0.4), emit_k=(0.2 if scram else 3.6))
    t("rod_ctl", mix(lw, PALE, 0.8), amb=None, ao=0, emit=mix(gl, WHITE, 0.6), emit_k=(0.1 if scram else 2.2))
    t("trip", P["trip"], amb=None, ao=0, emit=P["trip"], emit_k=4.5 if scram else 0.0)
    t("rim_em", PALE, amb=None, ao=0, emit=(P["trip"] if scram else PALE), emit_k=(3.0 if scram else 0.8))
    # workers
    t("suit", mix(sf, WHITE, 0.82), amb=0.34, ao=0.35); t("suit_dk", mix(sf, lw, 0.9))
    t("hood", mix(sf, WHITE, 0.9), amb=0.34, ao=0.35); t("visor", mix(gd, sf, 0.5), amb=0.5, ao=0, emit=gl, emit_k=0.35)
    t("glove", mix(sc, WHITE, 0.15), amb=0.4); t("shoe", mix(sf, WHITE, 0.62), amb=0.34)
    t("badge", mix(sc, WHITE, 0.4), amb=None, ao=0, emit=PALE, emit_k=0.9); t("accent", mix(sc, PALE, 0.3), amb=0.6, ao=0, emit=sc, emit_k=0.5)
    t("lamp", P["needs-you"], amb=None, ao=0, emit=P["needs-you"], emit_k=7.0)
    t("amber_ring", P["needs-you"], amb=None, ao=0, emit=P["needs-you"], emit_k=1.6)
    # outside the ring (dimmer, background plant)
    t("bg", mix(sf, lw, 0.45), ao=0.3); t("bg_hatch", mix(sf, lw, 0.45), amb=0.7, pat=("hatch", 4.0, 1.0), pat_col=mix(lw, PALE, 0.5))
    t("drum", mix(lw, PALE, 0.25)); t("cask", mix(lw, PALE, 0.5))
    return b


# ------------------------------------------------------------------------------------------------ helpers
class Ctx:
    def __init__(s, book):
        s.book = book
        s.scn = bpy.context.scene
        s.c_main = bpy.data.collections.new("L_MAIN"); s.c_fine = bpy.data.collections.new("L_FINE"); s.c_none = bpy.data.collections.new("NOLINE")
        for c in (s.c_main, s.c_fine, s.c_none):
            s.scn.collection.children.link(c)
        s.reg = {"site": [], "rooms": {}, "crew": {}}

    def mesher(s, name):
        return Mesher(name, s.book)

    def done(s, m, kind, group):
        cols = {"main": [s.c_main], "fine": [s.c_fine], "none": [s.c_none]}[kind]
        ob = m.finish(m.name, cols)
        group.append(ob)
        return ob


def arc_pts(r, a0, a1, z, n):
    return [B(r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), r * math.sin(math.radians(a0 + (a1 - a0) * k / n)), z) for k in range(n + 1)]


def flange_ring(m, p, tan, r, mat="flange", t=2.2):
    m.cone(p - tan * t / 2, p + tan * t / 2, r, r, mat, 10, True, False)


# ------------------------------------------------------------------------------------------------ furniture
def chair(m):
    for i in range(5):
        a = 2 * math.pi * i / 5 + 0.3
        c = (math.cos(a) * 4.8, math.sin(a) * 4.8, 2.3)
        m.box(c, (9.6, 1.5, 1.0), "desk_dk", rot=(0, 0, a))
        m.cyl((math.cos(a) * 9.4, math.sin(a) * 9.4, 0), 1.1, 2.0, "desk_dk", 6, smooth=False)
    m.cyl((0, 0, 2.5), 1.1, 11, "metal", 8)
    m.box((0, 0, 14.4), (16, 15, 3.0), "chair", bevel=1.0)
    m.box((0, -7.4, 24.0), (14, 2.2, 11), "chair", bevel=0.8)
    m.box((0, -6.6, 18.0), (2.0, 1.6, 7), "metal")
    for sx in (-8.8, 8.8):
        m.box((sx, 0.5, 20.0), (1.3, 9, 1.3), "metal"); m.box((sx, -1.5, 17.0), (1.2, 1.2, 5), "metal")


def desk(m, screen="screen_on", monitor=True, width=40.0):
    m.box((0, 22, 24.4), (width, 20, 2.2), "desk_top", bevel=0.8)
    for sx in (-1, 1):
        m.box((sx * (width / 2 - 0.9), 22, 11.2), (1.6, 18, 22), "desk")
    m.box((0, 31.0, 16.5), (width - 4, 1.2, 11), "desk_dk")
    m.box((width / 2 - 8, 22, 10.0), (11, 17, 18), {"back": "desk_dk", "*": "desk"})
    m.box((width / 2 - 8, 13.4, 14.5), (6, 0.5, 0.7), "metal"); m.box((width / 2 - 8, 13.4, 7.5), (6, 0.5, 0.7), "metal")
    if monitor:
        m.box((0, 26.5, 26.2), (9, 5, 0.8), "desk_dk"); m.box((0, 27.5, 30), (1.8, 1.2, 7), "desk_dk")
        m.box((0, 27.2, 37.6), (30, 1.5, 15.5), {"back": screen, "*": "desk_dk"}, rot=(-0.14, 0, 0))
        m.box((-17.5, 25.0, 33.5), (7, 1.1, 10), {"back": screen, "*": "desk_dk"}, rot=(-0.14, 0, 0.35))
    m.box((0, 16.0, 26.0), (14, 5, 0.8), "kbd"); m.box((9.5, 16.5, 26.0), (2.4, 3.6, 0.9), "kbd")


def console(m, screen="screen_on", width=56.0):
    prof = [(11, 0), (11, 23), (19, 23), (23, 31), (31, 31), (31, 0)]
    m.prism(prof, -width / 2, width / 2, {"top": "desk_top", "front": "desk", "back": "desk_dk", "*": "desk"})
    for sx in (-1, 1):
        m.box((sx * width * 0.25, 28.0, 38.5), (width * 0.4, 1.6, 15.0), {"back": screen, "*": "desk_dk"}, rot=(-0.20, 0, 0))
    m.box((0, 15.5, 23.7), (15, 5, 0.8), "kbd")


def station(m, gx, gy, yaw, screen, desk_on=True, desk_kind="desk", monitor=True):
    m.push(place(gx, gy, yaw))
    chair(m)
    if desk_on:
        (desk(m, screen, monitor) if desk_kind == "desk" else console(m, screen))
    m.pop()


def rack(m, x0, y0, w, d, h, door_side, lit):
    mats = {door_side: "rack_door", "top": "metal", "*": "rack"}
    m.lbox(x0, y0, x0 + w, y0 + d, 0, h, mats, 0.6)
    face = {"+gy": (x0 + w / 2, y0 + d + 0.25, "x"), "+gx": (x0 + w + 0.25, y0 + d / 2, "y")}[door_side]
    for k in range(5):
        zz = 8 + k * (h - 14) / 4
        if door_side == "+gx":
            m.lbox(x0 + w, y0 + d * 0.15, x0 + w + 0.5, y0 + d * 0.85, zz, zz + 1.4, "led" if lit else "screen_off")
        else:
            m.lbox(x0 + w * 0.15, y0 + d, x0 + w * 0.85, y0 + d + 0.5, zz, zz + 1.4, "led" if lit else "screen_off")


def pipe_run(m, p0, p1, r, nfl=3):
    """Straight pipe between two layout points (gx, gy, z) with flanges."""
    a, b = B(*p0), B(*p1)
    m.cone(a, b, r, r, "pipe_hold", 10, True)
    t = (b - a).normalized()
    for k in range(nfl):
        flange_ring(m, a + (b - a) * (k + 0.5) / nfl, t, r * 1.55)


# ------------------------------------------------------------------------------------------------ containment
def build_containment(cx, state):
    """Cutaway containment (back half full height, near half a low lip), operating deck, cavity + vessel internals, SGs, polar crane."""
    scram = state == "scram"
    reg = cx.reg["site"]
    m = cx.mesher("containment"); f = cx.mesher("containment_fine")
    H, lip, t = CORE["wall_height"], CORE["lip_height"], 14.0
    # floor slab and shell
    m.sector(0.01, R, 0, 360, GROUND_Z, 0, 120, {"top": "core_floor", "outer": "wall_out", "*": "wall_out"}, closed=True)
    m.sector(R - t, R, -225, -45, 0, H, 72, {"outer": "wall_out", "inner": "wall", "top": "hatch", "end": "hatch", "bottom": "wall"})
    m.sector(R - t, R, -45, 135, GROUND_Z, lip, 72, {"outer": "wall_out", "inner": "wall", "top": "hatch", "end": "hatch", "bottom": "wall"})
    # inner wall cap, bands and ribs
    f.sector(R - 22, R - t, -225, -45, H - 8, H, 72, {"*": "trim"})
    for z in (62, 124):
        f.sector(R - t - 1.6, R - t, -225, -45, z, z + 3, 72, {"*": "trim"})
    for a in range(-225, -44, 9):
        f.sector(R - t - 2.4, R - t, a, a + 1.4, 0, H - 8, 2, {"*": "trim"})
    # emergency / rim lighting strip on the back wall top (cyan hairline healthy, red on SCRAM)
    cx_none = cx.mesher("rim_em")
    cx_none.sector(R - 17, R - 13.8, -225, -45, H + 0.1, H + 0.3, 72, {"*": "rim_em"})
    cx_none.sector(R - 17, R - 13.8, -45, 135, lip + 0.1, lip + 0.3, 72, {"*": "rim_em"})
    cx.done(cx_none, "none", reg)
    if scram:
        for a in range(-215, -50, 15):
            x, y = pol(R - 22, a)
            f.cyl((x, -y, H - 20), 2.2, 4, "trip", 10)
            f.cyl((x, -y, H - 22), 3.6, 2, "metal", 10)
    # operating (refuelling) deck: annulus with grating, columns, beam ring, handrails
    zd = 104.0
    m.sector(200, 262, 0, 360, zd - 5, zd, 96, {"top": "metal", "*": "metal_dk"}, closed=True)
    f.sector(204, 288, 0, 360, zd + 0.05, zd + 0.3, 96, {"*": "line_em"}, closed=True) if False else None
    for a in range(0, 360, 45):
        x, y = pol(250, a)
        f.cyl((x, -y, 0), 6, zd - 5, "steel", 12)
        f.cyl((x, -y, 0), 8.5, 3, "metal", 12)
    f.sector(254, 262, 0, 360, zd - 9, zd - 5, 96, {"*": "steel"}, closed=True)
    # handrail (near half open for the viewer; full ring would hide the cavity so only outer rail, 2 levels)
    for zr in (zd + 9, zd + 17):
        f.tube(arc_pts(260, -230, 140, zr, 120), 0.9, "metal", 6)
    for a in range(-230, 141, 6):
        x, y = pol(260, a)
        f.cyl((x, -y, zd), 0.9, 17.5, "metal", 6, smooth=False)
    f.sector(259, 262, -230, 140, zd, zd + 3, 60, {"*": "steel"})
    # cavity (refuelling pool) with vessel flange, water, rods
    vr, vh, vt = CORE["vessel_radius"], CORE["vessel_height"], 18.0
    m.sector(vr - vt, vr, 0, 360, 0, vh, 96, {"outer": "concrete", "inner": "vessel_in", "top": "steel", "bottom": "vessel_in"}, closed=True)
    m.sector(0.01, vr - vt, 0, 360, 0, 28, 60, {"top": "water_floor", "*": "vessel_in"}, closed=True)
    m.sector(vr - vt - 4, vr - vt, 0, 360, vh - 12, vh - 8, 96, {"*": "trim"}, closed=True) if False else None
    cx_none2 = cx.mesher("water")
    cx_none2.sector(0.01, vr - vt, 0, 360, 138, 138.2, 60, {"*": "water"}, closed=True)
    cx_none2.cone(B(0, 0, 40), B(0, 0, 176), 44, 8, "beam", 20, False, True)
    cx.done(cx_none2, "none", reg)
    # reactor vessel (flange visible under water), core barrel, rod bundle
    f.sector(52, 62, 0, 360, 28, 118, 32, {"outer": "vessel", "inner": "vessel_in", "top": "steel", "*": "vessel_in"}, closed=True)
    f.sector(44, 66, 0, 360, 96, 104, 32, {"*": "steel"}, closed=True)
    g = cx.mesher("rods")
    ring = [(0, 0)]
    pitch = 11.0
    for q in range(1, 5):
        for k in range(6 * q):
            ang = 2 * math.pi * k / (6 * q)
            ring.append((q * pitch * math.cos(ang), q * pitch * math.sin(ang)))
    for i, (x, y) in enumerate(ring):
        top = 134 - (i % 3)
        g.cyl((x, y, 32), 1.7, top - 32, "rod", 6, smooth=False)
    ctl = [(0, 0)] + [(2 * pitch * math.cos(math.radians(60 * k + 30)), 2 * pitch * math.sin(math.radians(60 * k + 30))) for k in range(6)] + \
          [(3.6 * pitch * math.cos(math.radians(60 * k)), 3.6 * pitch * math.sin(math.radians(60 * k))) for k in range(6)]
    for x, y in ctl:     # control rod drive shafts rise above the water to the upper support plate
        g.cyl((x, y, 118), 2.4, 64, "rod_ctl", 8)
    g.sector(66, 70, 0, 360, 150, 154, 32, {"top": "metal", "*": "steel"}, closed=True)
    for k in range(6):
        g.box((35 * math.cos(math.radians(60 * k)), -35 * math.sin(math.radians(60 * k)), 152), (70, 2.0, 3.0), "steel", rot=(0, 0, -math.radians(60 * k)))
    cx.done(g, "fine", reg)
    # vessel head on its stand with CRDM shroud (parked on the deck, back right)
    hx, hy = pol(232, -70)
    f.push(place(hx, hy, 0, zd))
    f.sector(26, 31, 0, 360, 0, 9, 20, {"*": "steel"}, closed=True)
    for k in range(3):
        a = math.radians(120 * k + 20)
        f.cyl((38 * math.cos(a), 38 * math.sin(a), 0), 3, 9, "metal", 8)
    f.ellipsoid((0, 0, 9), (30, 30, 22), "dome")
    for k in range(19):
        a = 2 * math.pi * k / 19 * 2.3
        rr = 4 + 15 * math.sqrt((k + 0.5) / 19)
        f.cyl((rr * math.cos(a), rr * math.sin(a), 24), 1.7, 15, "metal", 6, smooth=False)
    f.cyl((0, 0, 44), 6, 4, "steel", 10)
    f.pop()
    # steam generators and reactor coolant pumps (two loops), hot legs into the cavity wall
    loops = [(-18, 335), (102, 335)]
    for a, rr in loops:
        sx_, sy_ = pol(rr, a)
        f.push(place(sx_, sy_, 0))
        f.cyl((0, 0, 0), 29, 150, "steel", 20)
        f.cyl((0, 0, 0), 33, 6, "metal", 20)
        f.cyl((0, 0, 118), 33, 6, "metal", 20)
        f.ellipsoid((0, 0, 150), (29, 29, 24), "dome", u=20, v=10)
        f.cyl((0, 0, 172), 6, 8, "metal", 10)
        f.cyl((0, 0, 60), 34, 3, "metal", 20)
        for k in range(4):
            aa = k * math.pi / 2 + 0.4
            f.cyl((math.cos(aa) * 30, math.sin(aa) * 30, 20), 2.2, 100, "metal", 6, smooth=False)
        f.pop()
        # RCP beside it
        px, py = pol(rr - 5, a + (30 if a < 0 else -30))
        f.push(place(px, py, 0))
        f.cyl((0, 0, 0), 14, 40, "steel", 16); f.cyl((0, 0, 40), 10, 26, "metal", 12); f.cyl((0, 0, 66), 12, 4, "metal", 12)
        f.ellipsoid((0, 0, 70), (9, 9, 7), "dome")
        f.pop()
        # hot leg and cold leg to cavity wall
        for dz, da in ((88, -6), (52, 6)):
            x0_, y0_ = pol(rr - 28, a + da); x1_, y1_ = pol(vr, a + da * 0.2)
            pts = [B(x0_, y0_, dz), B(x1_, y1_, dz)]
            f.tube(pts, 8.5, "steel", 12)
            for kk in (0.25, 0.7):
                p = pts[0] + (pts[1] - pts[0]) * kk
                flange_ring(f, p, (pts[1] - pts[0]).normalized(), 12.5)
    # floor ring main along the near wall with flanges, supports
    pts = arc_pts(455, -40, 135, 9, 70)
    f.tube(pts, 7, "pipe_st", 10)
    for k in range(0, 71, 6):
        p = pts[k]; tvec = (pts[min(k + 1, 70)] - pts[max(k - 1, 0)]).normalized()
        flange_ring(f, p, tvec, 10.5)
        f.box((p.x, p.y, 3.0), (6, 6, 6), "metal_dk")
    # pipe rack and cable tray on the back wall
    f.tube(arc_pts(R - 26, -218, -52, 150, 80), 4.6, "pipe_st", 8)
    f.tube(arc_pts(R - 26, -218, -52, 128, 80), 3.2, "pipe_hold", 8)
    for a in range(-216, -50, 12):
        x, y = pol(R - 22, a)
        f.box((x, -y, 139), (3, 3, 20), "metal_dk")
        flange_ring(f, B(*pol(R - 26, a), 150), Vector((-math.sin(math.radians(a)), -math.cos(math.radians(a)), 0)).normalized(), 7.0)
    # catwalk on the back wall with handrail and corbels
    zc = 96.0
    m.sector(462, R - t, -222, -48, zc - 3, zc, 72, {"top": "metal", "*": "metal_dk"})
    f.tube(arc_pts(463, -222, -48, zc + 10, 72), 0.9, "metal", 6)
    f.tube(arc_pts(463, -222, -48, zc + 19, 72), 0.9, "metal", 6)
    for a in range(-222, -47, 6):
        x, y = pol(463, a)
        f.cyl((x, -y, zc), 0.9, 19, "metal", 6, smooth=False)
    for a in range(-216, -50, 12):
        x, y = pol(R - 25, a)
        f.box((x, -y, zc - 10), (4, 4, 13), "metal_dk")
    # personnel doors and a hatch on the back wall
    for a, z0, w_, h_ in [(-160, 0, 16, 34), (-108, 0, 16, 34), (-70, 0, 20, 36)]:
        x, y = pol(R - t - 1.5, a)
        f.push(place(x, y, math.radians(-a - 90) + math.pi))
        f.box((0, 0, h_ / 2), (w_, 3, h_), {"*": "rack_door"}, bevel=0.5)
        f.box((0, -1.7, h_ + 1.5), (w_ + 4, 1, 3), "trim")
        f.box((w_ * 0.3, -1.8, h_ * 0.5), (1.2, 0.6, 5), "metal")
        f.pop()
    # bridge from deck to catwalk
    x0_, y0_ = pol(262, -135); x1_, y1_ = pol(463, -135)
    f.push(place(x0_, y0_, 0, 0))
    f.pop()
    bridge = [B(x0_, y0_, zd), B(x1_, y1_, zc)]
    for off in (-6, 6):
        ox = Vector((off * 0.7071, off * 0.7071, 0))
        f.tube([bridge[0] + ox + Vector((0, 0, 0)), bridge[1] + ox], 1.0, "metal", 6)
    f.tube([bridge[0] + Vector((0, 0, 9)) + Vector((-4.2, -4.2, 0)), bridge[1] + Vector((0, 0, 9)) + Vector((-4.2, -4.2, 0))], 0.9, "metal", 6)
    for k in range(13):
        p = bridge[0] + (bridge[1] - bridge[0]) * k / 12
        f.box((p.x, p.y, p.z - 1.0), (14, 14, 1.3), "metal_dk", rot=(0, 0, math.radians(45)))
    # polar crane: runway rail on the wall top, bridge girders parked over the back wall, trolley and hook
    zr = H
    f.sector(R - 36, R - 28, -225, -45, zr, zr + 6, 72, {"top": "metal", "*": "steel"})
    d0 = 300.0
    half = math.sqrt((R - 32) ** 2 - d0 ** 2)
    ctr = pol(d0, -135)
    dirv = Vector((0.7071, 0.7071, 0)) * 1.0   # layout (1,-1)/sqrt2 -> B (1, 1)/sqrt2
    for off in (-9, 9):
        c = B(*ctr) + Vector((-0.7071, 0.7071, 0)) * off + Vector((0, 0, zr + 14))   # radial offset
        a_, b_ = c - dirv * half, c + dirv * half
        f.box(((a_ + b_).x / 2, (a_ + b_).y / 2, c.z), (2 * half, 5, 12), "steel", bevel=0.8, rot=(0, 0, math.radians(0)) if False else (0, 0, math.atan2(dirv.y, dirv.x)))
    for sgn in (-1, 1):
        e = B(*ctr) + dirv * half * sgn
        f.box((e.x, e.y, zr + 9), (16, 28, 10), "metal", bevel=0.6, rot=(0, 0, math.atan2(dirv.y, dirv.x)))
    tr = B(*ctr) + dirv * 40
    f.box((tr.x, tr.y, zr + 26), (26, 26, 8), "metal", bevel=0.8, rot=(0, 0, math.atan2(dirv.y, dirv.x)))
    f.tube([Vector((tr.x, tr.y, zr + 22)), Vector((tr.x, tr.y, zr - 48))], 0.9, "steel", 6)
    f.box((tr.x, tr.y, zr - 52), (7, 7, 9), "metal", bevel=0.5)
    f.cone(Vector((tr.x, tr.y, zr - 58)), Vector((tr.x, tr.y, zr - 62)), 2.8, 0.8, "steel", 8)
    cx.done(m, "main", reg); cx.done(f, "fine", reg)


# ------------------------------------------------------------------------------------------------ site
def build_site(cx, state, with_pads=True):
    reg = cx.reg["site"]
    g = cx.mesher("ground")
    g.box((0, 0, GROUND_Z - 0.5), (9000, 9000, 1), {"top": "ground", "*": "ground"})
    cx.done(g, "none", reg)
    # ring road with edge lines and dashed centre line
    rr = LAY["params"]["ring_road"]
    rd = cx.mesher("road")
    rd.sector(rr["inner_radius"], rr["outer_radius"], 0, 360, GROUND_Z, GROUND_Z + 2.5, 180, {"top": "road", "*": "road"}, closed=True, smooth=False)
    mid = (rr["inner_radius"] + rr["outer_radius"]) / 2
    for r_ in (rr["inner_radius"] + 3, rr["outer_radius"] - 4):
        rd.sector(r_, r_ + 1.2, 0, 360, GROUND_Z + 2.5, GROUND_Z + 2.8, 180, {"*": "line_em"}, closed=True, smooth=False)
    for k in range(0, 360, 3):
        rd.sector(mid - 0.7, mid + 0.7, k, k + 1.6, GROUND_Z + 2.5, GROUND_Z + 2.8, 1, {"*": "line_em"}, smooth=False)
    cx.done(rd, "none", reg)
    # pipelines: tubes outside room footprints, flanges and expansion loops every ~150 units
    seen = set()
    pm = cx.mesher("pipes_stage"); ph = cx.mesher("pipes_hold")
    for p in LAY["pipelines"]:
        mm = pm if p["kind"] == "stage" else ph
        rad = 3.4 if p["kind"] == "stage" else 2.6
        z = GROUND_Z + 6.5 if p["kind"] == "stage" else GROUND_Z + 5.0
        pts = []
        for x, y in p["points"]:
            inside = any(r_["x"] - 1 <= x <= r_["x"] + r_["w"] + 1 and r_["y"] - 1 <= y <= r_["y"] + r_["d"] + 1 for r_ in LAY["rooms"])
            if not inside:
                pts.append(B(x, y, z))
        if len(pts) < 2:
            continue
        mm.tube(pts, rad, "pipe_st" if p["kind"] == "stage" else "pipe_hold", 8)
        acc = 0.0
        for i in range(1, len(pts)):
            acc += (pts[i] - pts[i - 1]).length
            if acc > 120:
                acc = 0
                key = (round(pts[i].x / 40), round(pts[i].y / 40), mm.name)
                if key in seen:
                    continue
                seen.add(key)
                flange_ring(mm, pts[i], (pts[min(i + 1, len(pts) - 1)] - pts[i - 1]).normalized(), rad * 1.7)
        for e in (pts[0], pts[-1]):
            mm.cyl((e.x, e.y, e.z - rad * 1.8), rad * 1.7, 2.2, "flange", 10)
    cx.done(pm, "fine", reg); cx.done(ph, "fine", reg)
    if with_pads:
        pd = cx.mesher("pads")
        for rm in LAY["rooms"]:
            pd.lbox(rm["x"] - 6, rm["y"] - 6, rm["x"] + rm["w"] + 6, rm["y"] + rm["d"] + 6, GROUND_Z, -0.4, {"top": "pad", "*": "wall_out"}, 0.0)
        cx.done(pd, "main", reg)
    # RP control point at the ring road entrance: step-off pads, portal monitor, cyan rope (contamination boundary)
    rp = cx.mesher("rp"); rpl = cx.mesher("rp_rope")
    px, py = pol(848, 22)
    tang = math.radians(22 + 90)
    rp.push(place(px, py, math.radians(-22) + math.pi / 2 * 0))
    rp.pop()
    for k in range(3):       # step-off pads
        sx_, sy_ = pol(848 - 40 + k * 22, 22 + 8)
        rp.lbox(sx_ - 7, sy_ - 7, sx_ + 7, sy_ + 7, GROUND_Z + 2.5, GROUND_Z + 4.0, {"top": "desk_top", "*": "desk"}, 0.2)
        rpl.lbox(sx_ - 6, sy_ - 6, sx_ + 6, sy_ + 6, GROUND_Z + 4.0, GROUND_Z + 4.15, {"top": "rope", "*": "rope"})
    mx, my = pol(848 + 36, 22 + 3)
    for sx_ in (-9, 9):
        rp.lbox(mx + sx_ - 2, my - 3, mx + sx_ + 2, my + 3, GROUND_Z + 2.5, GROUND_Z + 36, {"+gy": "metal", "*": "metal_dk"}, 0.4)
    rp.lbox(mx - 11, my - 3, mx + 11, my + 3, GROUND_Z + 36, GROUND_Z + 40, "metal", 0.4)
    rp.lbox(mx - 7, my + 3, mx + 7, my + 3.6, GROUND_Z + 30, GROUND_Z + 37, {"+gy": "screen_on", "*": "led"})
    cx.done(rp, "fine", reg)
    cx.done(rpl, "none", reg)
    # contamination boundary rope around the radwaste hold yard (quarantine): stanchions plus cyan rope
    rm = ROOMS["quarantine"]; rope = cx.mesher("rope"); post = cx.mesher("rope_posts")
    o = 14
    corners = [(rm["x"] - o, rm["y"] - o), (rm["x"] + rm["w"] + o, rm["y"] - o), (rm["x"] + rm["w"] + o, rm["y"] + rm["d"] + o), (rm["x"] - o, rm["y"] + rm["d"] + o)]
    for i in range(4):
        a_, b_ = corners[i], corners[(i + 1) % 4]
        n = max(2, int(math.hypot(b_[0] - a_[0], b_[1] - a_[1]) // 36))
        pts = []
        for k in range(n + 1):
            x = a_[0] + (b_[0] - a_[0]) * k / n; y = a_[1] + (b_[1] - a_[1]) * k / n
            post.cyl((x, -y, GROUND_Z), 1.0, 17, "metal", 6, smooth=False)
            post.ellipsoid((x, -y, GROUND_Z + 17.5), (1.7, 1.7, 1.7), "rope")
            pts.append(Vector((x, -y, GROUND_Z + 14.5 - 2.0 * math.sin(math.pi * 0))))
        # sagging rope per span
        for k in range(n):
            q0, q1 = pts[k], pts[k + 1]
            seg = [q0 + (q1 - q0) * s / 6 + Vector((0, 0, -2.2 * 4 * (s / 6) * (1 - s / 6))) for s in range(7)]
            rope.tube(seg, 0.55, "rope", 5, caps=False)
    cx.done(rope, "none", reg); cx.done(post, "fine", reg)
    build_outside(cx)


def build_outside(cx):
    """Background plant outside the ring, never inside containment: cooling tower, turbine building, switchyard. Dimmer materials."""
    reg = cx.reg["site"]
    def unp(sx, sy):
        a, b = (sx - K.ORIGIN[0]) / K.C, (sy - K.ORIGIN[1]) / K.S
        return ((a + b) / 2, (b - a) / 2)
    m = cx.mesher("outside")
    gx, gy = unp(2262, 330)
    prof = []
    for k in range(13):
        z = GROUND_Z + k * 18.0
        r_ = 52 * math.sqrt(1 + ((z - 150) / 120.0) ** 2) * 0.85 + 6
        prof.append((r_, z))
    for (r0, z0), (r1, z1) in zip(prof[:-1], prof[1:]):
        m.cone(B(gx, gy, z0), B(gx, gy, z1), r0, r1, {"side": "bg", "cap": "bg_hatch"}, 28, False, True)
    m.sector(0.0, 1.0, 0, 1, 0, 0.1, 1, {"*": "bg"}) if False else None
    m.tube([B(gx, gy, prof[-1][1] - 1)] * 2, 0.1, "bg", 3) if False else None
    # steam plume hint: faint cyan vapour disc is skipped (no text/warm colours); turbine building and switchyard
    tx, ty = unp(2275, 1440)
    m.lbox(tx - 90, ty - 36, tx + 90, ty + 36, GROUND_Z, 40, {"top": "bg_hatch", "*": "bg"}, 1.0)
    m.lbox(tx - 80, ty - 36, tx - 20, ty + 36, 40, 52, {"top": "bg_hatch", "*": "bg"}, 1.0)
    for k in range(4):
        m.cyl((tx + 0 + k * 22, -ty, 40), 8, 14, "bg", 12)
    sx0, sy0 = unp(560, 1452)
    for i in range(3):
        for j in range(1):
            x, y = sx0 + i * 56, sy0 + j * 50
            for dx in (-7, 7):
                m.cyl((x + dx, -y, GROUND_Z), 1.4, 46, "metal", 6, smooth=False)
            m.box((x, -y, GROUND_Z + 46), (24, 1.8, 1.8), "metal")
            m.box((x, -y, GROUND_Z + 36), (16, 1.4, 1.4), "metal")
            for dx in (-9, 0, 9):
                m.cyl((x + dx, -y, GROUND_Z + 38), 1.5, 10, "cable", 6, smooth=False)
    cx.done(m, "fine", reg)


# ------------------------------------------------------------------------------------------------ rooms
def room_shell(m, f, rm, lit):
    x0, y0, x1, y1, h = rm["x"], rm["y"], rm["x"] + rm["w"], rm["y"] + rm["d"], rm["wall_height"]
    t, lipz = 7.0, LAY["params"]["lip_height"]
    wm = {"+gy": "wall", "+gx": "wall", "-gy": "wall_out", "-gx": "wall_out", "top": "hatch", "bottom": "wall"}
    m.lbox(x0, y0, x1, y0 + t, 0, h, dict(wm, **{"+gx": "hatch"}), 0.0)                 # north wall (inner face +gy)
    m.lbox(x0, y0 + t, x0 + t, y1, 0, h, dict(wm, **{"+gy": "hatch"}), 0.0)             # west wall (inner face +gx)
    lm = {"top": "hatch", "-gy": "wall", "-gx": "wall", "+gy": "wall_out", "+gx": "wall_out"}
    m.lbox(x0, y1 - t, x1, y1, 0, lipz, lm, 0.0)
    m.lbox(x1 - t, y0 + t, x1, y1 - t, 0, lipz, lm, 0.0)
    m.lbox(x0, y0, x1, y1, -0.4, 0, {"top": "floor_lit" if lit else "floor", "*": "floor"})
    # cap trims and corner post
    f.lbox(x0 + t, y0 + t, x1 - t, y0 + t + 2.2, h - 7, h - 5, "trim")
    f.lbox(x0 + t, y0 + t, x0 + t + 2.2, y1 - t, h - 7, h - 5, "trim")
    f.lbox(x0 + t, y0 + t, x1 - t, y0 + t + 1.0, 0, 5, "trim")
    f.lbox(x0 + t, y0 + t, x0 + t + 1.0, y1 - t, 0, 5, "trim")
    # cable tray (channel with rungs) and conduit with flanges along the north wall; conduit down the west wall
    zt = h - 14 if h > 50 else h - 9
    f.lbox(x0 + t, y0 + t, x1 - 2, y0 + t + 9, zt, zt + 0.8, "metal_dk")
    f.lbox(x0 + t, y0 + t, x1 - 2, y0 + t + 0.8, zt, zt + 3.5, "metal")
    f.lbox(x0 + t, y0 + t + 8.2, x1 - 2, y0 + t + 9, zt, zt + 3.5, "metal")
    for k in range(int((x1 - x0 - t) / 12)):
        f.lbox(x0 + t + 6 + k * 12, y0 + t + 0.8, x0 + t + 7.2 + k * 12, y0 + t + 8.2, zt + 0.8, zt + 1.6, "trim")
    for k in range(3):
        f.cone(B(x0 + t + 6, y0 + t + 2 + k * 2.4, zt + 2.4), B(x1 - 8, y0 + t + 2 + k * 2.4, zt + 2.4), 0.55, 0.55, "cable", 5)
    zc = zt - 9
    pipe_run(f, (x0 + t, y0 + t + 3.5, zc), (x1 - 4, y0 + t + 3.5, zc), 2.2, max(3, int(rm["w"] / 45)))
    pipe_run(f, (x0 + t + 3.5, y0 + t, zc - 7), (x0 + t + 3.5, y1 - t, zc - 7), 2.0, 3)


def seat_world(rm):
    return [(s["gx"], s["gy"]) for s in rm["seats"]]


def stations(cx, m, rm, lit, crew, kind):
    occ = {k: v for k, v in crew.items() if isinstance(k, int)}
    for i, (sx, sy) in enumerate(seat_world(rm)):
        n = i + 1
        scr = "screen_on" if (lit and n in occ) else "screen_off"
        sw = rm["id"] in ("quarantine",)
        row0 = abs(sy - (rm["y"] + 14 + (rm["d"] - 28) * 0.25)) < 1.0
        if kind == "control" and row0:
            station(m, sx, sy, 0.0, scr, True, "console", True)
        else:
            station(m, sx, sy, 0.0, scr, not sw, "desk", not sw)
        if sw:     # field table and tablet for the hold yard
            m.push(place(sx, sy, 0.0)); m.box((0, 20, 14), (30, 14, 1.6), "desk_top", bevel=0.5); m.box((0, 20, 7), (26, 10, 14), "desk_dk"); m.pop()


def crew_build(cx, rm, crew, accent="accent"):
    g = cx.mesher(f"crew_{rm['id']}")
    for n, pose in crew.items():
        if isinstance(n, int):
            sx, sy = seat_world(rm)[n - 1]
            g.push(place(sx, sy, 0.0)); W.build_worker(g, pose); g.pop()
    if "stand" in crew:
        n, pose = crew["stand"]
        sx, sy = seat_world(rm)[n - 1]
        yaw = yaw_for(0.55, 1.0)
        g.push(place(sx + 4, sy + 16, yaw)); W.build_worker(g, pose); g.pop()
        ring = cx.mesher(f"stand_ring_{rm['id']}")
        ring.sector(7.5, 9.0, 0, 360, 0.0, 0.5, 40, {"*": "amber_ring"}, closed=True)
        ring.sector(13.5, 14.5, 0, 360, 0.0, 0.5, 40, {"*": "amber_ring"}, closed=True)
        # shift ring to the worker position
        for v in ring.bm.verts:
            v.co += Vector((sx + 4, -(sy + 16), 0))
        cx.done(ring, "none", cx.reg["crew"].setdefault(rm["id"], []))
    if "walk" in crew:
        g.push(place(rm["x"] + rm["w"] * 0.5, rm["y"] + rm["d"] - 17, yaw_for(1, 0))); W.build_worker(g, "walking"); g.pop()
    cx.done(g, "fine", cx.reg["crew"].setdefault(rm["id"], []))


def props(cx, m, f, rm, lit):
    """Per-room realism props on top of the archetype furniture."""
    pid = rm["id"]; x0, y0, x1, y1, h = rm["x"], rm["y"], rm["x"] + rm["w"], rm["y"] + rm["d"], rm["wall_height"]
    led = "led" if lit else "screen_off"
    scr = "screen_on" if lit else "screen_off"
    if pid == "your-office":
        # horseshoe: back bank at the north wall (consoles at seats), wings along the west wall and east side, big overview panel
        for wx in (x0 + 9, x1 - 40):
            f.lbox(wx, y0 + 42, wx + 26, y0 + 78, 0, 22, {"top": "desk_top", "*": "desk"}, 0.8)
            f.lbox(wx + (0 if wx == x0 + 9 else 25), y0 + 42, wx + (1.2 if wx == x0 + 9 else 26), y0 + 78, 22, 40, {"+gx": scr, "-gx": scr, "*": "desk_dk"})
        f.lbox(x0 + 18, y0 + 7, x1 - 18, y0 + 9.2, 46, 76, {"+gy": scr, "*": "desk_dk"})                       # overview panel
        for k in range(6):
            f.lbox(x0 + 22 + k * 19, y0 + 9.4, x0 + 22 + k * 19 + 15, y0 + 9.8, 52, 70, {"+gy": scr, "*": scr})
        f.lbox(x0 + 18, y0 + 7, x1 - 18, y0 + 10, 44, 46, "trim"); f.lbox(x0 + 18, y0 + 7, x1 - 18, y0 + 10, 76, 78, "trim")
        # shift supervisor desk (back right) with a phone and lamp
        f.lbox(x1 - 62, y1 - 44, x1 - 14, y1 - 26, 0, 24, {"top": "desk_top", "*": "desk"}, 0.8)
        f.lbox(x1 - 54, y1 - 42, x1 - 46, y1 - 36, 24, 27, "kbd")
    else:
        # work-bay: equipment racks along the west wall, wall panel on the north wall
        for k in range(2):
            rack(f, x0 + 7.5, y0 + 34 + k * 18, 12, 14, min(h - 6, 56), "+gx", lit)
        if h > 60:
            f.lbox(x0 + rm["w"] * 0.42, y0 + 7, x0 + rm["w"] * 0.42 + 46, y0 + 8.2, h - 44, h - 22, {"+gy": scr, "*": "desk_dk"})
    if pid == "verification":      # QA/QC inspection bench: surface plate, gauge blocks, portal measuring arm, magnifier
        bx, by = x1 - 70, y0 + 26
        m.lbox(bx, by, bx + 56, by + 30, 0, 20, {"top": "desk_top", "*": "desk"}, 0.8)
        m.lbox(bx + 6, by + 5, bx + 50, by + 25, 20, 21.5, {"top": "metal_dk", "*": "metal_dk"})
        for k in range(5):
            m.lbox(bx + 10 + k * 7, by + 9, bx + 15 + k * 7, by + 13, 21.5, 21.5 + 3 + k, "steel")
        for xx in (bx + 4, bx + 52):
            m.lbox(xx, by + 4, xx + 2.4, by + 6.4, 20, 42, "steel"); m.lbox(xx, by + 24, xx + 2.4, by + 26.4, 20, 42, "steel")
        m.lbox(bx + 3, by + 4, bx + 55, by + 6.4, 40, 43, "metal"); m.lbox(bx + 3, by + 24, bx + 55, by + 26.4, 40, 43, "metal")
        m.lbox(bx + 20, by + 4, bx + 26, by + 26.4, 40, 43, "metal"); m.cyl(B(bx + 23, by + 15, 24), 0.9, 16, "metal", 6)
        f.lbox(bx + 38, by + 14, bx + 44, by + 18, 45, 52, {"+gy": scr, "*": "desk_dk"})
    if pid == "review":            # work control centre: planning table, wall kanban board
        f.lbox(x0 + 12, y0 + 7, x1 - 12, y0 + 8.4, h - 60, h - 20, {"+gy": "desk_dk", "*": "desk_dk"})
        for c_ in range(5):
            for r_ in range(3):
                if (c_ * 3 + r_) % 4 != 3 or c_ < 2:
                    f.lbox(x0 + 16 + c_ * 24, y0 + 8.4, x0 + 16 + c_ * 24 + 20, y0 + 8.8, h - 28 - r_ * 11, h - 20 - r_ * 11, {"+gy": scr if (c_ + r_) % 2 == 0 else led, "*": scr})
        m.lbox(x1 - 62, y1 - 42, x1 - 16, y1 - 26, 0, 20, {"top": "desk_top", "*": "desk"}, 0.8)
        for k in range(4):
            m.lbox(x1 - 58 + k * 11, y1 - 38, x1 - 50 + k * 11, y1 - 30, 20, 20.6, "kbd")
    if pid == "quarantine":        # radwaste / hold yard: drums on pallets, shielded cask on cradle
        for i in range(3):
            for j in range(2):
                dx, dy = x1 - 70 + i * 19, y0 + 22 + j * 20
                m.lbox(dx - 8, dy - 8, dx + 8, dy + 8, 0, 3, "desk_dk")
                m.cyl(B(dx, dy, 3), 7, 19, "drum", 14)
                for zz in (8, 15):
                    m.cyl(B(dx, dy, zz), 7.3, 1.2, "metal", 14)
                m.cyl(B(dx, dy, 22), 6.8, 0.6, "metal_dk", 14)
        cx_, cy_ = x0 + 60, y0 + 28
        m.lbox(cx_ - 30, cy_ - 8, cx_ + 30, cy_ + 8, 0, 4, "desk_dk")
        m.cone(B(cx_ - 26, cy_, 14), B(cx_ + 26, cy_, 14), 12, 12, {"side": "cask", "cap": "steel"}, 20)
        for xx in (-14, -4, 6, 16):
            m.cyl(B(cx_ + xx, cy_, 4), 12.8, 0.1, "metal", 4) if False else None
            m.cone(B(cx_ + xx, cy_, 14), B(cx_ + xx + 1.5, cy_, 14), 12.6, 12.6, "metal", 20, False)
        m.cone(B(cx_ + 26, cy_, 14), B(cx_ + 31, cy_, 14), 8, 8, "steel", 16)
    if pid == "bench":             # I&C shop: long workbench with scopes and test rig, parts bins
        m.lbox(x0 + 16, y0 + 8, x1 - 16, y0 + 17, 0, 26, {"top": "desk_top", "*": "desk"}, 0.6)
        for k in range(4):
            xx = x0 + 28 + k * 46
            f.lbox(xx, y0 + 9, xx + 18, y0 + 16, 26, 38, {"+gy": scr, "*": "desk_dk"})
            f.lbox(xx - 2, y0 + 10, xx + 20, y0 + 15, 26, 28, "kbd")
        for k in range(6):
            f.lbox(x1 - 12 - 4, y0 + 20 + k * 14, x1 - 8, y0 + 30 + k * 14, 0, 14, {"-gx": "rack_door", "*": "rack"}) if False else None
    if pid == "document-control":  # records vault: shelving rows with boxes
        for r_ in range(3):
            sy0 = y0 + 50 + r_ * 28
            f.lbox(x0 + 100, sy0, x1 - 14, sy0 + 5, 0, 36, {"+gy": "rack_door", "*": "rack"}, 0.4)
            for lv in range(3):
                f.lbox(x0 + 101, sy0 + 5, x1 - 15, sy0 + 5.5, 4 + lv * 11, 5 + lv * 11, "metal")
                for k in range(8):
                    f.lbox(x0 + 104 + k * 12, sy0 + 5.5, x0 + 112 + k * 12, sy0 + 10, 5 + lv * 11, 13 + lv * 11, "desk_top" if (k + lv) % 3 else "desk")


def build_room(cx, rm, lit, crew, with_crew=True):
    reg = cx.reg["rooms"].setdefault(rm["id"], [])
    m = cx.mesher(f"room_{rm['id']}"); f = cx.mesher(f"roomf_{rm['id']}")
    room_shell(m, f, rm, lit)
    kind = "control" if rm["archetype"] == "control-room" else "bay"
    stations(cx, f, rm, lit, crew, kind)
    props(cx, m, f, rm, lit)
    cx.done(m, "main", reg); cx.done(f, "fine", reg)
    if with_crew and lit and crew:
        crew_build(cx, rm, crew)


def build(state="healthy", rooms=True, site=True, crew=True, only=None, lit_ids=None, book=None):
    book = book or make_book(state)
    cx = Ctx(book)
    if site and only is None:
        build_containment(cx, state)
        build_site(cx, state)
    if rooms:
        for rm in LAY["rooms"]:
            if only and rm["id"] not in only:
                continue
            lit = rm["id"] in (lit_ids if lit_ids is not None else LIT)
            build_room(cx, rm, lit, CREW.get(rm["id"], {}) if lit else {}, crew)
    return cx
