"""Plant scene v2, scripted and deterministic (no randomness, no downloaded assets), built from design/art/layout.json and tiles.json.

Style (design/art/bakeoff/prompts/final-v2.md STYLE block): flat matte fills from palette.json, #255375 hairline edges (Freestyle),
pale-cyan hairlines on cut profiles (Freestyle edge marks on faces that use a cut material), fine 45 degree screen-space hatching on cut
material only, no text, no warm colours (the needs-you lamp is the one exception; SCRAM adds the trip red). The only light in the scene
is the reactor fuel (Cherenkov blue, emissive fuel plus a volumetric falloff in the cavity water); screens are flat #3b95b7 or darker.

Parts: this file holds the material book, Ctx, shared helpers, containment and site; rooms.py holds the eight room archetypes;
worker.py the radworker. Authoring frames: layout coords (gx, gy, z) are placed in Blender as B = (gx, -gy, z).
"""
import math
import bpy
from mathutils import Matrix, Vector
import common as K
import kit
from kit import Mesher, Book, mix, P, WHITE, PALE

LAY = K.LAYOUT
CORE = LAY["core"]
R = CORE["radius"]
H_WALL, LIP_C = CORE["wall_height"], CORE["lip_height"]
ROOMS = K.rooms()
GROUND_Z = -6.0
WT = 14.0                       # containment wall thickness (blockout)
DRUM_R, DRUM_H = CORE["vessel_radius"], CORE["vessel_height"]    # primary shield drum (blockout 'vessel' volume)
CUT = (0, 90)                   # layout angles removed from the shield drum and vessel (the near quadrant, centred on the viewer)
GROUND_COL = mix(P["ground"], P["surface"], 0.95)   # v3: ground lifted one value step (was #000e23)
K_SCRAM = 0.16                  # containment interior brightness factor on SCRAM


# ---- worker garb: one switch. "realistic": anti-C white coveralls (hood up, dosimeter) in RCA rooms and anywhere inside containment,
# navy station coveralls (dosimeter badge, no hood) elsewhere. "anti-c-everywhere": every worker in anti-C.
GARB_MODE = "realistic"                     # "realistic" | "anti-c-everywhere"
GARB = {"quarantine": "antic", "bench": "antic", "containment": "antic",       # radwaste yard, I&C shop, anything inside containment
        "your-office": "station", "process": "station", "mechanical": "station", "electrical": "station", "civil": "station",
        "assurance": "station", "project-controls": "station", "review": "station", "interface": "station",
        "verification": "station", "document-control": "station"}


def garb_for(room_id):
    if GARB_MODE == "anti-c-everywhere":
        return "antic"
    return GARB.get(room_id, "station")


def pol(r, a):
    return (r * math.cos(math.radians(a)), r * math.sin(math.radians(a)))


def B(gx, gy, z=0.0):
    return Vector((gx, -gy, z))


def place(gx, gy, yaw=0.0, z=0.0):
    return Matrix.Translation((gx, -gy, z)) @ Matrix.Rotation(yaw, 4, "Z")


def yaw_for(dx, dy):
    """Z rotation (B frame) that points a worker's local +y at the layout direction (dx, dy)."""
    return math.atan2(-dx, -dy)


