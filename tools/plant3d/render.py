"""Render driver for the Blender plant spike. Run with a Python that has `bpy` (Blender as a module):

  python render.py --mode healthy|scram|site|rooms|sprites|volumes|all [--scale 1.0] [--out DIR]

Cycles on CPU, emission-only materials (flat tone computed in-shader), Freestyle for the pale-cyan linework, a separate cheap glow pass
(shaded parts zeroed) that post.py blurs into bloom. Camera: orthographic true-isometric, registered to proj() in common.py.
Outputs raw PNGs + params into DIR/raw; post.py composites overlays and writes the deliverables and the manifest.
"""
import argparse, hashlib, json, math, sys, time
from pathlib import Path
import bpy
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as K
import kit, scene as S, worker as W
from mathutils import Matrix

LINE_MAIN, LINE_FINE, LINE_OUT = "#cfeeff", "#86cde8", "#e6f9ff"
PARAMS = {"engine": "CYCLES/CPU", "samples": 20, "ao_samples": 4, "denoiser": "OPENIMAGEDENOISE", "filter_width": 1.1,
          "view_transform": "Standard", "crease_angle_deg": 120, "thickness_px_at_2400": {"outer": 2.6, "main": 1.1, "fine": 0.75},
          "line_colors": [LINE_OUT, LINE_MAIN, LINE_FINE], "camera": "ortho true-iso rot=(54.7356,0,45) scale=2400/sqrt(1.5)"}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def setup_render(scale, samples, transparent, freestyle=True, glow=False, res=None, cam_centre=None):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    cy.device = "CPU"; cy.samples = samples; cy.use_adaptive_sampling = False
    cy.max_bounces = 2; cy.transparent_max_bounces = 10; cy.use_denoising = not glow
    cy.denoiser = "OPENIMAGEDENOISE"; cy.filter_width = PARAMS["filter_width"]
    cy.denoising_prefilter = "FAST"
    sc.render.threads_mode = "AUTO"
    sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
    sc.display_settings.display_device = "sRGB"; sc.render.dither_intensity = 0.0
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"; sc.render.image_settings.compression = 12
    w = bpy.data.worlds.new("W"); w.use_nodes = True
    bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = kit.lin(kit.P["ground"]); bg.inputs[1].default_value = 1.0
    sc.world = w
    sc.render.use_freestyle = freestyle
    K.make_camera(bpy, scale=scale, centre_px=cam_centre, res=res)
    sc.render.use_border = False


def setup_freestyle(cx, tscale):
    sc = bpy.context.scene
    vl = sc.view_layers[0]
    vl.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(PARAMS["crease_angle_deg"])
    for l in list(fs.linesets):
        fs.linesets.remove(l)

    def mk(name, coll, thick, hexcol, alpha, outer=False):
        ls = fs.linesets.new(name)
        ls.select_by_visibility = True; ls.select_by_edge_types = True; ls.select_by_collection = True
        ls.collection = coll
        ls.select_silhouette = not outer; ls.select_border = not outer; ls.select_crease = not outer
        ls.select_external_contour = outer
        st = bpy.data.linestyles.new(name)
        st.color = kit.lin(kit.srgb(hexcol))[:3]; st.alpha = alpha; st.thickness = thick * tscale
        st.thickness_position = "CENTER"
        ls.linestyle = st
    t = PARAMS["thickness_px_at_2400"]
    mk("outer", cx.c_main, t["outer"], LINE_OUT, 0.95, outer=True)
    mk("main", cx.c_main, t["main"], LINE_MAIN, 0.85)
    mk("fine", cx.c_fine, t["fine"], LINE_FINE, 0.75)


def do_render(path):
    sc = bpy.context.scene
    sc.render.filepath = str(path)
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t0


