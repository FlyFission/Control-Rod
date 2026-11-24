"""v3 layer pipeline (bpy side). Every layer is rendered from the SAME camera (common.make_camera, canvas 2400x1500, scale 1) so the app can
composite them with zero offset:  plate-dark  <  core-healthy | core-tripped  <  room lit overlays  <  worker sprites  <  room front layers.

  plate        site + every room DARK, no workers, no containment                        (opaque)
  core-*       the whole containment (shell, shield, vessel, fuel, cubicles, lamps)       (transparent outside), glow pass for post bloom
  room lit     one room, lit, transparent elsewhere                                       (render border = room bbox: speed only)
  room front   the near walls and lip of one room only
  sprites      512x512 per pose per garb, camera angle of the plant, lowest foot pixel at y=496 (per-sprite hip anchor in seat-feet.json), 6 px per plate px
  composites   everything at once with workers in COMPOSITE_ROOMS (garb per room)
  markers      flat id colours at seat floor points / sprite anchor / room volumes for the registration check
"""
import json, math, time
from pathlib import Path
import bpy
import common as K
import kit, scene as S, rooms as RM, worker as W
import render as R

ANCH = json.loads((K.ART / "blockout" / "anchors.json").read_text())
SPRITE_PX, SPRITE_SCALE, SPRITE_ANCHOR = 512, 4.0, (256, 440)   # v4: 4 px per plate px with a 1.5x model = the v3 sprite pixels, drawn 1.5x larger in the plate   # render anchor (floor point under the hips); post shifts each sprite so its lowest foot pixel sits at y=496
POSES = ("working", "waiting", "stuck", "needs-you", "walking")
GARBS = ("antic", "station")


def room_border(rid, pad=24):
    x0, y0, x1, y1 = ANCH["rooms"][rid]["bbox"]
    return (max(0, x0 - pad), max(0, y0 - pad - 60), min(2400, x1 + pad), min(1500, y1 + pad))


def render_plate(out, samples):
    R.reset()
    cx = S.build("healthy", rooms=True, site=True, crew=False, lit_ids=set(), contain=False)
    return {"plate": R.render_pair(cx, out, "plate-dark", 1.0, samples, "healthy", False, glow_pass=False)}


def render_core(out, state, samples):
    R.reset()
    book = S.make_book(state)
    cx = S.Ctx(book)
    S.build_containment(cx, state)
    return R.render_pair(cx, out, f"core-{'tripped' if state == 'scram' else 'healthy'}", 1.0, samples, state, True, glow_pass=True)


def render_rooms(out, samples, ids=None):
    t = {}
    for rm in K.LAYOUT["rooms"]:
        rid = rm["id"]
        if ids and rid not in ids:
            continue
        bd = room_border(rid)
        for variant in ("lit", "front"):
            R.reset()
            cx = S.build("healthy", rooms=True, site=False, crew=False, only={rid}, lit_ids={rid}, front=(variant == "front"))
            t[f"{rid}_{variant}"] = R.render_pair(cx, out, f"room_{rid}_{variant}", 1.0, samples, "healthy", True, glow_pass=False, border=bd)["main"]
    return t


def sprite_yaw(pose):
    return -0.5 if W.POSES[pose]["seated"] else (RM.POSE_YAW["walk"] if pose == "walking" else RM.POSE_YAW["stand"])


def render_sprites(out, samples):
    """One transparent sprite per pose per garb, 512x512, 5 px per plate px, floor anchor at (256, 496). Seated sprites have no chair (the chair is in the room layer)."""
    t, meta = {}, {}
    p0 = K.proj(0, 0, 0)
    centre = (p0[0], p0[1] - (SPRITE_ANCHOR[1] - SPRITE_PX / 2) / SPRITE_SCALE)
    for garb in GARBS:
        for pose in POSES:
            R.reset()
            book = S.make_book("healthy")
            cx = S.Ctx(book)
            f = cx.mesher("spr")
            yaw = sprite_yaw(pose)
            f.push(S.place(0, 0, yaw)); W.build_worker(f, pose, "accent", garb=garb); f.pop()
            cx.done(f, "fine", cx.reg["site"])
            key = f"{garb}_{pose}"
            t[key] = R.render_pair(cx, out, f"sprite_{key}", SPRITE_SCALE, samples + 8, "healthy", True, glow_pass=False,
                                   res=(SPRITE_PX, SPRITE_PX), cam_centre=centre, tscale=2.6)["main"]
            meta[key] = {"garb": garb, "pose": pose, "seated": W.POSES[pose]["seated"], "yaw_rad": yaw}
    # needs-you floor ring as its own sprite (it extends further below the anchor than the canvas allows): centred, same scale
    R.reset(); book = S.make_book("healthy"); cx = S.Ctx(book)
    ring = cx.mesher("ring"); ring.sector(7.5 * W.WORKER_SCALE, 9.0 * W.WORKER_SCALE, 0, 360, 0, 0.5, 40, {"*": "amber_ring"}, closed=True)
    ring.sector(13.5 * W.WORKER_SCALE, 14.5 * W.WORKER_SCALE, 0, 360, 0, 0.5, 40, {"*": "amber_ring"}, closed=True)
    cx.done(ring, "none", cx.reg["site"])
    t["ring"] = R.render_pair(cx, out, "sprite_ring", SPRITE_SCALE, samples + 8, "healthy", True, glow_pass=False, res=(SPRITE_PX, SPRITE_PX), cam_centre=p0, tscale=2.6)["main"]
    (out / "raw" / "sprites_v3.json").write_text(json.dumps(meta, indent=1))
    return t