# ------------------------------------------------------------------------------------------------ materials
def make_book(state="healthy"):
    b = Book()
    sf, lw, gl, sc, gd = P["surface"], P["linework"], P["core-glow"], P["screen"], P["ground"]
    scram = state == "scram"
    kc = K_SCRAM if scram else 1.0
    t = b.tone
    hi, lo = mix(sf, lw, 0.20), mix(gd, sf, 0.55)
    hatchc = mix(lw, PALE, 0.30)
    # --- ground (lifted one value step in v3), paving grid, pads, road, markings, trenches
    t("ground", GROUND_COL, amb=None, ao=0, pat=("grid", 96.0, 1.1), pat_col=mix(GROUND_COL, lw, 0.24))
    t("pad", mix(sf, lw, 0.07), amb=None, ao=0)
    t("pad_side", mix(GROUND_COL, sf, 0.6), amb=None, ao=0)
    t("road", mix(GROUND_COL, sf, 0.75), amb=None, ao=0)
    t("road_line", mix(lw, PALE, 0.10), amb=None, ao=0)
    t("road_mark", mix(lw, PALE, 0.28), amb=None, ao=0)
    t("path", mix(GROUND_COL, sf, 0.85), amb=None, ao=0)
    t("trench", mix(gd, GROUND_COL, 0.55), amb=None, ao=0)
    t("trench_cap", mix(GROUND_COL, lw, 0.30), amb=None, ao=0)
    t("duct", mix(sf, lw, 0.42), amb=None, ao=0)
    t("rack", mix(sf, lw, 0.40), amb=0.40, ao=0)
    # --- cut material: section hatching (fine 45 degrees, screen space); every cut face uses it
    t("hatch", mix(sf, lw, 0.12), amb=None, ao=0, pat=("hatch", 4.2, 0.9), pat_col=hatchc, cut=True, k=kc)
    t("hatch_r", mix(sf, lw, 0.12), amb=None, ao=0, pat=("hatch", 4.2, 0.9), pat_col=hatchc, cut=True)   # rooms and site never dim
    # --- containment (dimmed as a group on SCRAM)
    t("c_floor", mix(sf, lw, 0.14), amb=None, ao=0, k=kc)
    t("c_floor2", mix(sf, lw, 0.16), amb=None, ao=0, k=kc)
    t("c_wall", mix(sf, lw, 0.34), amb=0.30, ao=0.0, k=kc)           # inner faces (lighter step)
    t("c_wall_out", mix(sf, lw, 0.26), amb=0.30, ao=0.0)
    t("c_conc", mix(sf, lw, 0.30), amb=0.30, ao=0.0, k=kc)
    t("c_conc_top", mix(sf, lw, 0.38), amb=0.30, ao=0.0, k=kc)
    t("c_dark", mix(gd, sf, 0.7), amb=0.5, ao=0, k=kc)
    t("c_steel", mix(sf, lw, 0.62), amb=0.30, ao=0.0, k=kc)
    t("c_steel_in", mix(sf, lw, 0.34), amb=0.4, ao=0, k=kc)
    t("c_dome", mix(sf, lw, 0.72), amb=0.30, ao=0.0, k=kc)
    t("c_pale", mix(lw, PALE, 0.18), amb=0.55, ao=0, k=kc)
    t("c_band", mix(lw, PALE, 0.15), amb=0.5, ao=0, k=kc)
    t("c_hatch_pale", mix(lw, PALE, 0.3), amb=None, ao=0, k=kc)
    t("cl", mix(lw, PALE, 0.35), amb=None, ao=0, k=kc)               # dash-dot centre lines
    t("liner", mix(lw, PALE, 0.5), amb=None, ao=0, k=kc)
    t("ghost", mix(lw, PALE, 0.4), amb=None, ao=0, alpha=0.05, k=kc)
    # --- the one light: Cherenkov fuel + volumetric falloff (off on SCRAM) ; red emergency fixtures on SCRAM only
    fk = 0.0 if scram else 1.0
    t("fuel", mix(gd, sf, 0.5), amb=None, ao=0, emit=mix(gl, WHITE, 0.06), emit_k=1.2 * fk if fk else 0.0, emit_pat="core")
    t("fuel_cap", mix(gd, sf, 0.5), amb=None, ao=0, emit=mix(gl, WHITE, 0.0), emit_k=0.7 * fk if fk else 0.0)
    t("fuel_top", mix(gd, sf, 0.5), amb=None, ao=0, emit=mix(gl, WHITE, 0.30), emit_k=1.55 * fk if fk else 0.0)
    t("trip_em", P["trip"], amb=None, ao=0, emit=P["trip"], emit_k=4.2 if scram else 0.0)
    t("trip_dim", mix(gd, sf, 0.6), amb=None, ao=0, emit=P["trip"], emit_k=0.0)
    # --- rooms: lighter step floors and walls, steel/furniture tones, screens flat #3b95b7
    t("floor", mix(sf, lw, 0.20), amb=None, ao=0)
    t("floor_yard", mix(sf, lw, 0.08), amb=None, ao=0)
    t("mat", mix(sf, lw, 0.30), amb=None, ao=0)
    t("wall", mix(sf, lw, 0.34), amb=0.30, ao=0)
    t("wall_out", mix(sf, lw, 0.24), amb=0.30, ao=0)
    t("trim", mix(sf, lw, 0.58), amb=0.35, ao=0)
    t("metal", mix(sf, lw, 0.55), amb=0.30, ao=0)
    t("metal_dk", mix(sf, lw, 0.25), amb=0.30, ao=0)
    t("steel", mix(lw, PALE, 0.28), amb=0.30, ao=0)
    t("desk", mix(sf, lw, 0.58), amb=0.30, ao=0)
    t("desk_top", mix(sf, lw, 0.80), amb=0.30, ao=0)
    t("desk_dk", mix(sf, lw, 0.22), amb=0.40, ao=0)
    t("chair", mix(sf, lw, 0.46), amb=0.30, ao=0)
    t("paper", mix(lw, PALE, 0.12), amb=0.4, ao=0)
    t("paper_dk", mix(sf, lw, 0.75), amb=0.4, ao=0)
    t("panel", mix(sf, lw, 0.42), amb=0.30, ao=0)
    t("drum", mix(sf, lw, 0.58), amb=0.30, ao=0)
    t("cask", mix(sf, lw, 0.70), amb=0.30, ao=0)
    t("cask_band", mix(lw, PALE, 0.2), amb=0.30, ao=0)
    sck = 0.55 if scram else 1.0
    t("screen_on", sc, amb=None, ao=0, emit=sc, emit_k=0.0, k=1.0)      # flat #3b95b7 (emission off: matte flat fill)
    t("screen_dim", mix(sf, sc, 0.50), amb=None, ao=0)
    t("screen_off", mix(sf, lw, 0.42), amb=None, ao=0)
    t("led", mix(sc, PALE, 0.15), amb=None, ao=0)
    t("led_dk", mix(sf, sc, 0.55), amb=None, ao=0)
    t("annun", mix(sf, sc, 0.25), amb=None, ao=0)
    t("annun_lit", mix(sc, sf, 0.30), amb=None, ao=0)
    t("mimic", mix(sc, sf, 0.55), amb=None, ao=0)
    t("rope", mix(lw, PALE, 0.55), amb=None, ao=0)
    t("rope2", mix(sf, PALE, 0.80), amb=None, ao=0)
    t("cl_room", mix(lw, PALE, 0.2), amb=None, ao=0)
    # --- workers (white anti-C coverall, cool skin tone, no warm colours)
    t("suit", mix(sf, WHITE, 0.62), amb=0.34, ao=0)
    t("suit_dk", mix(sf, WHITE, 0.40), amb=0.34, ao=0)
    t("hood", mix(sf, WHITE, 0.66), amb=0.34, ao=0)
    # station coverall (navy, no hood): a mid navy that reads against the floor, dark boots, cool dark hair
    t("suit_n", mix(sf, lw, 0.70), amb=0.34, ao=0)
    t("suit_n_dk", mix(sf, lw, 0.44), amb=0.34, ao=0)
    t("boot_n", mix(gd, sf, 0.75), amb=0.34, ao=0)
    t("hair", mix(gd, sf, 0.55), amb=0.34, ao=0)
    t("skin", mix(lw, WHITE, 0.55), amb=0.55, ao=0)
    t("eye", mix(gd, sf, 0.2), amb=None, ao=0)
    t("glasses", mix(gd, lw, 0.45), amb=None, ao=0)
    t("glove", mix(sc, WHITE, 0.30), amb=0.4, ao=0)
    t("shoe", mix(sf, WHITE, 0.52), amb=0.34, ao=0)
    t("tape", mix(sc, WHITE, 0.15), amb=0.5, ao=0)
    t("badge", mix(sc, WHITE, 0.55), amb=None, ao=0)
    t("accent", mix(sc, PALE, 0.30), amb=0.6, ao=0)
    t("lamp", P["needs-you"], amb=None, ao=0, emit=P["needs-you"], emit_k=7.0)
    t("amber_ring", P["needs-you"], amb=None, ao=0, emit=P["needs-you"], emit_k=1.6)
    # --- cavity water: volume shader, strongest light in the scene (healthy); nothing on SCRAM
    mat = bpy.data.materials.new("water_vol"); mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    geo = nt.nodes.new("ShaderNodeNewGeometry"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(geo.outputs["Position"], sep.inputs[0])
    def mth(op, a, b=None, c=None):
        n = nt.nodes.new("ShaderNodeMath"); n.operation = op
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs[0]
    r2 = mth("ADD", mth("POWER", sep.outputs[0], 2.0), mth("POWER", sep.outputs[1], 2.0))
    gr = mth("EXPONENT", mth("MULTIPLY", r2, -1.0 / (2 * 80.0 ** 2)))
    gz = mth("EXPONENT", mth("MULTIPLY", mth("POWER", mth("SUBTRACT", sep.outputs[2], 112.0), 2.0), -1.0 / (2 * 52.0 ** 2)))
    st_ = mth("MULTIPLY", mth("MULTIPLY", gr, gz), 0.030 * fk)
    em = nt.nodes.new("ShaderNodeEmission"); em.inputs[0].default_value = kit.lin(mix(gl, (0.35, 0.8, 1.0), 0.25))
    nt.links.new(st_, em.inputs[1])
    out = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(em.outputs[0], out.inputs["Volume"])
    b.m["water_vol"] = mat
    return b


# ------------------------------------------------------------------------------------------------ context
class Ctx:
    """Collections: c_cont/c_contf (containment: cut line red on SCRAM), c_main/c_fine (rooms, site), c_none (no linework)."""
    def __init__(s, book):
        s.book = book
        s.scn = bpy.context.scene
        s.cols = {}
        for n in ("cont", "contf", "main", "fine", "none", "ghost"):
            c = bpy.data.collections.new("L_" + n); s.scn.collection.children.link(c); s.cols[n] = c
        s.reg = {"site": [], "rooms": {}, "crew": {}}

    def mesher(s, name):
        return Mesher(name, s.book)

    def done(s, m, kind, group):
        ob = m.finish(m.name, [s.cols[kind]])
        group.append(ob)
        return ob


def arc_pts(r, a0, a1, z, n):
    return [B(*pol(r, a0 + (a1 - a0) * k / n), z) for k in range(n + 1)]


def ring_at(m, p, tan, r, mat="c_band", t=2.2, seg=12):
    m.cone(p - tan * t / 2, p + tan * t / 2, r, r, mat, seg, True, False)


def ellipse_profile(r, h, z0, n=10, top=True):
    """(r, z) points along a quarter ellipse: from (r, z0) to the pole (0, z0 + h) for a dome, or to (0, z0 - h) for a bowl."""
    pts = []
    for k in range(n + 1):
        a = math.pi / 2 * k / n
        pts.append((r * math.cos(a), z0 + (h if top else -h) * math.sin(a)))
    return pts


# ------------------------------------------------------------------------------------------------ containment parts
# v3 core (sectioned reactor): vessel + core barrel + grid of square fuel assemblies + water cavity + CRDM housings above the head.
SHIELD_RI = 150.0               # shield drum inner radius (the reactor cavity)
CORE_V3 = dict(ro=128.0, ri=119.0, z0=8.0, zf=124.0, barrel=(104.0, 107.5), pitch=14.0, width=12.2, z_fuel=(36.0, 110.0), r_limit=96.0,
               crdm_rings=((0.0, 1), (34.0, 6), (68.0, 12), (101.0, 18)), crdm_top=196.0)


def vessel(cx, f):
    """Reactor sectioned on the near quadrant: shell and bowl, core barrel (cut open), a grid of upright square fuel assemblies with top and
    bottom nozzles and spacer grids, water-filled cavity (volume glow falling off with radius and depth), bolted head with CRDM housings."""
    V = CORE_V3
    a0, a1 = CUT[1], CUT[0] + 360
    ro, ri, z0, zf = V["ro"], V["ri"], V["z0"], V["zf"]
    kb = ro / 57.0
    bowl = ellipse_profile(ro, 34, z0 + 34, 8, top=False)
    bowl_i = ellipse_profile(ri, 32, z0 + 36, 8, top=False)
    poly = [(2.0, z0 + 0.1)] + [(r, z) for r, z in reversed(bowl[:-1]) if r > 2.0] + [(ro, zf), (ro + 8, zf), (ro + 8, zf + 12), (ri, zf + 12)] + \
           [(ri, z0 + 36)] + [(r, z) for r, z in bowl_i[1:-1] if r > 2.0] + [(2.0, z0 + 4.1)]
    n = len(poly)
    mats = ["c_steel"] * n
    for i in range(n):
        if poly[i][0] <= ri + 0.1 and poly[(i + 1) % n][0] <= ri + 0.1 and poly[i][1] > z0 + 6:
            mats[i] = "c_steel_in"
    m = cx.mesher("vessel"); m.lathe(poly, a0, a1, 72, mats)
    # bolted domed head (flange, shell, apex)
    hz = zf + 12
    dome = ellipse_profile(ro, 36, hz + 8, 12, top=True)
    domei = ellipse_profile(ro - 6, 31, hz + 8, 12, top=True)
    hp = [(ri, hz), (ro + 8, hz), (ro + 8, hz + 9), (ro, hz + 9)] + [(r, z) for r, z in dome[1:]] + [(0, domei[-1][1])] + \
         [(r, z) for r, z in reversed(domei[1:-1])] + [(ro - 6, hz + 9), (ri, hz + 9)]
    hp = [(ri, hz), (ro + 8, hz), (ro + 8, hz + 9), (ro, hz + 9)] + [(r, z + 1) for r, z in dome[1:]] + [(0, domei[-1][1] + 1)] + \
         [(r, z + 1) for r, z in reversed(domei[1:-1])] + [(ro - 6, hz + 9), (ri, hz + 9)]
    m.lathe(hp, a0, a1, 72, ["c_dome"] * len(hp))
    for a in range(0, 360, 6):                              # head studs and nuts on the flange
        if CUT[0] - 1 < a < CUT[1] + 1:
            continue
        x, y = pol(ro + 4.0, a)
        m.cyl((x, -y, hz + 9), 1.7, 5.0, "c_pale", 6, smooth=False)
    cx.done(m, "cont", cx.reg["site"])
    # core barrel (cut open: hatched cut faces), lower core plate and upper plate
    b0, b1 = V["barrel"]
    g = cx.mesher("barrel")
    g.lathe([(b0, 30), (b1, 30), (b1, 124), (b0, 124)], a0, a1, 72, ["c_steel", "c_steel", "c_steel_in", "c_steel_in"])
    g.lathe([(2.0, 28), (b1, 28), (b1, 33), (2.0, 33)], a0, a1, 72, ["c_steel_in", "c_steel", "c_steel_in", "c_steel_in"])
    cx.done(g, "contf", cx.reg["site"])
    # fuel: square assemblies on a pitch grid inside the barrel; bottom nozzle, emissive body, spacer grids, top nozzle with hold-down legs
    fa = cx.mesher("fuel"); gs = cx.mesher("fuel_grids")
    p_, w = V["pitch"], V["width"]; hw = w / 2
    zb, zt = V["z_fuel"]
    nmax = int(V["r_limit"] / p_) + 2
    for i in range(-nmax, nmax):
        for j in range(-nmax, nmax):
            cxm, cym = p_ * (i + 0.5), p_ * (j + 0.5)
            if cxm > 0 and cym > 0:
                continue
            if math.hypot(abs(cxm) + hw, abs(cym) + hw) > V["r_limit"] + 3:
                continue
            ht = zt - (2.0 if (i + 3 * j) % 5 == 0 else 0.0) - (2.0 if (i * j) % 7 == 3 else 0.0)
            gs.lbox(cxm - 3.4, cym - 3.4, cxm + 3.4, cym + 3.4, 33, zb, "c_steel_in")                            # bottom nozzle
            fa.lbox(cxm - hw, cym - hw, cxm + hw, cym + hw, zb, ht, {"top": "fuel_cap", "*": "fuel"})
            for zz in (zb + 14, zb + 38, zb + 62):                                                               # spacer grids
                gs.lbox(cxm - hw - 0.35, cym - hw - 0.35, cxm + hw + 0.35, cym + hw + 0.35, zz, zz + 1.8, "c_steel")
            gs.lbox(cxm - 4.4, cym - 4.4, cxm + 4.4, cym + 4.4, ht, ht + 4.2, "fuel_top")                          # top nozzle
            for sx_, sy_ in ((-4.8, -4.8), (4.8, -4.8), (-4.8, 4.8), (4.8, 4.8)):                               # hold-down legs
                gs.lbox(cxm + sx_ - 0.5, cym + sy_ - 0.5, cxm + sx_ + 0.5, cym + sy_ + 0.5, ht, ht + 5.5, "c_pale")
    cx.done(fa, "contf", cx.reg["site"]); cx.done(gs, "contf", cx.reg["site"])
    # water: volume in the vessel interior (strongest on the fuel, falling off with radius and with depth), shader-only mesh
    vm = cx.mesher("water"); vm.book = cx.book
    vm.lathe([(0.0, 22), (ri - 0.4, 22), (ri - 0.4, hz + 8), (0.0, hz + 8)], a0, a1, 48, "water_vol", cutmat="water_vol")
    cx.done(vm, "none", cx.reg["site"])
    # control rod drive housings above the head: rings of tall housings with caps, band and a seismic tie ring
    hh = cx.mesher("crdm")
    for rr_, cnt in V["crdm_rings"]:
        for k in range(cnt):
            ang = 360.0 * k / cnt + (15 if rr_ > 40 else 0)
            x, y = rr_ * math.cos(math.radians(ang)), rr_ * math.sin(math.radians(ang))
            if x > -1.0 and y > -1.0 and (x > 1 or y > 1):
                continue
            zb_ = hz + 9 + 36.0 * math.sqrt(max(0, 1 - (rr_ / (ro - 1)) ** 2)) - 4
            top = V["crdm_top"]
            hh.cyl((x, -y, zb_), 3.0, top - zb_, "c_steel", 8)
            hh.cyl((x, -y, top - 1), 4.0, 5, "c_pale", 8)
            hh.cyl((x, -y, zb_ + 14), 3.8, 2.0, "c_band", 8)
            hh.cyl((x, -y, zb_ + 36), 3.5, 1.6, "c_band", 8)
    cx.done(hh, "contf", cx.reg["site"])


def shield_drum(cx):
    a0, a1 = CUT[1], CUT[0] + 360
    ri = SHIELD_RI
    poly = [(ri, 0), (DRUM_R, 0), (DRUM_R, DRUM_H), (ri, DRUM_H)]
    m = cx.mesher("shield"); m.lathe(poly, a0, a1, 90, ["c_conc", "c_conc", "c_conc_top", "c_conc"], cutmat="hatch")
    # drum footing band and a rear-rim lip ring
    m.lathe([(DRUM_R, 0), (DRUM_R + 3, 0), (DRUM_R + 3, 6), (DRUM_R, 6)], a0, a1, 90, ["c_dark", "c_dark", "c_dark", "c_dark"], cutmat="hatch")
    cx.done(m, "cont", cx.reg["site"])
    f = cx.mesher("shield_f")
    for z in (50, 100):                               # form-tie bands on the drum face
        f.lathe([(DRUM_R, z), (DRUM_R + 0.7, z), (DRUM_R + 0.7, z + 1.4), (DRUM_R, z + 1.4)], a0, a1, 90, ["c_band"] * 4)
    # sectioned pipe stubs (loop piping runs below the floor): round hatched sections on the two cut planes at the base
    for ang, nrm in ((CUT[0], (0, 1)), (CUT[1], (1, 0))):
        for rr in (166, 188):
            x, y = pol(rr, ang)
            for rad, mat in ((11, "c_steel"), (7.4, "hatch")):
                f.cone(B(x, y, 26) + Vector((nrm[0], -nrm[1], 0)) * (0.1 + (1 if mat == "hatch" else 0) * 0.3),
                       B(x, y, 26) + Vector((nrm[0], -nrm[1], 0)) * (0.5 + (1 if mat == "hatch" else 0) * 0.5), rad, rad, mat, 20, True, False)
    cx.done(f, "contf", cx.reg["site"])


# cubicle blocks: layout (gx, gy) boxes. Left flank block: gx -340..-220, gy 70..330; right flank is its (gx, gy) -> (gy, gx) mirror.
def flank_blocks():
    out = []
    for side in ("L", "R"):
        out.append((side, (lambda gx, gy: (gx, gy)) if side == "L" else (lambda gx, gy: (gy, gx))))
    return out


def concrete_box(m, x0, y0, x1, y1, z1, cut=("top",)):
    """Concrete wall box with hatched cut faces. cut: face keys that are cut planes."""
    mats = {"*": "c_conc", "+gx": "c_conc", "+gy": "c_conc", "top": "hatch"}
    for k in cut:
        mats[k] = "hatch"
    m.lbox(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1), 0, z1, mats)