def render_pair(cx, out, name, scale, samples, transparent=False, border=None, glow_pass=True, res=None, cam_centre=None, tscale=None):
    """Main render (+ glow pass). border: canvas-px bbox (x0,y0,x1,y1) to crop to. Returns dict of timings."""
    sc = bpy.context.scene
    ts = tscale if tscale is not None else max(scale, 0.6)
    setup_render(scale, samples, transparent, True, False, res, cam_centre)
    setup_freestyle(cx, ts)
    res_ = (sc.render.resolution_x, sc.render.resolution_y)
    if border:
        x0, y0, x1, y1 = border
        sc.render.use_border = True; sc.render.use_crop_to_border = True
        sc.render.border_min_x, sc.render.border_max_x = x0 / res_[0], x1 / res_[0]
        sc.render.border_min_y, sc.render.border_max_y = 1 - y1 / res_[1], 1 - y0 / res_[1]
    times = {"main": do_render(out / "raw" / f"{name}.png")}
    if glow_pass:
        cx.book.set_glow(1.0)
        sc.render.use_freestyle = False
        sc.cycles.samples = 5; sc.cycles.use_denoising = False
        sc.render.resolution_percentage = 50
        sc.render.film_transparent = True
        times["glow"] = do_render(out / "raw" / f"{name}_glow.png")
        cx.book.set_glow(0.0)
    return times


def volumes(out, scale=1.0):
    """Blockout volumes rendered as flat id colours (registration check). Same geometry rules as render_blockout.room_polys/core_polys."""
    reset()
    book = kit.Book("vol_")
    cx = S.Ctx(book)
    LAY = K.LAYOUT
    ids = [r["id"] for r in LAY["rooms"]] + ["core"]
    for i, pid in enumerate(ids):
        c = ((i + 1) * 37 % 256 / 255, (i + 1) * 91 % 256 / 255, (i + 1) * 53 % 256 / 255)
        book.tone(pid, (0, 0, 0), amb=None, ao=0, emit=c, emit_k=1.0)
    colors = {}
    for i, pid in enumerate(ids):
        colors[pid] = [round(v * 255) for v in ((i + 1) * 37 % 256 / 255, (i + 1) * 91 % 256 / 255, (i + 1) * 53 % 256 / 255)]
    g = cx.mesher("ground"); book.tone("bgc", (0, 0, 0), amb=None, ao=0)
    for rm in LAY["rooms"]:
        m = cx.mesher("v_" + rm["id"])
        x0, y0, x1, y1, h, t, lip = rm["x"], rm["y"], rm["x"] + rm["w"], rm["y"] + rm["d"], rm["wall_height"], 7, LAY["params"]["lip_height"]
        mt = rm["id"]
        m.lbox(x0, y0, x1, y1, -0.01, 0, mt)
        m.lbox(x0, y0, x1, y0 + t, 0, h, mt); m.lbox(x0, y0 + t, x0 + t, y1, 0, h, mt)
        m.lbox(x0, y1 - t, x1, y1, 0, lip, mt); m.lbox(x1 - t, y0 + t, x1, y1 - t, 0, lip, mt)
        cx.done(m, "none", cx.reg["site"])
    m = cx.mesher("v_core"); C = LAY["core"]; R = C["radius"]
    m.sector(0.01, R, 0, 360, -0.01, 0, 120, {"*": "core"}, closed=True)
    m.sector(R - 14, R, -225, -45, 0, C["wall_height"], 72, {"*": "core"})
    m.sector(R - 14, R, -45, 135, 0, C["lip_height"], 72, {"*": "core"})
    m.sector(0.01, C["vessel_radius"], 0, 360, 0, C["vessel_height"], 72, {"*": "core"}, closed=True)
    cx.done(m, "none", cx.reg["site"])
    sc = bpy.context.scene
    setup_render(scale, 8, True, False, False)
    sc.cycles.use_denoising = False; sc.cycles.filter_width = 0.01; sc.cycles.samples = 1
    t = do_render(out / "raw" / "volumes.png")
    (out / "raw" / "volumes_colors.json").write_text(json.dumps(colors))
    return {"volumes": t}


