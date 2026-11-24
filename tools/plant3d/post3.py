#!/usr/bin/env python3
"""v3 post: turns Blender raw layers into the app layer set, composites, sprites, registration report and manifest.
Usage: post3.py RAW_DIR OUT_DIR   (system python with Pillow + numpy). Layers are copied bit-exact apart from the core bloom and the SCRAM fill."""
import hashlib, json, math, sys, shutil
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import post as P0
ROOT = P0.ROOT
LAY, ORIGIN = P0.LAY, P0.ORIGIN
ANCH = json.loads((ROOT / "design/art/blockout/anchors.json").read_text())
W_, H_ = 2400, 1500
SCRAM_FILL_SCALE = 0.5            # v3: the style-pass crimson floor fill (#3a1119 ambient .. #6e1d26 at the lamps) halved
FILL_AMB, FILL_PEAK = "#3a1119", "#6e1d26"
SPRITE_SCALE, SPRITE_ANCHOR = 4.0, (256, 440)   # render-time anchor; see sprite shifting below
FEET_Y = 496
POSES = ("working", "waiting", "stuck", "needs-you", "walking")
GARBS = ("antic", "station")
COMPOSITE_ROOMS = ("your-office", "process", "mechanical", "electrical", "assurance", "review", "bench", "quarantine")
sha, hexrgb, proj, pol = P0.sha, P0.hexrgb, P0.proj, P0.pol


