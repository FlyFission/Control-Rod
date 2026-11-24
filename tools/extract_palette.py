#!/usr/bin/env python3
"""Derive the Plant palette roles from the approved key frames (AGENTS.md rule 5).

Inputs: design/art/keyframes/B-*.jpg and design/art/blockout/anchors.json.
Output: design/art/palette.json with each role's hex, the method, and input digests.
Regions are scaled from the 2400x1500 blockout to the 1440x900 frames.
"""
import colorsys, hashlib, json, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
KF = ROOT / "design/art/keyframes"
anchors = json.loads((ROOT / "design/art/blockout/anchors.json").read_text())
S = 1440 / anchors["canvas"][0]

def box(b):
    return tuple(round(v * S) for v in b)

def pixels(img, b=None):
    im = img.crop(box(b)) if b else img
    return list(im.convert("RGB").get_flattened_data()) if hasattr(im, "get_flattened_data") else list(im.convert("RGB").getdata())

def hexof(c):
    return "#%02x%02x%02x" % tuple(round(v) for v in c)

def median(px):
    return tuple(sorted(p[i] for p in px)[len(px) // 2] for i in range(3))

def hsv(p):
    return colorsys.rgb_to_hsv(*(v / 255 for v in p))

def pick(px, keep, lamp=False):
    sel = [p for p in px if keep(*hsv(p))]
    if lamp:  # a lamp's colour is its brightest decile, not its halo
        sel = sorted(sel, key=lambda p: hsv(p)[2])[int(len(sel) * 0.9):]
    return median(sel), len(sel)

def quantile_by_value(px, q):
    s = sorted(px, key=lambda p: hsv(p)[2])
    return s[int(len(s) * q)]

healthy = Image.open(KF / "B-healthy-1440.jpg")
needs = Image.open(KF / "B-needs-you-1440.jpg")
scram = Image.open(KF / "B-scram-1440.jpg")
core = anchors["core"]["bbox"]
office = anchors["rooms"]["your-office"]["bbox"]
all_px = pixels(healthy)

roles = {}
roles["ground"] = hexof(quantile_by_value(all_px, 0.10))
room_px = [p for r in anchors["rooms"].values() for p in pixels(healthy, r["bbox"])]
roles["surface"] = hexof(quantile_by_value(room_px, 0.40))
roles["linework"] = hexof(quantile_by_value(all_px, 0.85))
c, n = pick(pixels(healthy, core), lambda h, s, v: v > 0.85 and 0.45 < h < 0.6)
roles["core-glow"] = hexof(c); counts = {"core-glow": n}
c, n = pick(all_px, lambda h, s, v: 0.45 < h < 0.6 and s > 0.5 and v > 0.6)
roles["screen"] = hexof(c); counts["screen"] = n
c, n = pick(pixels(needs, office), lambda h, s, v: (h < 0.17 or h > 0.92) and s > 0.35 and v > 0.25, lamp=True)
roles["needs-you"] = hexof(c); counts["needs-you"] = n
c, n = pick(pixels(scram, core), lambda h, s, v: (h < 0.05 or h > 0.95) and s > 0.5 and v > 0.35, lamp=True)
roles["trip"] = hexof(c); counts["trip"] = n

digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
out = {
    "source": "tools/extract_palette.py",
    "method": "ground/linework: 10th/85th value percentile of B-healthy; surface: 40th percentile inside room boxes; "
              "core-glow: median bright cyan in core bbox; screen: median saturated cyan; "
              "needs-you: median of the brightest decile of warm pixels in your-office bbox of B-needs-you; trip: median of the brightest decile of red in core bbox of B-scram",
    "roles": roles,
    "pixel_counts": counts,
    "inputs": {p.name: digest(p) for p in [KF / "B-healthy-1440.jpg", KF / "B-needs-you-1440.jpg", KF / "B-scram-1440.jpg",
                                          ROOT / "design/art/blockout/anchors.json"]},
}
(ROOT / "design/art/palette.json").write_text(json.dumps(out, indent=1) + "\n")
print(json.dumps(roles, indent=1), counts)