def steam_gen_tall(f, gx, gy):
    prof = [(0, 4), (30, 4), (30, 104), (38, 116), (38, 146)] + [(r, z + 146) for r, z in ellipse_profile(38, 22, 0, 10)[1:]] + [(0, 168)]
    prof = [(0.0, 4.0), (30.0, 4.0), (30.0, 104.0), (38.0, 116.0), (38.0, 146.0)] + [(r, 146 + z) for r, z in [(38 * math.cos(math.pi / 2 * k / 10), 22 * math.sin(math.pi / 2 * k / 10)) for k in range(1, 11)]]
    f.push(place(gx, gy, 0) @ Matrix.Diagonal((1.2, 1.2, 1.0, 1.0)))
    f.lathe(prof, 0, 360, 36, ["c_steel"] * len(prof))
    for z, r in ((4, 33), (60, 31.6), (104, 31.6), (146, 39.6)):
        f.cone(B(0, 0, z), B(0, 0, z + 2.6), r, r, "c_band", 28, True, False)
    f.cyl((0, 0, 166), 7, 12, "c_pale", 12)
    f.cyl((0, 0, 177), 9, 3, "c_band", 12)
    for dz, ang in ((128, 200), (128, 250)):             # feed / steam nozzles
        a = math.radians(ang)
        f.cone(Vector((0, 0, dz)), Vector((math.cos(a) * 52, -math.sin(a) * 52, dz)), 5.5, 5.5, "c_steel", 12, True)
    f.pop()