def sprites(out, state="healthy"):
    times = {}
    reset()
    poses = ["working", "waiting", "stuck", "needs-you", "walking"]
    sc_ = 4.0
    for pose in poses:
        reset()
        book = S.make_book(state)
        cx = S.Ctx(book)
        m = cx.mesher("spr"); f = cx.mesher("sprw")
        seated = W.POSES[pose]["seated"]
        if seated:
            S.station(m, 0, 0, 0.0, "screen_on", True, "desk", True)
            f.push(Matrix.Identity(4)); W.build_worker(f, pose)
        else:
            if pose == "needs-you":
                f.push(Matrix.Rotation(S.yaw_for(0.55, 1.0), 4, "Z")); W.build_worker(f, pose)
            else:
                f.push(Matrix.Rotation(S.yaw_for(1, 0), 4, "Z")); W.build_worker(f, pose)
        cx.done(m, "fine", cx.reg["site"]); cx.done(f, "fine", cx.reg["crew"].setdefault("x", []))
        if pose == "needs-you":
            ring = cx.mesher("ring"); ring.sector(7.5, 9.0, 0, 360, 0, 0.5, 40, {"*": "amber_ring"}, closed=True); ring.sector(13.5, 14.5, 0, 360, 0, 0.5, 40, {"*": "amber_ring"}, closed=True)
            cx.done(ring, "none", cx.reg["site"])
        times[pose] = render_pair(cx, out, f"sprite_{pose}", sc_, 24, True, res=(520, 520), cam_centre=K.proj(0, 0, 30), tscale=2.6)
    return times


def full(out, state, scale, samples, name, rooms=True, site=True, only=None, lit_ids=None, border=None, transparent=False, crew=True):
    reset()
    cx = S.build(state, rooms=rooms, site=site, only=only, lit_ids=lit_ids, crew=crew)
    return render_pair(cx, out, name, scale, samples, transparent, border=border)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="healthy"); ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--samples", type=int, default=PARAMS["samples"]); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out = Path(a.out); (out / "raw").mkdir(parents=True, exist_ok=True)
    timings = {}
    suffix = "" if a.scale == 1.0 else f"_{a.scale}"
    modes = ["healthy", "site", "scram", "rooms", "sprites", "volumes"] if a.mode == "all" else [a.mode]
    for md in modes:
        t0 = time.time()
        if md == "healthy":
            timings[md] = full(out, "healthy", a.scale, a.samples, "healthy" + suffix)
        elif md == "scram":
            timings[md] = full(out, "scram", a.scale, a.samples, "scram" + suffix)
        elif md == "site":
            timings[md] = full(out, "healthy", a.scale, a.samples, "site" + suffix, rooms=False)
        elif md == "rooms":
            anchors = json.loads((K.ART / "blockout" / "anchors.json").read_text())["rooms"]
            for rid in ("your-office", "process"):
                x0, y0, x1, y1 = anchors[rid]["bbox"]
                bb = (max(0, x0 - 8), max(0, y0 - 40), min(2400, x1 + 8), min(1500, y1 + 8))
                for lit in (True, False):
                    timings[f"{md}_{rid}_{'lit' if lit else 'dark'}"] = full(out, "healthy", 1.0, a.samples, f"room_{rid}_{'lit' if lit else 'dark'}",
                                                                              site=False, only=[rid], lit_ids=[rid] if lit else [], border=bb, transparent=True)
                    (out / "raw" / f"room_{rid}_{'lit' if lit else 'dark'}.bbox.json").write_text(json.dumps(bb))
        elif md == "sprites":
            timings[md] = sprites(out)
        elif md == "volumes":
            timings[md] = volumes(out, a.scale)
        timings[md + "_wall_s"] = round(time.time() - t0, 1)
        print(md, timings[md + "_wall_s"], flush=True)
    (out / "raw" / f"render_params_{a.mode}{suffix}.json").write_text(json.dumps({"params": PARAMS, "scale": a.scale, "timings_s": timings}, indent=1, default=str))


if __name__ == "__main__":
    main()
