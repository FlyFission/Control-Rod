#!/usr/bin/env python3
"""Compose Blender raw renders (v2) into deliverables: soft core falloff from the glow pass, vignette, code-drawn engineering overlays
(margin ticks, corner marks, dash-dot vertical axis, a few unnumbered dimension ticks and leaders; no text), tiles, sprites, compare sheet, manifest.
Usage: post.py RAW_DIR OUT_DIR [--only healthy,scram,site,tiles,sprites,compare,manifest]   (system python with Pillow + numpy)"""
import hashlib, json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
ROOT = Path(__file__).resolve().parents[2]
LAY = json.loads((ROOT / "design/art/layout.json").read_text())
ORIGIN = LAY["projection"]["origin_screen"]
C, S = math.cos(math.radians(30)), math.sin(math.radians(30))
PAL = json.loads((ROOT / "design/art/palette.json").read_text())["roles"]
W_, H_ = 2400, 1500


def proj(gx, gy, gz=0.0):
    return (ORIGIN[0] + (gx - gy) * C, ORIGIN[1] + (gx + gy) * S - gz)


def pol(r, a):
    return (r * math.cos(math.radians(a)), r * math.sin(math.radians(a)))


def hexrgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def bloom(img, glow_path, k=(0.40, 0.32, 0.38), radii=(3, 12, 46), gain=1.0):
    a = np.asarray(img.convert("RGB")).astype(np.float32) / 255
    g = Image.open(glow_path).convert("RGBA")
    ga = np.asarray(g).astype(np.float32) / 255
    g = Image.fromarray((ga[..., :3] * 255).clip(0, 255).astype(np.uint8)).resize(img.size, Image.BILINEAR)
    acc = np.zeros_like(a)
    for w, r in zip(k, radii):
        acc += np.asarray(g.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255 * w
    acc *= gain
    out = 1 - (1 - a) * (1 - np.clip(acc, 0, 1))
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8))


def vignette(img, strength=0.35):
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    f = 1 - strength * np.clip((d - 0.55) / 0.9, 0, 1) ** 1.6
    return Image.fromarray((a * f[..., None]).clip(0, 255).astype(np.uint8))