def steam_gen_cut(f, gx, gy):
    zc = 48.0
    f.push(place(gx, gy, 0) @ Matrix.Diagonal((1.2, 1.2, 1.0, 1.0)))
    f.lathe([(27.5, 4), (31, 4), (31, zc), (27.5, zc)], 0, 360, 36, ["c_steel", "c_steel", "hatch", "c_steel_in"], cutmat="hatch")
    f.cyl((0, 0, 4), 27.5, 5, "c_steel_in", 28)                              # tube sheet
    for z, r in ((4, 33), (zc - 2.6, 31.8)):
        f.cone(B(0, 0, z), B(0, 0, z + 2.6), r, r, "c_band", 28, True, False)
    for k, rho in enumerate((5, 8.5, 12, 15.5, 19, 22.5)):                 # U-tube lines: two legs and an arch in a vertical plane
        for sgn in (-1, 1):
            for yo in (-9 + (k % 2) * 3, -3, 4 + (k % 2) * 2, 11):
                if abs(yo) > math.sqrt(max(0, 26 ** 2 - rho ** 2)) - 1:
                    continue
                pts = [Vector((sgn * rho * 0.0 + (-rho), -yo, 9)), Vector((-rho, -yo, 33))] + \
                      [Vector((-rho * math.cos(math.pi * q / 8), -yo, 33 + 9 * math.sin(math.pi * q / 8))) for q in range(1, 8)] + \
                      [Vector((rho, -yo, 33)), Vector((rho, -yo, 9))]
                f.tube(pts, 0.8, "c_pale", 4, caps=False)
            break
    f.pop()