def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def bloom_rgba(raw_png, glow_png, k, radii, gain):
    """Add the soft Cherenkov falloff to a transparent core layer: premultiplied add; alpha grows where light lands on empty pixels."""
    im = np.asarray(Image.open(raw_png).convert("RGBA")).astype(np.float32) / 255
    a = im[..., 3:4]
    prem = im[..., :3] * a
    g = Image.open(glow_png).convert("RGB").resize((W_, H_), Image.BILINEAR)
    acc = np.zeros_like(prem)
    for w, r in zip(k, radii):
        acc += np.asarray(g.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255 * w
    acc = np.clip(acc * gain, 0, 1)
    # screen-add inside the layer where it is opaque, premultiplied add elsewhere
    prem2 = 1 - (1 - prem) * (1 - acc)
    a2 = np.clip(np.maximum(a[..., 0], lum(acc) * 1.6), 0, 1)[..., None]
    rgb = np.where(a2 > 1e-4, prem2 / np.maximum(a2, 1e-4), 0)
    return np.concatenate([np.clip(rgb, 0, 1), a2], 2)


def lamp_pixels():
    import scene_consts as C
    pts = []
    for a in range(-216, -50, 12):
        x, y = pol(C.R - C.WT - 1.0, a); pts.append((proj(x, y, C.H_WALL - 52), 70.0, 0.9))
    for gx, gy, z in ((-332, 120, 120), (-332, 258, 44), (120, -326, 120), (258, -326, 44), (-222, 140, 30), (140, -222, 30)):
        pts.append((proj(gx, gy, z), 110.0, 1.0))
    for k in range(6):
        x, y = pol(C.DRUM_R - 8, 100 + 45 * k); pts.append((proj(x, y, C.DRUM_H + 2), 80.0, 0.8))
    return pts


def scram_fill(rgba):
    """Crimson fill inside the containment, from the emergency lamps (screen blend, confined to the opaque layer pixels). Half of the style-pass values."""
    a = rgba[..., 3]
    yy, xx = np.mgrid[0:H_, 0:W_].astype(np.float32)
    pool = np.zeros((H_, W_), np.float32)
    for (px, py), sig, w in lamp_pixels():
        # screen-space ellipse (floor plane foreshortening 2:1)
        pool += w * np.exp(-(((xx - px) / sig) ** 2 + ((yy - py) / (sig * 0.62)) ** 2))
    pool = np.clip(pool, 0, 1)
    amb = np.array(hexrgb(FILL_AMB), np.float32) / 255 * SCRAM_FILL_SCALE
    peak = np.array(hexrgb(FILL_PEAK), np.float32) / 255 * SCRAM_FILL_SCALE
    fill = amb[None, None] + (peak - amb)[None, None] * pool[..., None]
    rgb = rgba[..., :3]
    out = 1 - (1 - rgb) * (1 - fill * a[..., None])
    return np.concatenate([out, a[..., None]], 2)


def to_img(arr):
    return Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def over(base, top):
    return Image.alpha_composite(base.convert("RGBA"), top.convert("RGBA"))


def centroid(mask):
    ys, xs = np.nonzero(mask)
    return (float(xs.mean()), float(ys.mean())) if len(xs) else None


def main():
    raw, out = Path(sys.argv[1]), Path(sys.argv[2])
    (out / "layers" / "rooms").mkdir(parents=True, exist_ok=True); (out / "sprites").mkdir(exist_ok=True); (out / "raw-params").mkdir(exist_ok=True)
    made = {}

    def save(img, rel, **kw):
        p = out / rel; p.parent.mkdir(parents=True, exist_ok=True); img.save(p, **kw)
        made[rel] = {"sha256": sha(p), "size": list(img.size), "bytes": p.stat().st_size}

    # ---- plate and overlay
    plate = Image.open(raw / "plate-dark.png").convert("RGBA")
    assert plate.size == (W_, H_)
    save(plate, "layers/plate-dark.png", optimize=True)
    save(P0.overlays("healthy"), "layers/overlay-ticks.png", optimize=True)
    # ---- core layers
    core = {}
    for name, st in (("core-healthy", "healthy"), ("core-tripped", "scram")):
        b = P0.BLOOM[st]
        arr = bloom_rgba(raw / f"{name}.png", raw / f"{name}_glow.png", b["k"], b["radii"], b["gain"])
        if st == "scram":
            arr = scram_fill(arr)
        core[name] = to_img(arr)
        save(core[name], f"layers/{name}.png", optimize=True)
    # ---- rooms
    stats = {}
    for rm in LAY["rooms"]:
        for v in ("lit", "front"):
            im = Image.open(raw / f"room_{rm['id']}_{v}.png").convert("RGBA")
            assert im.size == (W_, H_)
            save(im, f"layers/rooms/{rm['id']}-{v}.png", optimize=True)
            if v == "lit":
                al = np.asarray(im)[..., 3] > 128
                ys, xs = np.nonzero(al)
                bb = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
                stats[rm["id"]] = {"lit_alpha_bbox": bb, "anchors_bbox": ANCH["rooms"][rm["id"]]["bbox"],
                                   "bbox_delta_px": [bb[i] - ANCH["rooms"][rm["id"]]["bbox"][i] for i in range(4)]}
    # ---- sprites
    spr_anchor = {}
    sheet = Image.new("RGBA", (512 * 5, 512 * 2 + 120), (0, 14, 35, 255))
    for gi, garb in enumerate(GARBS):
        for pi, pose in enumerate(POSES):
            im = Image.open(raw / f"sprite_{garb}_{pose}.png").convert("RGBA")
            assert im.size == (512, 512)
            al = np.asarray(im)[..., 3]; bot = int(np.nonzero(al > 8)[0].max())
            dy = FEET_Y - bot                                   # shift so the lowest foot pixel sits at y = 496 (like design/art/source/crew-*.webp)
            sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); sh.alpha_composite(im, (0, dy)) if dy >= 0 else sh.alpha_composite(im.crop((0, -dy, 512, 512)), (0, 0))
            im = sh
            spr_anchor[f"{garb}-{pose}"] = [256, SPRITE_ANCHOR[1] + dy]
            assert np.asarray(im)[..., 3][0].max() == 0, "sprite touches the top edge"
            save(im, f"sprites/worker-{garb}-{pose}.png", optimize=True)
            sheet.alpha_composite(im, (pi * 512, gi * 512))
            small = im.resize((round(512 / SPRITE_SCALE), round(512 / SPRITE_SCALE)), Image.LANCZOS)
            sheet.alpha_composite(small, (pi * 512 + 200, 1024 + 10 + gi * 0))
    save(Image.open(raw / "sprite_ring.png").convert("RGBA"), "sprites/ring-needs-you.png", optimize=True)
    save(sheet, "sprites/workers-sheet.png", optimize=True)
    # ---- composites (direct renders with workers in COMPOSITE_ROOMS): bloom, vignette, overlays; scram fill inside the containment
    full = {}
    for name, st, out_name in (("full-healthy", "healthy", "healthy-2400.png"), ("full-scram", "scram", "scram-2400.png")):
        im = P0.finish(raw, name, st)
        if st == "scram":
            m = np.asarray(core["core-tripped"])[..., 3:4].astype(np.float32) / 255
            base = np.asarray(im.convert("RGB")).astype(np.float32) / 255
            filled = scram_fill(np.concatenate([base, np.ones_like(base[..., :1])], 2))[..., :3]
            # the fill is confined to the containment (layer alpha) and applied before the overlays' tick marks would matter (they are thin)
            im = Image.fromarray((np.clip(base * (1 - (m > 0.5)) + filled * (m > 0.5), 0, 1) * 255 + 0.5).astype(np.uint8))
        save(im.convert("RGB"), out_name, optimize=True)
        full[name] = im
    # ---- layer-stack consistency: plate + lit + front of the composite rooms + core-healthy versus a direct render with the same rooms lit and no workers
    stack = plate
    stack = over(stack, core["core-healthy"])
    for rid in COMPOSITE_ROOMS:
        stack = over(stack, Image.open(out / f"layers/rooms/{rid}-lit.png")); stack = over(stack, Image.open(out / f"layers/rooms/{rid}-front.png"))
    ref = P0.finish(raw, "stackref", "healthy", with_overlay=False) if (raw / "stackref.png").exists() else None
    stack_metric = None
    if ref is not None:
        # finish() applies the vignette; undo by rebuilding without it
        r0 = Image.open(raw / "stackref.png").convert("RGB")
        r0 = P0.bloom(r0, raw / "stackref_glow.png", k=P0.BLOOM["healthy"]["k"], radii=P0.BLOOM["healthy"]["radii"], gain=P0.BLOOM["healthy"]["gain"])
        d = np.abs(np.asarray(stack.convert("RGB")).astype(np.int32) - np.asarray(r0).astype(np.int32)).sum(2)
        stack_metric = {"mean_abs_diff_per_channel": round(float(d.mean() / 3), 3), "pixels_diff_gt_24": int((d > 24).sum()), "fraction_gt_24": round(float((d > 24).mean()), 5)}
        save(Image.fromarray(np.clip(d * 4, 0, 255).astype(np.uint8)), "diag/stack-vs-direct-diff.png", optimize=True)
        save(stack.convert("RGB"), "diag/stack-composite.png", optimize=True)
    # ---- registration: volumes (room + core), seat markers, sprite anchor, lit-layer bbox
    import registration
    reg = registration.main(raw)
    cols = json.loads((raw / "seat_markers_colors.json").read_text())
    mk = np.asarray(Image.open(raw / "seat_markers.png").convert("RGBA")).astype(int)
    seats = []
    for r in LAY["rooms"]:
        for i, s in enumerate(r["seats"]):
            nm = f"{r['id']}:{i + 1}"
            lp = proj(s["gx"], s["gy"])
            ap = ANCH["rooms"][r["id"]]["seats"][i]
            m = (np.abs(mk[..., :3] - np.array(cols[nm])).sum(2) < 10) & (mk[..., 3] > 100)
            c = centroid(m)
            seats.append({"id": nm, "room": r["id"], "n": i + 1, "garb": __import__("json").loads(json.dumps(None)) or None,
                          "feet_px": [round(lp[0], 2), round(lp[1], 2)],
                          "anchors_json_px": [ap["x"], ap["y"]], "delta_vs_anchors_json_px": [round(lp[0] - ap["x"], 3), round(lp[1] - ap["y"], 3)],
                          "blender_marker_px": [round(c[0], 2), round(c[1], 2)] if c else None,
                          "delta_blender_vs_anchors_px": [round(c[0] - ap["x"], 2), round(c[1] - ap["y"], 2)] if c else None})
    am = np.asarray(Image.open(raw / "anchor_marker.png").convert("RGBA")).astype(int)
    ac = centroid((am[..., 0] > 200) & (am[..., 3] > 100))
    sprite_anchor_delta = [round(ac[0] - SPRITE_ANCHOR[0], 2), round(ac[1] - SPRITE_ANCHOR[1], 2)]
    garb_tbl = json.loads((raw / "garb.json").read_text()) if (raw / "garb.json").exists() else {}
    for s in seats:
        s["garb"] = (garb_tbl.get("table") or {}).get(s["room"])
        pass
    sj = {"note": "feet_px = floor point under the worker's hips (the seat) in plate px (2400x1500). Draw sprite worker-<garb>-<pose>.png scaled by 1/4 (128 plate px square) so that its hip_floor_anchor_px_by_sprite[<garb>-<pose>] pixel lands on feet_px: top-left = feet_px - anchor/4. The lowest foot pixel of every sprite is at y=496 of the 512 sprite.",
          "ring_sprite": "sprites/ring-needs-you.png (512x512, ring centred on the worker floor point at (256,256), same 4 px per plate px)", "sprite": {"size": 512, "lowest_foot_y_px": FEET_Y, "px_per_plate_px": SPRITE_SCALE, "hip_floor_anchor_px_by_sprite": spr_anchor,
                     "measured_anchor_delta_px": sprite_anchor_delta, "measured_anchor_note": "marker disc rendered at the render-time anchor (256,440) vs its centroid"},
          "garb_mode": garb_tbl.get("mode"), "seats": seats}
    (out / "seat-feet.json").write_text(json.dumps(sj, indent=1)); made["seat-feet.json"] = {"sha256": sha(out / "seat-feet.json")}
    dl = [max(abs(v) for v in s["delta_vs_anchors_json_px"]) for s in seats]
    dm = [max(abs(v) for v in s["delta_blender_vs_anchors_px"]) for s in seats if s["delta_blender_vs_anchors_px"]]
    lit_max = max(max(abs(v) for v in s["bbox_delta_px"]) for s in stats.values())
    reg_sum = {"max_room_bbox_delta_px": reg["max_bbox_delta_px"], "max_boundary_px_99pct": reg["max_boundary_px_99pct"],
               "seat_feet_max_delta_vs_anchors_json_px": round(max(dl), 3), "seat_blender_marker_max_delta_px": round(max(dm), 2),
               "sprite_anchor_delta_px": sprite_anchor_delta, "lit_layer_bbox_vs_anchors_bbox_max_delta_px": lit_max,
               "stack_vs_direct": stack_metric, "lit_layers": stats, "rooms_detail": reg["rooms"]}
    reg_sum["pass_le_2px"] = bool(reg["max_bbox_delta_px"] <= 2 and max(dm) <= 2 and max(abs(v) for v in sprite_anchor_delta) <= 2)
    (out / "registration.json").write_text(json.dumps(reg_sum, indent=1))
    params = {f.stem.replace("render_params_", ""): json.loads(f.read_text()) for f in sorted(raw.glob("render_params_*.json"))}
    files = {}
    for f in sorted(out.rglob("*")):
        if f.is_file() and f.name != "manifest.json":
            files[str(f.relative_to(out))] = {"sha256": sha(f), "bytes": f.stat().st_size}
    man = {"version": "plant3d-v3", "blender": "5.3 (bpy module), Cycles CPU, OIDN denoise, Freestyle linework", "camera": "ortho true-iso, one camera for every layer, canvas 2400x1500",
           "stack_order": ["layers/plate-dark.png", "layers/core-healthy.png | layers/core-tripped.png", "layers/rooms/<id>-lit.png", "sprites/worker-<garb>-<pose>.png at seat-feet.json", "layers/rooms/<id>-front.png", "layers/overlay-ticks.png"],
           "garb": garb_tbl, "scram_fill": {"style_pass_values": [FILL_AMB, FILL_PEAK], "scale": SCRAM_FILL_SCALE},
           "render_runs": params, "registration": {k: v for k, v in reg_sum.items() if k not in ("lit_layers", "rooms_detail")}, "files": files}
    (out / "manifest.json").write_text(json.dumps(man, indent=1))


if __name__ == "__main__":
    main()