def render_full(out, state, samples, name, crew=True):
    R.reset()
    cr = {r: RM.CREW[r] for r in RM.COMPOSITE_ROOMS}
    cx = S.build(state, rooms=True, site=True, crew=crew, lit_ids=set(RM.COMPOSITE_ROOMS), crew_rooms=cr)
    return R.render_pair(cx, out, name, 1.0, samples, state, False, glow_pass=True)


def render_stack_ref(out, samples):
    """Full render with the composite rooms lit and no workers: reference for the layer-stack consistency check."""
    R.reset()
    cx = S.build("healthy", rooms=True, site=True, crew=False, lit_ids=set(RM.COMPOSITE_ROOMS))
    return R.render_pair(cx, out, "stackref", 1.0, samples, "healthy", False, glow_pass=True)


def render_markers(out):
    """Registration inputs: room/core volumes (flat id colours, as v2), seat floor-point discs, and a sprite anchor marker."""
    t = R.volumes(out, 1.0)
    # seat discs
    R.reset()
    book = kit.Book("mk_")
    cx = S.Ctx(book)
    cols = {}
    seats = [(r["id"], i, s) for r in K.LAYOUT["rooms"] for i, s in enumerate(r["seats"])]
    for k, (rid, i, s) in enumerate(seats):
        c = ((k + 1) * 37 % 255 / 255, (k + 1) * 91 % 255 / 255, (k + 1) * 53 % 255 / 255)
        nm = f"{rid}:{i + 1}"
        book.tone(nm, (0, 0, 0), amb=None, ao=0, emit=c, emit_k=1.0)
        cols[nm] = [round(v * 255) for v in c]
        m = cx.mesher("mk_" + nm.replace(":", "_"))
        m.cyl((s["gx"], -s["gy"], 0.0), 2.4, 0.2, nm, 12, smooth=False)
        cx.done(m, "none", cx.reg["site"])
    sc = bpy.context.scene
    R.setup_render(1.0, 8, True, False)
    sc.cycles.use_denoising = False; sc.cycles.filter_width = 0.01; sc.cycles.samples = 1
    t["seat_markers"] = R.do_render(out / "raw" / "seat_markers.png")
    (out / "raw" / "seat_markers_colors.json").write_text(json.dumps(cols))
    # sprite anchor marker: disc at the worker origin, sprite camera
    R.reset()
    book = kit.Book("ma_")
    cx = S.Ctx(book)
    book.tone("m", (0, 0, 0), amb=None, ao=0, emit=(1, 0, 0), emit_k=1.0)
    m = cx.mesher("anch"); m.cyl((0, 0, 0.0), 0.8, 0.2, "m", 12, smooth=False); cx.done(m, "none", cx.reg["site"])
    p0 = K.proj(0, 0, 0)
    centre = (p0[0], p0[1] - (SPRITE_ANCHOR[1] - SPRITE_PX / 2) / SPRITE_SCALE)
    R.setup_render(SPRITE_SCALE, 8, True, False, res=(SPRITE_PX, SPRITE_PX), cam_centre=centre)
    sc = bpy.context.scene
    sc.cycles.use_denoising = False; sc.cycles.filter_width = 0.01; sc.cycles.samples = 1
    t["anchor_marker"] = R.do_render(out / "raw" / "anchor_marker.png")
    (out / "raw" / "garb.json").write_text(json.dumps({"mode": S.GARB_MODE, "table": {r["id"]: S.garb_for(r["id"]) for r in K.LAYOUT["rooms"]}, "inside_containment": S.GARB["containment"],
                                                       "source_table": S.GARB}, indent=1))
    return t