def rcp(f, gx, gy):
    f.push(place(gx, gy, 0))
    f.cyl((0, 0, 0), 13, 18, "c_steel", 20)                      # pump casing
    f.cone(B(13, 0, 9), B(24, 0, 9), 5, 5, "c_steel", 12, True)
    f.cyl((0, 0, 18), 5.5, 12, "c_pale", 10)                     # shaft and coupling
    f.cyl((0, 0, 30), 12.5, 34, "c_steel", 24)                   # motor
    for z in (36, 44, 52, 60):
        f.cone(B(0, 0, z), B(0, 0, z + 1.6), 13.6, 13.6, "c_band", 24, True, False)
    f.ellipsoid((0, 0, 64), (11, 11, 7), "c_dome", u=18, v=8)
    f.cyl((0, 0, 70), 4.5, 6, "c_pale", 10)
    f.pop()


def pressuriser(f, gx, gy):
    f.push(place(gx, gy, 0))
    f.cyl((0, 0, 0), 19, 14, "c_dark", 22)
    f.cyl((0, 0, 14), 15, 96, "c_steel", 24)
    f.ellipsoid((0, 0, 110), (15, 15, 15), "c_dome", u=20, v=8)
    for z in (14, 60, 108):
        f.cone(B(0, 0, z), B(0, 0, z + 2.4), 17, 17, "c_band", 24, True, False)
    f.cyl((0, 0, 124), 5, 9, "c_pale", 10)
    f.cone(Vector((0, 0, 90)), Vector((-1, 0, 90)) + Vector((0, 0, 0)), 0.1, 0.1, "c_steel", 4)
    f.pop()


