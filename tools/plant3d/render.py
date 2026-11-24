#!/usr/bin/env python3
"""Render driver for the Blender plant scene v2. Run with a Python that has `bpy` (Blender as a module):

  python render.py --mode healthy|scram|site|tiles|sprites|volumes|all [--scale 1.0] [--out DIR]

Cycles on CPU, emission-only flat materials (no lights; the fuel and its water volume are the only light), Freestyle for the
#255375 hairlines and the pale-cyan cut profiles, plus a small separate glow pass that post.py blurs into the core's soft falloff.
Camera: orthographic true-isometric, registered to proj() in common.py. Outputs raw PNGs and params into DIR/raw; post.py composites.
"""
import argparse, json, math, sys, time
from pathlib import Path
import bpy
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as K
import kit, scene as S, rooms as RM, worker as W
from mathutils import Matrix

EDGE, CUTL, TRIP = "#255375", "#9ddcf2", "#db535f"
PARAMS = {"engine": "CYCLES/CPU", "samples": 20, "denoiser": "OPENIMAGEDENOISE", "filter_width": 1.1, "view_transform": "Standard",
          "crease_angle_deg": 120, "thickness_px_at_2400": {"edge": 1.0, "fine": 0.7, "cut": 1.1},
          "line_colors": {"edge": EDGE, "cut": CUTL, "cut_scram": TRIP},
          "volume": {"step_rate": 1.0, "max_steps": 512},
          "camera": "ortho true-iso rot=(54.7356,0,45) scale=2400/sqrt(1.5)"}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def setup_render(scale, samples, transparent, freestyle=True, res=None, cam_centre=None, border=None):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    cy.device = "CPU"; cy.samples = samples; cy.use_adaptive_sampling = False
    cy.max_bounces = 2; cy.transparent_max_bounces = 10; cy.use_denoising = True
    cy.denoiser = "OPENIMAGEDENOISE"; cy.filter_width = PARAMS["filter_width"]; cy.denoising_prefilter = "FAST"
    cy.volume_step_rate = PARAMS["volume"]["step_rate"]; cy.volume_max_steps = PARAMS["volume"]["max_steps"]
    sc.render.threads_mode = "AUTO"
    sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
    sc.display_settings.display_device = "sRGB"; sc.render.dither_intensity = 0.0
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"; sc.render.image_settings.compression = 12
    w = bpy.data.worlds.new("W"); w.use_nodes = True
    bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = kit.lin(S.GROUND_COL); bg.inputs[1].default_value = 1.0
    sc.world = w
    sc.render.use_freestyle = freestyle
    K.make_camera(bpy, scale=scale, centre_px=cam_centre, res=res)
    sc.render.use_border = False
    if border:                      # (x0, y0, x1, y1) in output px, y from the top; pixels outside stay transparent, resolution unchanged
        W_, H_ = sc.render.resolution_x, sc.render.resolution_y
        sc.render.use_border = True; sc.render.use_crop_to_border = False
        sc.render.border_min_x, sc.render.border_max_x = border[0] / W_, border[2] / W_
        sc.render.border_min_y, sc.render.border_max_y = 1 - border[3] / H_, 1 - border[1] / H_


def setup_freestyle(cx, tscale, state):
    sc = bpy.context.scene
    vl = sc.view_layers[0]
    vl.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(PARAMS["crease_angle_deg"])
    for l in list(fs.linesets):
        fs.linesets.remove(l)
    t = PARAMS["thickness_px_at_2400"]

    def mk(name, coll, thick, hexcol, alpha, marks=False, dashed=False):
        ls = fs.linesets.new(name)
        ls.select_by_visibility = True; ls.select_by_edge_types = True; ls.select_by_collection = True
        ls.collection = coll
        ls.select_silhouette = ls.select_border = ls.select_crease = not marks
        ls.select_edge_mark = marks
        st = bpy.data.linestyles.new(name)
        st.color = kit.lin(kit.srgb(hexcol))[:3]; st.alpha = alpha; st.thickness = thick * tscale
        st.thickness_position = "CENTER"
        if dashed:
            st.use_dashed_line = True; st.dash1 = 7; st.gap1 = 6
        ls.linestyle = st
    cutcol = TRIP if state == "scram" else CUTL
    for n in ("cont", "contf", "main", "fine"):
        mk("e_" + n, cx.cols[n], t["fine"] if n in ("fine", "contf") else t["edge"], EDGE, 1.0)
    mk("e_ghost", cx.cols["ghost"], t["fine"], CUTL, 0.26, dashed=True)
    for n in ("cont", "contf"):
        mk("c_" + n, cx.cols[n], t["cut"] * (1.5 if state == "scram" else 1.0), cutcol, 0.95, marks=True)
    for n in ("main", "fine"):
        mk("c_" + n, cx.cols[n], t["cut"], CUTL, 0.9, marks=True)


def do_render(path):
    sc = bpy.context.scene
    sc.render.filepath = str(path)
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t0


def render_pair(cx, out, name, scale, samples, state="healthy", transparent=False, glow_pass=True, res=None, cam_centre=None, tscale=None, border=None):
    sc = bpy.context.scene
    ts = tscale if tscale is not None else max(scale, 0.6)
    setup_render(scale, samples, transparent, True, res, cam_centre, border)
    setup_freestyle(cx, ts, state)
    res_ = (sc.render.resolution_x, sc.render.resolution_y)
    cx.book.set_screen(res_, scale)
    times = {"main": do_render(out / "raw" / f"{name}.png")}
    if glow_pass:
        cx.book.set_glow(1.0)
        sc.render.use_freestyle = False
        sc.cycles.samples = 6; sc.cycles.use_denoising = False
        sc.render.resolution_percentage = 50
        sc.render.film_transparent = True
        times["glow"] = do_render(out / "raw" / f"{name}_glow.png")
        cx.book.set_glow(0.0)
    return times