# ---------------------------------------------------------------- overlays (drawn at 2x then downsampled)
class Ov:
    def __init__(self, scale=2):
        self.k = scale
        self.im = Image.new("RGBA", (W_ * scale, H_ * scale), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
        self.col = lambda a: (*hexrgb("#9fe3ff"), int(max(0, min(255, a))))

    def line(self, p, q, a=110, w=1.0, dash=None):
        k = self.k
        if not dash:
            self.d.line([(p[0] * k, p[1] * k), (q[0] * k, q[1] * k)], fill=self.col(a), width=max(1, round(w * k)))
            return
        L = math.hypot(q[0] - p[0], q[1] - p[1]); ux, uy = (q[0] - p[0]) / L, (q[1] - p[1]) / L
        t, i = 0.0, 0
        while t < L:
            seg = dash[i % len(dash)]
            if i % 2 == 0:
                e = min(t + seg, L)
                self.line((p[0] + ux * t, p[1] + uy * t), (p[0] + ux * e, p[1] + uy * e), a, w)
            t += seg; i += 1

    def arrow(self, tip, direction, a=170, size=9, w=4):
        dx, dy = direction; n = math.hypot(dx, dy); dx, dy = dx / n, dy / n
        px, py = -dy, dx
        k = self.k
        pts = [tip, (tip[0] - dx * size + px * w, tip[1] - dy * size + py * w), (tip[0] - dx * size - px * w, tip[1] - dy * size - py * w)]
        self.d.polygon([(x * k, y * k) for x, y in pts], fill=self.col(a))

    def dim(self, p, q, off, a=150, ext=8):
        """Dimension line between screen points p, q displaced by `off` (vector); extension lines, arrowheads, centre tick."""
        p2 = (p[0] + off[0], p[1] + off[1]); q2 = (q[0] + off[0], q[1] + off[1])
        n = math.hypot(*off); u = (off[0] / n, off[1] / n)
        for s, s2 in ((p, p2), (q, q2)):
            self.line((s[0] + u[0] * 3, s[1] + u[1] * 3), (s2[0] + u[0] * ext, s2[1] + u[1] * ext), a * 0.7, 0.8)
        self.line(p2, q2, a, 1.0)
        d = (q2[0] - p2[0], q2[1] - p2[1])
        self.arrow(p2, (-d[0], -d[1]), a); self.arrow(q2, d, a)
        m = ((p2[0] + q2[0]) / 2, (p2[1] + q2[1]) / 2)
        self.line((m[0] - u[0] * 5 - d[1] / math.hypot(*d) * 0, m[1] - u[1] * 5), (m[0] + u[0] * 5, m[1] + u[1] * 5), a * 0.8, 0.8)

    def balloon(self, at, r=12, a=170):
        k = self.k
        self.d.ellipse([(at[0] - r) * k, (at[1] - r) * k, (at[0] + r) * k, (at[1] + r) * k], outline=self.col(a), width=round(1.2 * k), fill=(4, 18, 40, 200))
        for i in range(3):                     # abstract tick marks instead of a numeral
            y = at[1] - 4 + i * 4
            self.d.line([((at[0] - 5 + (i % 2) * 2) * k, y * k), ((at[0] + 5 - ((i + 1) % 2) * 2) * k, y * k)], fill=self.col(a), width=round(1.0 * k))

    def leader(self, tip, bubble, a=150):
        self.line(tip, bubble, a, 1.0)
        self.d.ellipse([(tip[0] - 2.4) * self.k, (tip[1] - 2.4) * self.k, (tip[0] + 2.4) * self.k, (tip[1] + 2.4) * self.k], fill=self.col(a + 40))
        self.balloon(bubble)

    def result(self):
        return self.im.resize((W_, H_), Image.LANCZOS)


def overlays(state="healthy", site_only=False):
    o = Ov()
    o.col = lambda a: (*hexrgb("#6fb4d6"), int(max(0, min(255, a))))
    for x in range(0, W_ + 1, 50):
        L = 14 if x % 250 == 0 else 6
        o.line((x, 0), (x, L), 80 if L > 6 else 45, 1); o.line((x, H_), (x, H_ - L), 80 if L > 6 else 45, 1)
    for y in range(0, H_ + 1, 50):
        L = 14 if y % 250 == 0 else 6
        o.line((0, y), (L, y), 80 if L > 6 else 45, 1); o.line((W_, y), (W_ - L, y), 80 if L > 6 else 45, 1)
    for (cx, cy, sx, sy) in ((18, 18, 1, 1), (W_ - 18, 18, -1, 1), (18, H_ - 18, 1, -1), (W_ - 18, H_ - 18, -1, -1)):
        o.line((cx, cy), (cx + 34 * sx, cy), 130, 1.2); o.line((cx, cy), (cx, cy + 34 * sy), 130, 1.2)
    # vertical dash-dot axis through the core, with a datum marker above the containment
    cx, top = ORIGIN[0], 96
    o.line((cx, 372), (cx, top), 105, 1.0, dash=(22, 5, 3, 5))
    o.d.ellipse([(cx - 6) * 2, (top - 6) * 2, (cx + 6) * 2, (top + 6) * 2], outline=o.col(140), width=2)
    o.line((cx - 10, top), (cx + 10, top), 120, 1); o.line((cx, top - 10), (cx, top + 10), 120, 1)
    R, H = LAY["core"]["radius"], LAY["core"]["wall_height"]
    ex, ey = proj(*pol(R, -225), 0)
    o.dim((ex, ey), (ex, ey - H), (-34, 0), 120)
    rooms = {r["id"]: r for r in LAY["rooms"]}
    for pid in ("your-office", "process"):
        r = rooms[pid]
        o.dim(proj(r["x"], r["y"] + r["d"]), proj(r["x"] + r["w"], r["y"] + r["d"]), (-4, 22), 95)
    # leaders: steam generator, polar crane girder, vessel head, control room
    sg = proj(-285, 118, 150); o.leader(sg, (sg[0] - 150, sg[1] - 120), 120)
    sg2 = proj(118, -285, 150); o.leader(sg2, (sg2[0] + 150, sg2[1] - 120), 120)
    cr = proj(*pol(R - 20, -62), 176); o.leader(cr, (cr[0] + 120, cr[1] - 70), 120)
    hd = proj(0, 0, 180); o.leader(hd, (hd[0] + 150, hd[1] - 100), 120)
    yo = rooms["your-office"]; yp = proj(yo["x"] + yo["w"] * 0.5, yo["y"] + yo["d"] * 0.5, 60); o.leader(yp, (yp[0] - 160, yp[1] + 100), 120)
    return o.result()


BLOOM = {"healthy": dict(k=(0.45, 0.38, 0.34), radii=(3, 14, 56), gain=1.1),   # v5 tried 1.2 and 1.3: both clip the grid tops to white, so unchanged
          "scram": dict(k=(0.55, 0.35, 0.15), radii=(3, 9, 28), gain=1.0)}


def finish(raw, name, state="healthy", with_overlay=True, glow_gain=1.0, site_only=False):
    im = Image.open(raw / f"{name}.png").convert("RGB")
    gp = raw / f"{name}_glow.png"
    if gp.exists():
        b = BLOOM[state]
        im = bloom(im, gp, k=b["k"], radii=b["radii"], gain=b["gain"] * glow_gain)
    im = vignette(im, 0.28)
    if with_overlay:
        im = Image.alpha_composite(im.convert("RGBA"), overlays(state, site_only)).convert("RGB")
    return im


def main():
    raw, out = Path(sys.argv[1]), Path(sys.argv[2])
    only = (sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else ["healthy", "scram", "site", "tiles", "sprites", "compare", "manifest"]
    out.mkdir(parents=True, exist_ok=True)
    made = {}

    def save(img, path, **kw):
        img.save(path, **kw); made[str(Path(path).relative_to(out))] = {"sha256": sha(path), "size": list(img.size)}

    if "healthy" in only:
        im = finish(raw, "healthy", "healthy")
        save(im, out / "healthy-2400.png"); save(im.resize((1440, 900), Image.LANCZOS), out / "healthy-1440.jpg", quality=93)
    if "scram" in only:
        im = finish(raw, "scram", "scram")
        save(im.resize((1440, 900), Image.LANCZOS), out / "scram-1440.jpg", quality=93)
    if "site" in only:
        im = finish(raw, "site", "healthy", site_only=True)
        save(im, out / "site-2400.png")
    if "tiles" in only:
        (out / "tiles").mkdir(exist_ok=True)
        tj = json.loads((ROOT / "design/art/blockout/tiles/tiles.json").read_text())["tiles"]
        for key, spec in tj.items():
            for v in ("lit", "dark", "front"):
                p = raw / f"tile_{key}_{v}.png"
                if p.exists():
                    im = Image.open(p).convert("RGBA")
                    assert list(im.size) == spec["canvas"], (key, im.size)
                    save(im, out / "tiles" / f"{key}-{v}.png")
    if "sprites" in only:
        (out / "sprites").mkdir(exist_ok=True)
        poses = ["working", "waiting", "stuck", "needs-you", "walking"]
        meta = json.loads((raw / "sprites.json").read_text())
        for var, tag in (("plant", ""), ("face", "face-")):
            ims = [Image.open(raw / f"sprite_{var}_{p}.png").convert("RGBA") for p in poses]
            for p, im in zip(poses, ims):
                bb = im.getbbox()
                save(im, out / "sprites" / f"worker-{tag}{p}.png")
            w, h = ims[0].size
            sheet = Image.new("RGBA", (w * 5, h + 140), (0, 14, 35, 255))
            for i, im in enumerate(ims):
                sheet.alpha_composite(im, (i * w, 0))
                s64 = im.resize((w // 4, h // 4), Image.LANCZOS)   # 1x plate size
                sheet.alpha_composite(s64, (i * w + (w - s64.width) // 2, h + 4))
            save(sheet, out / "sprites" / f"workers-{tag}sheet.png")
        (out / "sprites" / "sprites.json").write_text(json.dumps(meta, indent=1))
    if "compare" in only:
        sheet = Image.open(ROOT / "design/art/bakeoff/schematic-sheet.jpg").convert("RGB")
        cod = sheet.crop((246, 578, 946, 1016)).resize((1440, 900), Image.LANCZOS)
        v1 = Image.open("/mnt/project-files/control-rod/plant3d/healthy-1440.jpg").convert("RGB").resize((1440, 900))
        v2 = Image.open(out / "healthy-1440.jpg").convert("RGB")
        c = Image.new("RGB", (1440 * 3 + 40, 900), (0, 14, 35))
        for i, im in enumerate((cod, v1, v2)):
            c.paste(im, (i * (1440 + 20), 0))
        save(c, out / "compare-1440.jpg", quality=90)
    (out / "post-manifest.json").write_text(json.dumps(made, indent=1))
    if "manifest" in only:
        params = {}
        for f in sorted(raw.glob("render_params_*.json")):
            params[f.stem.replace("render_params_", "")] = json.loads(f.read_text())
        reg = json.loads((raw / "registration.json").read_text()) if (raw / "registration.json").exists() else None
        files = {}
        for f in sorted(out.rglob("*")):
            if f.is_file() and f.name not in ("manifest.json", "post-manifest.json"):
                files[str(f.relative_to(out))] = {"sha256": sha(f), "bytes": f.stat().st_size}
        man = {"version": "plant3d-v2", "blender": "5.3 (bpy module), Cycles CPU 4 cores, OIDN denoise, Freestyle linework",
               "style": "design/art/bakeoff/prompts/final-v2.md STYLE block; palette from design/art/palette.json",
               "render_runs": params, "registration": {"max_bbox_delta_px": reg and reg["max_bbox_delta_px"], "max_boundary_px_99pct": reg and reg["max_boundary_px_99pct"], "rooms": reg and reg["rooms"]},
               "sprites_anchor_note": "anchor_px in sprites/sprites.json = floor point under the worker's hips in the sprite image (scale 4 px per plate px); seated poses sit on a chair at that point, facing the in-plant direction",
               "files": files}
        (out / "manifest.json").write_text(json.dumps(man, indent=1))


if __name__ == "__main__":
    main()