def containment_rooms(cx):
    """Paired concrete cubicles on both flanks, four steam generators and RCP motors, one pressuriser."""
    m = cx.mesher("cubicles"); f = cx.mesher("cubicles_f")
    TALL, LOW = 148.0, 52.0
    for side, T in flank_blocks():
        # block extents in (gx, gy) for the left flank; T maps to the right one
        def box(x0, y0, x1, y1, z1, cut=("top",)):
            (a, b), (c, d) = T(x0, y0), T(x1, y1)
            ck = []
            for k in cut:
                ck.append(k if (k == "top" or side == "L") else {"+gx": "+gy", "+gy": "+gx", "-gx": "-gy", "-gy": "-gx"}[k])
            concrete_box(m, a, b, c, d, z1, tuple(ck))
        # outer (rear-left) wall: tall over the rear cubicle, low over the front one; rear wall of the block; divider; low kerbs
        box(-340, 70, -334, 202, TALL, ("top", "+gy"))
        box(-340, 202, -334, 330, LOW, ("top", "+gy"))
        box(-340, 70, -220, 76, TALL, ("top", "+gx"))                  # rear wall behind the rear SG
        box(-340, 198, -220, 204, LOW, ("top", "+gx"))               # divider, cut low
        box(-226, 76, -220, 198, 26, ("top", "+gy"))                  # near kerb toward the drum
        box(-226, 204, -220, 330, 26, ("top", "+gy"))
        box(-340, 324, -220, 330, 26, ("top", "+gx"))
        # equipment
        for k, (gy_, tall) in enumerate(((118.0, True), (250.0, False))):
            sx, sy = T(-285, gy_)
            (steam_gen_tall if tall else steam_gen_cut)(f, sx, sy)
            px, py = T(-285, gy_ + (66 if tall else 63))
            rcp(f, px, py)
    px, py = T(-292, 135)[0], T(-292, 135)[1]
    # pressuriser beside one rear generator (right flank, toward the rear)
    pressuriser(f, 14.0, -300.0)
    cx.done(m, "cont", cx.reg["site"]); cx.done(f, "contf", cx.reg["site"])


def rear_wall_features(cx):
    f = cx.mesher("wall_f"); m = cx.mesher("wall_m")
    Rin = R - WT
    # liner line on the inner face (thin pale band low on the wall) and a second near the top
    for z, h in ((4.0, 1.2), (H_WALL - 30, 1.0)):
        m.sector(Rin - 0.9, Rin, -225, -45, z, z + h, 72, {"*": "liner"})
    # equipment hatch (round, bolted) and personnel airlock on the rear wall at floor level
    for ang, kind in ((-146, "hatch"), (-118, "lock")):
        a = math.radians(ang)
        n_in = Vector((-math.cos(a), math.sin(a), 0))             # inward normal in B (towards centre)
        p = B(*pol(Rin, ang), 0) 
        if kind == "hatch":
            c = p + Vector((0, 0, 30)) + n_in * 0.4
            f.cone(c, c + n_in * 3.0, 27, 27, "c_steel", 28, True, False)
            f.cone(c + n_in * 3.0, c + n_in * 5.0, 21, 21, "c_conc_top", 28, True, False)
            f.cone(c + n_in * 5.0, c + n_in * 6.2, 5, 5, "c_pale", 12, True, False)
            for k in range(20):
                b = 2 * math.pi * k / 20
                tang = Vector((math.sin(a), math.cos(a), 0)).normalized()
                q = c + tang * math.cos(b) * 24 + Vector((0, 0, math.sin(b) * 24)) + n_in * 3.0
                f.cone(q, q + n_in * 2.0, 1.2, 1.2, "c_pale", 6, True, False)
        else:
            c = p + Vector((0, 0, 16)) + n_in * 1.0
            f.cone(c, c + n_in * 26, 13, 13, "c_steel", 20, True, False)
            f.cone(c + n_in * 26, c + n_in * 28.5, 11, 11, "c_conc_top", 20, True, False)
            f.cone(c + n_in * 10, c + n_in * 12, 14.2, 14.2, "c_band", 20, True, False)
            f.cone(c + n_in * 22, c + n_in * 24, 14.2, 14.2, "c_band", 20, True, False)
    # polar crane ring girder on the upper inner face of the rear half-wall, with brackets
    zg = H_WALL - 22
    m.sector(Rin - 9, Rin, -225, -45, zg, zg + 12, 90, {"outer": "c_steel", "inner": "c_steel", "top": "c_steel_in", "bottom": "c_steel_in", "end": "hatch", "*": "c_steel"})
    f.sector(Rin - 9.6, Rin - 9, -225, -45, zg + 4, zg + 5.2, 90, {"*": "c_pale"})
    for a in range(-222, -47, 6):
        x, y = pol(Rin, a)
        f.box((x, -y, zg - 5), (3.0, 3.0, 10.0), "c_dark", rot=(0, 0, math.radians(a)))
    # cable trays and a pipe rack on the rear wall
    f.tube(arc_pts(Rin - 4, -218, -52, 112, 90), 2.8, "c_steel_in", 8)
    f.tube(arc_pts(Rin - 4, -218, -52, 96, 90), 1.9, "c_dark", 8)
    for a in range(-216, -50, 12):
        x, y = pol(Rin - 3, a)
        f.box((x, -y, 104), (2, 2, 18), "c_dark", rot=(0, 0, math.radians(a)))
    cx.done(m, "cont", cx.reg["site"]); cx.done(f, "contf", cx.reg["site"])
    # phantom bridge: faint outline spanning the cut ends of the girder, trolley parked at one side
    gh = cx.mesher("phantom")
    d = Vector((0.7071, 0.7071, 0.0))                          # B direction of the layout chord (-225 -> -45): (1,-1)/sqrt2 -> B (1, 1)/sqrt2
    zb = H_WALL - 3
    half = Rin * 0.998
    for off in (-7, 7):
        c = Vector((0, 0, zb)) + Vector((-0.7071, 0.7071, 0)) * off
        gh.box(c, (2 * half, 2.0, 3.5), "ghost", rot=(0, 0, math.atan2(d.y, d.x)))
    for sgn in (-1, 1):
        e = d * half * sgn
        gh.box(Vector((e.x, e.y, zb)), (3, 20, 4.0), "ghost", rot=(0, 0, math.atan2(d.y, d.x)))
    tr = d * (-half * 0.6)
    gh.box(Vector((tr.x, tr.y, zb + 4)), (12, 20, 5.0), "ghost", rot=(0, 0, math.atan2(d.y, d.x)))
    cx.done(gh, "ghost", cx.reg["site"])


def centre_lines(cx):
    """Dash-dot centre lines on the floor through the containment on both axes (long, gap, dot, gap)."""
    c = cx.mesher("centre")
    pattern = (22, 5, 2.5, 5)
    ext = R - WT - 6
    for ax in ((1, 0), (0, 1)):
        pos, i = -ext, 0
        while pos < ext:
            seg = pattern[i % 4]
            if i % 2 == 0:
                a, b = max(pos, -ext), min(pos + seg, ext)
                gx0, gy0, gx1, gy1 = ax[0] * a, ax[1] * a, ax[0] * b, ax[1] * b
                w = 0.55
                c.lbox(min(gx0, gx1) - w * ax[1], min(gy0, gy1) - w * ax[0], max(gx0, gx1) + w * ax[1], max(gy0, gy1) + w * ax[0], 0.05, 0.25, "cl")
            pos += seg; i += 1
    cx.done(c, "none", cx.reg["site"])


