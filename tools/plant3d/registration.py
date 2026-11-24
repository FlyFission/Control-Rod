#!/usr/bin/env python3
"""Registration check: blockout volumes rendered by Blender (raw/volumes.png, one flat colour per room) vs the blockout's own
room masks (design/art/blockout/room-masks/*.png) and bboxes (anchors.json). Reports per-room bbox deltas, best integer shift,
IoU, and the boundary distance (smallest k such that 99% of the blockout mask boundary lies within k px of ours)."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BO = ROOT / "design" / "art" / "blockout"


def dil(m, k):
    out = m.copy()
    for _ in range(k):
        o = out.copy()
        o[1:] |= out[:-1]; o[:-1] |= out[1:]; o[:, 1:] |= out[:, :-1]; o[:, :-1] |= out[:, 1:]
        o[1:, 1:] |= out[:-1, :-1]; o[:-1, :-1] |= out[1:, 1:]; o[1:, :-1] |= out[:-1, 1:]; o[:-1, 1:] |= out[1:, :-1]
        out = o
    return out


def boundary(m):
    return m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))


def main(raw):
    img = np.array(Image.open(Path(raw) / "volumes.png").convert("RGBA")).astype(int)
    cols = json.loads((Path(raw) / "volumes_colors.json").read_text())
    A = json.loads((BO / "anchors.json").read_text())
    anchors = dict(A["rooms"]); anchors["core"] = A["core"]
    res = {}
    for pid, c in cols.items():
        mine = (np.abs(img[..., :3] - np.array(c)).sum(2) < 12) & (img[..., 3] > 200)
        mp = BO / "room-masks" / f"{pid}.png"
        if not mp.exists():
            continue
        im = Image.open(mp).convert("RGBA"); a = np.array(im)
        loc = (a[..., 3] > 128) if a[..., 3].min() < 255 else (a[..., :3].sum(2) > 384)
        bx0, by0 = anchors[pid]["bbox"][:2]
        ref = np.zeros(mine.shape, bool); ref[by0:by0 + loc.shape[0], bx0:bx0 + loc.shape[1]] = loc
        # rooms overlap neighbours only by occlusion; compare the union region fairly
        ys, xs = np.nonzero(mine); ry, rx = np.nonzero(ref)
        if not len(ys) or not len(ry):
            res[pid] = {"error": "empty mask"}; continue
        bb_m = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
        bb_r = [int(rx.min()), int(ry.min()), int(rx.max()), int(ry.max())]
        best = (0.0, 0, 0)
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                s = np.roll(np.roll(mine, dy, 0), dx, 1)
                iou = (s & ref).sum() / max((s | ref).sum(), 1)
                best = max(best, (iou, dx, dy))
        iou0 = (mine & ref).sum() / max((mine | ref).sum(), 1)
        bref = boundary(ref); k = 0
        while k < 6 and (bref & dil(boundary(mine), k)).sum() < 0.99 * bref.sum():
            k += 1
        res[pid] = {"bbox_blender": bb_m, "bbox_blockout_mask": bb_r, "bbox_delta_px": [bb_m[i] - bb_r[i] for i in range(4)],
                    "iou": round(float(iou0), 4), "best_shift": [best[1], best[2]], "iou_best": round(float(best[0]), 4), "boundary_within_px_99pct": k}
    worst = max((max(abs(v) for v in r["bbox_delta_px"]) for r in res.values() if "bbox_delta_px" in r), default=None)
    out = {"rooms": res, "max_bbox_delta_px": worst, "max_boundary_px_99pct": max((r.get("boundary_within_px_99pct", 0) for r in res.values()), default=None)}
    (Path(raw) / "registration.json").write_text(json.dumps(out, indent=1))
    return out


if __name__ == "__main__":
    o = main(sys.argv[1])
    for k, v in o["rooms"].items():
        print(k, v.get("bbox_delta_px"), v.get("iou"), v.get("best_shift"), v.get("boundary_within_px_99pct"))
    print("max bbox delta", o["max_bbox_delta_px"], "max boundary px", o["max_boundary_px_99pct"])