def volumes(out, scale=1.0):
    """Blockout volumes as flat id colours (registration check); same geometry rules as tools/render_blockout.py room_polys/core_polys."""
    reset()
    book = kit.Book("vol_")
    cx = S.Ctx(book)
    LAY = K.LAYOUT
    ids = [r["id"] for r in LAY["rooms"]] + ["core"]
    colors = {}
    for i, pid in enumerate(ids):
        c = ((i + 1) * 37 % 256 / 255, (i + 1) * 91 % 256 / 255, (i + 1) * 53 % 256 / 255)
        book.tone(pid, (0, 0, 0), amb=None, ao=0, emit=c, emit_k=1.0)
        colors[pid] = [round(v * 255) for v in c]
    for rm in LAY["rooms"]:
        m = cx.mesher("v_" + rm["id"])
        x0, y0, x1, y1, h, t, lip = rm["x"], rm["y"], rm["x"] + rm["w"], rm["y"] + rm["d"], rm["wall_height"], 7, LAY["params"]["lip_height"]
        mt = rm["id"]
        m.lbox(x0, y0, x1, y1, -0.01, 0, mt)
        m.lbox(x0, y0, x1, y0 + t, 0, h, mt); m.lbox(x0, y0 + t, x0 + t, y1, 0, h, mt)
        m.lbox(x0, y1 - t, x1, y1, 0, lip, mt); m.lbox(x1 - t, y0 + t, x1, y1 - t, 0, lip, mt)
        cx.done(m, "none", cx.reg["site"])
    m = cx.mesher("v_core"); C = LAY["core"]; Rr = C["radius"]
    m.sector(0.01, Rr, 0, 360, -0.01, 0, 120, {"*": "core"}, closed=True)
    m.sector(Rr - 14, Rr, -225, -45, 0, C["wall_height"], 72, {"*": "core"})
    m.sector(Rr - 14, Rr, -45, 135, 0, C["lip_height"], 72, {"*": "core"})
    m.sector(0.01, C["vessel_radius"], 0, 360, 0, C["vessel_height"], 72, {"*": "core"}, closed=True)
    cx.done(m, "none", cx.reg["site"])
    sc = bpy.context.scene
    setup_render(scale, 8, True, False)
    sc.cycles.use_denoising = False; sc.cycles.filter_width = 0.01; sc.cycles.samples = 1
    t = do_render(out / "raw" / "volumes.png")
    (out / "raw" / "volumes_colors.json").write_text(json.dumps(colors))
    return {"volumes": t}


def full(out, state, scale, samples, name, **kw):
    reset()
    cx = S.build(state, **kw)
    return render_pair(cx, out, name, scale, samples, state)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="healthy"); ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--samples", type=int, default=PARAMS["samples"]); ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    out = Path(a.out); (out / "raw").mkdir(parents=True, exist_ok=True)
    timings = {}
    suffix = "" if a.scale == 1.0 else f"_{a.scale}"
    modes = ["healthy", "site", "scram", "tiles", "sprites", "volumes"] if a.mode == "all" else a.mode.split(",")
    import layers as LY
    for md in modes:
        t0 = time.time()
        if md == "v3-plate":
            timings[md] = LY.render_plate(out, a.samples)
        elif md == "v3-core":
            timings[md] = {"healthy": LY.render_core(out, "healthy", a.samples), "tripped": LY.render_core(out, "scram", a.samples)}
        elif md == "v3-rooms":
            timings[md] = LY.render_rooms(out, a.samples, a.only.split(",") if a.only else None)
        elif md == "v3-sprites":
            timings[md] = LY.render_sprites(out, a.samples)
        elif md == "v3-full":
            timings[md] = {"healthy": LY.render_full(out, "healthy", a.samples, "full-healthy"), "scram": LY.render_full(out, "scram", a.samples, "full-scram"),
                           "stackref": LY.render_stack_ref(out, a.samples)}
        elif md == "v3-markers":
            timings[md] = LY.render_markers(out)
        elif md == "healthy":
            timings[md] = full(out, "healthy", a.scale, a.samples, "healthy" + suffix)
        elif md == "scram":
            timings[md] = full(out, "scram", a.scale, a.samples, "scram" + suffix)
        elif md == "site":
            timings[md] = full(out, "healthy", a.scale, a.samples, "site" + suffix, rooms=False)
        elif md == "volumes":
            timings[md] = volumes(out, a.scale)
        elif md == "tiles":
            timings[md] = RM.render_tiles(out, a.samples, sys.modules[__name__], only=a.only.split(",") if a.only else None)
        elif md == "sprites":
            timings[md] = RM.render_sprites(out, a.samples, sys.modules[__name__])
        timings[md + "_wall_s"] = round(time.time() - t0, 1)
        print(md, timings[md + "_wall_s"], flush=True)
    (out / "raw" / f"render_params_{a.mode}{suffix}.json").write_text(json.dumps({"params": PARAMS, "scale": a.scale, "timings_s": timings}, indent=1, default=str))


if __name__ == "__main__":
    main()