def scram_lights(cx):
    """Red emergency fixtures (SCRAM): wall washers on the rear wall, deck lights at the cubicles and a beacon on the drum."""
    e = cx.mesher("trip_lights")
    for a in range(-216, -50, 12):
        x, y = pol(R - WT - 1.0, a)
        e.box((x, -y, H_WALL - 52), (6.0, 6.0, 9.0), "trip_em", rot=(0, 0, math.radians(a)))
        e.box((x, -y, H_WALL - 70), (3.0, 3.0, 22.0), "trip_em", rot=(0, 0, math.radians(a))) if a % 24 == 0 else None
        e.box((x, -y, H_WALL - 58), (9.0, 9.0, 1.6), "c_dark", rot=(0, 0, math.radians(a)))
    for gx, gy, z in ((-340 + 8, 120, 120), (-340 + 8, 258, 44), (120, -334 + 8, 120), (258, -334 + 8, 44), (-222, 140, 30), (140, -222, 30)):
        e.box(B(gx, gy, z), (7, 7, 8), "trip_em")
    e.cyl((0, 0, DRUM_H + 0.5), 1.0, 0.1, "trip_em", 6) if False else None
    for k in range(6):
        x, y = pol(DRUM_R - 8, 100 + 45 * k)
        e.box((x, -y, DRUM_H + 2), (6, 6, 5), "trip_em")
    cx.done(e, "none", cx.reg["site"])


def build_containment(cx, state):
    reg = cx.reg["site"]
    m = cx.mesher("shell"); f = cx.mesher("shell_f")
    # floor slab, back half-wall (cut at H, hatched top and ends) and the near lip (cut at LIP_C)
    m.sector(0.01, R, 0, 360, GROUND_Z, 0, 120, {"top": "c_floor", "*": "c_wall_out"}, closed=True)
    m.sector(R - WT, R, -225, -45, 0, H_WALL, 90, {"outer": "c_wall_out", "inner": "c_wall", "top": "hatch", "end": "hatch", "bottom": "c_wall"})
    m.sector(R - WT, R, -45, 135, GROUND_Z, LIP_C, 90, {"outer": "c_wall_out", "inner": "c_wall", "top": "hatch", "end": "hatch", "bottom": "c_wall"})
    # wall ribs on the inner face
    for a in range(-222, -47, 9):
        f.sector(R - WT - 1.6, R - WT, a, a + 1.4, 0, H_WALL - 24, 2, {"*": "c_dark"})
    cx.done(m, "cont", reg); cx.done(f, "contf", reg)
    shield_drum(cx)
    vessel(cx, None)
    containment_rooms(cx)
    rear_wall_features(cx)
    centre_lines(cx)
    if state == "scram":
        scram_lights(cx)


def strip(m, p0, p1, w, z0, z1, mat, ang_tol=None):
    """Flat strip between two layout points (gx, gy) as a rotated box in B space."""
    (x0, y0), (x1, y1) = p0, p1
    L = math.hypot(x1 - x0, y1 - y0)
    c = ((x0 + x1) / 2, -(y0 + y1) / 2, (z0 + z1) / 2)
    m.box(c, (L, w, z1 - z0), mat, rot=(0, 0, math.atan2(-(y1 - y0), x1 - x0)))


def room_centre(rm):
    return rm["x"] + rm["w"] / 2, rm["y"] + rm["d"] / 2


def site_structure(cx, reg):
    """v3 site structure so the space between the ring and the rooms is not a void: road markings (crossings at every room, arrows,
    stop bars), access paths from the ring road to every pad, concentric and radial cable trenches with cover ticks. The paving grid is
    a pattern in the ground material."""
    rr = LAY["params"]["ring_road"]
    mid = (rr["inner_radius"] + rr["outer_radius"]) / 2
    g0 = GROUND_Z
    mk = cx.mesher("markings")
    # access paths (ring road -> pad centre; the pad hides the end)
    for rm in LAY["rooms"]:
        cxr, cyr = room_centre(rm)
        r_c = math.hypot(cxr, cyr); ux, uy = cxr / r_c, cyr / r_c
        start = (ux * rr["outer_radius"], uy * rr["outer_radius"]) if r_c > rr["outer_radius"] else (ux * rr["inner_radius"], uy * rr["inner_radius"])
        strip(mk, start, (cxr, cyr), 26, g0, g0 + 1.2, "path")
        for sgn in (-1, 1):                                     # kerb lines
            ox, oy = -uy * 13 * sgn, ux * 13 * sgn
            strip(mk, (start[0] + ox, start[1] + oy), (cxr + ox, cyr + oy), 0.9, g0 + 1.2, g0 + 1.5, "road_line")
        # zebra crossing on the ring road
        ang = math.degrees(math.atan2(cyr, cxr))
        for k in range(-4, 5):
            tx, ty = -uy * k * 5.2, ux * k * 5.2
            a_ = (ux * (rr["inner_radius"] + 8) + tx, uy * (rr["inner_radius"] + 8) + ty)
            b_ = (ux * (rr["outer_radius"] - 8) + tx, uy * (rr["outer_radius"] - 8) + ty)
            strip(mk, a_, b_, 2.0, g0 + 2.5, g0 + 2.85, "road_mark")
    # direction chevrons on the ring road every 30 degrees (offset from the crossings)
    for a in range(7, 360, 30):
        for dr in (0,):
            c = pol(mid, a); t = (-math.sin(math.radians(a)), math.cos(math.radians(a))); n_ = (math.cos(math.radians(a)), math.sin(math.radians(a)))
            tip = (c[0] + t[0] * 12, c[1] + t[1] * 12)
            for sgn in (-1, 1):
                tail = (c[0] - t[0] * 6 + n_[0] * 11 * sgn, c[1] - t[1] * 6 + n_[1] * 11 * sgn)
                strip(mk, tail, tip, 2.0, g0 + 2.5, g0 + 2.85, "road_mark")
    # stop bars / edge dashes beside the ring road lanes
    for a in range(0, 360, 2):
        for r_ in (rr["inner_radius"] - 6, rr["outer_radius"] + 6):
            if a % 4 == 0:
                mk.sector(r_, r_ + 1.2, a, a + 1.6, g0, g0 + 0.5, 1, {"*": "road_line"}, smooth=False)
    cx.done(mk, "none", reg)
    # cable trenches: recessed-looking dark strips with lighter cover ticks
    tr = cx.mesher("trenches")
    r_t = 934.0
    tr.sector(r_t - 2.6, r_t + 2.6, 0, 360, g0, g0 + 0.7, 240, {"*": "trench"}, closed=True, smooth=False)
    for a in range(0, 360, 3):
        tr.sector(r_t - 3.4, r_t + 3.4, a, a + 0.45, g0 + 0.7, g0 + 0.95, 1, {"*": "trench_cap"}, smooth=False)
    r_in = rr["inner_radius"] - 24
    for a in range(15, 360, 30):                                     # radial trenches from the containment slab to the ring road
        p0, p1 = pol(R + 12, a), pol(r_in, a)
        strip(tr, p0, p1, 5.0, g0, g0 + 0.7, "trench")
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); n = int(L // 14)
        for k in range(n):
            q = (p0[0] + (p1[0] - p0[0]) * (k + 0.5) / n, p0[1] + (p1[1] - p0[1]) * (k + 0.5) / n)
            c, s_ = math.cos(math.radians(a)), math.sin(math.radians(a))
            strip(tr, (q[0] - s_ * 3.4, q[1] + c * 3.4), (q[0] + s_ * 3.4, q[1] - c * 3.4), 0.5, g0 + 0.7, g0 + 0.95, "trench_cap")
    # trench ring inside the containment apron
    r_a = R + 30
    tr.sector(r_a - 1.6, r_a + 1.6, 0, 360, g0, g0 + 0.6, 200, {"*": "trench"}, closed=True, smooth=False)
    cx.done(tr, "none", reg)


# ------------------------------------------------------------------------------------------------ site
def build_site(cx, state=None, with_pads=True):
    reg = cx.reg["site"]
    g = cx.mesher("ground")
    g.box((0, 0, GROUND_Z - 0.5), (9000, 9000, 1), {"top": "ground", "*": "ground"})
    cx.done(g, "none", reg)
    rr = LAY["params"]["ring_road"]
    rd = cx.mesher("road")
    rd.sector(rr["inner_radius"], rr["outer_radius"], 0, 360, GROUND_Z, GROUND_Z + 2.5, 180, {"top": "road", "*": "road"}, closed=True, smooth=False)
    mid = (rr["inner_radius"] + rr["outer_radius"]) / 2
    for r_ in (rr["inner_radius"] + 2, rr["outer_radius"] - 3):
        rd.sector(r_, r_ + 1.0, 0, 360, GROUND_Z + 2.5, GROUND_Z + 2.8, 180, {"*": "road_line"}, closed=True, smooth=False)
    for k in range(0, 360, 4):               # dashed centre line
        rd.sector(mid - 0.6, mid + 0.6, k, k + 2.2, GROUND_Z + 2.5, GROUND_Z + 2.8, 1, {"*": "road_line"}, smooth=False)
    cx.done(rd, "none", reg)
    site_structure(cx, reg)
    # low utility rack along the inside of the ring road
    ur = cx.mesher("util_rack")
    rin = rr["inner_radius"] - 9
    ur.tube(arc_pts(rin, 0, 360, GROUND_Z + 9, 240)[:-1] + [arc_pts(rin, 0, 360, GROUND_Z + 9, 240)[0]], 1.5, "rack", 6)
    ur.tube(arc_pts(rin, 0, 360, GROUND_Z + 5, 240)[:-1] + [arc_pts(rin, 0, 360, GROUND_Z + 5, 240)[0]], 1.0, "rack", 6)
    for a in range(0, 360, 5):
        x, y = pol(rin, a)
        ur.box((x, -y, GROUND_Z + 5.5), (1.6, 1.6, 11), "rack")
    cx.done(ur, "fine", reg)
    # covered cable runs (spurs) to each pad, uniform dim
    seen = set()
    pm = cx.mesher("spurs")
    for p in LAY["pipelines"]:
        z = GROUND_Z + 3.4
        pts = []
        for x, y in p["points"]:
            inside = any(r_["x"] - 1 <= x <= r_["x"] + r_["w"] + 1 and r_["y"] - 1 <= y <= r_["y"] + r_["d"] + 1 for r_ in LAY["rooms"])
            if not inside:
                pts.append(B(x, y, z))
        if len(pts) < 2:
            continue
        pm.tube(pts, 3.0 if p["kind"] == "stage" else 2.4, "duct", 6)
        acc = 0.0
        for i in range(1, len(pts)):
            acc += (pts[i] - pts[i - 1]).length
            if acc > 110:
                acc = 0
                key = (round(pts[i].x / 30), round(pts[i].y / 30))
                if key in seen:
                    continue
                seen.add(key)
                ring_at(pm, pts[i], (pts[min(i + 1, len(pts) - 1)] - pts[i - 1]).normalized(), 4.3, "duct", 2.0, 8)
    cx.done(pm, "fine", reg)
    if with_pads:
        pd = cx.mesher("pads")
        for rm in LAY["rooms"]:
            pd.lbox(rm["x"] - 6, rm["y"] - 6, rm["x"] + rm["w"] + 6, rm["y"] + rm["d"] + 6, GROUND_Z, -0.4, {"top": "pad", "*": "pad_side"})
        cx.done(pd, "main", reg)


def build(state="healthy", rooms=True, site=True, crew=True, only=None, lit_ids=None, book=None, contain=True, crew_rooms=None, front=False):
    import rooms as RM
    book = book or make_book(state)
    cx = Ctx(book)
    if site and only is None:
        if contain:
            build_containment(cx, state)
        build_site(cx, state)
    if rooms:
        RM.build_all(cx, state, crew=crew, only=only, lit_ids=lit_ids, crew_rooms=crew_rooms, front=front)
    return cx
