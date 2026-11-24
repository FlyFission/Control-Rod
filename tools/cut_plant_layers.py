#!/usr/bin/env python3
"""Cut the Plant's runtime layers from the hybrid frames and the Blender masks (design/art/hybrid.md).

Inputs (all in this repository):
  design/art/source/hybrid/frame-{dark,lit,tripped}.webp   styled frames, 2400 x 1500, registered at 0 px to the Blender render
  design/art/source/hybrid/workers-sheet.webp              radworker sprites, 5 poses across, 2 garbs down, 512 px cells
  design/art/source/hybrid/masks/*.png + masks/ingest.json Blender alpha masks (room silhouette, front occluders, core) and
                                                           the Blender seat feet / sprite anchors / garb table, with digests
  design/art/blockout/anchors.json                         room list, archetypes and the core box

Writes, under apps/web/public/plant/:
  base.webp, base-1440.webp                  the dark plate (the whole site, rooms unlit, core healthy), full size and 1440 wide
  rooms/<room>-lit.webp                      frame-lit under the room's Blender silhouette, cropped to its bbox
  rooms/<room>-front.webp                    frame-lit under the room's Blender front mask (desk fronts, walls a figure stands behind)
  core-healthy.webp, core-tripped.webp       frame-dark / frame-tripped under the containment mask (grown a little, feathered)
  sprites/<garb>-<pose>.webp                 one worker per garb and pose, 256 px square
  manifest.json                              every output's offset, size, bytes and sha256; input digests; the quality chosen
and apps/web/src/features/office/plant-scene/geometry.ts (generated): rooms, seat feet, layer boxes, sprite anchors.

Every offset and size comes from this script reading recorded inputs. Stale outputs are removed on every run.
The encode quality is the highest one (bisected) that keeps the whole directory under TARGET_BYTES; it is recorded.

Usage:
  python3 tools/cut_plant_layers.py                       cut from the repository inputs
  python3 tools/cut_plant_layers.py --ingest <v3 dir>     first copy the Blender masks and seat feet from a plant3d-v3 output
                                                          directory (layers/, sprites/ seat-feet.json, manifest.json) into
                                                          design/art/source/hybrid/masks/, then cut
Needs Pillow with WebP and numpy.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
HYB = ROOT / "design" / "art" / "source" / "hybrid"
MASKS = HYB / "masks"
ANCHORS = ROOT / "design" / "art" / "blockout" / "anchors.json"
OUT = ROOT / "apps" / "web" / "public" / "plant"
GEOMETRY = ROOT / "apps" / "web" / "src" / "features" / "office" / "plant-scene" / "geometry.ts"

# The sheet: columns are poses, rows are garbs (tools/plant3d/post3.py POSES, GARBS). Walking is cut and recorded
# but not shipped: the app has no walking state (a figure that changed shows the waiting pose).
SHEET_POSES = ("working", "waiting", "stuck", "needs-you", "walking")
SHEET_GARBS = ("antic", "station")
SHIPPED_POSES = ("working", "waiting", "stuck", "needs-you")
CELL = 512
SPRITE_OUT = 256
CORE_GROW = 24  # px the containment mask is grown by (then feathered) so the SCRAM rim and glow are never clipped
CORE_FEATHER = 6
BASE_SMALL = 1440
TARGET_BYTES = 1_400_000  # the directory must stay under 1_500_000; the rest is headroom
BUDGET_BYTES = 1_500_000
Q_MIN, Q_MAX = 40, 92
LABEL_ALPHA = 32  # a room's "bbox" (what labels keep clear of) is where its silhouette is at least this opaque


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256(p: Path) -> str:
    return sha256_bytes(p.read_bytes())


def rel(p: Path) -> str:
    return str(p.relative_to(ROOT))


def ingest(src: Path) -> None:
    """Copy the alpha channels of the Blender masks (and its seat feet and tables) into the repository, with digests."""
    shutil.rmtree(MASKS, ignore_errors=True)
    MASKS.mkdir(parents=True)
    anchors = json.loads(ANCHORS.read_text())
    seat = json.loads((src / "seat-feet.json").read_text())
    blender = json.loads((src / "manifest.json").read_text())
    files: dict[str, dict] = {}

    def mask(name: str, path: Path) -> None:
        a = Image.open(path).convert("RGBA").getchannel("A")
        a.save(MASKS / f"{name}.png", optimize=True)
        files[f"{name}.png"] = {"source": str(path.relative_to(src)), "source_sha256": sha256(path)}

    for rid in anchors["rooms"]:
        for v in ("lit", "front"):
            mask(f"{rid}-{v}", src / "layers" / "rooms" / f"{rid}-{v}.png")
    for k in ("healthy", "tripped"):
        mask(f"core-{k}", src / "layers" / f"core-{k}.png")
    (MASKS / "seat-feet.json").write_text(json.dumps(seat, indent=1) + "\n")
    info = {
        "generated_by": "tools/cut_plant_layers.py --ingest",
        "blender_version": blender["version"],
        "garb_table": blender["garb"]["table"],
        "inside_containment_garb": blender["garb"]["inside_containment"],
        "stack_order": blender["stack_order"],
        "seat_feet_sha256": sha256(src / "seat-feet.json"),
        "blender_manifest_sha256": sha256(src / "manifest.json"),
        "masks": files,
    }
    (MASKS / "ingest.json").write_text(json.dumps(info, indent=1) + "\n")
    print(f"ingested {len(files)} masks into {rel(MASKS)}")


class Enc:
    """One image to encode, and where it goes."""

    def __init__(self, path: str, im: Image.Image, extra: dict, lossless_alpha: bool = False):
        self.path, self.im, self.extra, self.alpha_q = path, im, extra, 100 if lossless_alpha else 90

    def encode(self, q: int) -> bytes:
        b = io.BytesIO()
        kw = {"alpha_quality": self.alpha_q} if self.im.mode == "RGBA" else {}
        self.im.save(b, "WEBP", quality=q, method=5, **kw)
        return b.getvalue()


def crop_layer(frame: Image.Image, mask: Image.Image, box: tuple[int, int, int, int], alpha: Image.Image | None = None) -> Image.Image:
    im = frame.crop(box).convert("RGBA")
    im.putalpha((alpha or mask).crop(box))
    return im


def grown_core_alpha(masks: list[Image.Image]) -> Image.Image:
    """The union of the core masks, grown by CORE_GROW and feathered, never less than the masks themselves."""
    u = np.maximum.reduce([np.asarray(m) for m in masks])
    big = Image.fromarray(u).filter(ImageFilter.MaxFilter(2 * CORE_GROW + 1)).filter(ImageFilter.GaussianBlur(CORE_FEATHER))
    return Image.fromarray(np.maximum(np.asarray(big), u))


def box_of(a: Image.Image, thr: int = 0) -> tuple[int, int, int, int] | None:
    return a.point(lambda v: 255 if v > thr else 0).getbbox()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest", type=Path, help="a plant3d-v3 output directory to copy masks and seat feet from first")
    args = ap.parse_args()
    if args.ingest:
        ingest(args.ingest)

    anchors = json.loads(ANCHORS.read_text())
    info = json.loads((MASKS / "ingest.json").read_text())
    seats_src = json.loads((MASKS / "seat-feet.json").read_text())
    canvas = tuple(anchors["canvas"])
    frames = {k: Image.open(HYB / f"frame-{k}.webp").convert("RGB") for k in ("dark", "lit", "tripped")}
    for k, im in frames.items():
        assert im.size == canvas, f"frame-{k} is {im.size}, canvas is {canvas}"
    sheet = Image.open(HYB / "workers-sheet.webp").convert("RGBA")
    assert sheet.size == (CELL * len(SHEET_POSES), CELL * 2 + 120), f"workers sheet is {sheet.size}"

    inputs = {rel(p): sha256(p) for p in sorted(HYB.glob("*.webp")) + [HYB / "PROMPTS.md"]}
    inputs[rel(ANCHORS)] = sha256(ANCHORS)
    for p in sorted(MASKS.iterdir()):
        inputs[rel(p)] = sha256(p)

    encs: list[Enc] = []
    encs.append(Enc("base.webp", frames["dark"], {"role": "base", "offset": [0, 0], "plate_scale": 1.0}))
    encs.append(Enc("base-1440.webp", frames["dark"].resize((BASE_SMALL, round(canvas[1] * BASE_SMALL / canvas[0])), Image.LANCZOS), {"role": "base", "offset": [0, 0], "plate_scale": BASE_SMALL / canvas[0]}))

    rooms: dict[str, dict] = {}
    for rid, r in anchors["rooms"].items():
        lit_m = Image.open(MASKS / f"{rid}-lit.png")
        front_m = Image.open(MASKS / f"{rid}-front.png")
        lb, fb = box_of(lit_m), box_of(front_m)
        assert lb, f"{rid}: empty lit mask"
        label_box = box_of(lit_m, LABEL_ALPHA)
        encs.append(Enc(f"rooms/{rid}-lit.webp", crop_layer(frames["lit"], lit_m, lb), {"role": "lit", "room": rid, "offset": list(lb[:2])}))
        if fb:
            encs.append(Enc(f"rooms/{rid}-front.webp", crop_layer(frames["lit"], front_m, fb), {"role": "front", "room": rid, "offset": list(fb[:2])}))
        mine = [s for s in seats_src["seats"] if s["room"] == rid]
        assert mine, f"{rid}: no seats in seat-feet.json"
        garb = info["garb_table"][rid]
        rooms[rid] = {
            "label": rid.replace("-", " ").replace("_", " ").capitalize(), "archetype": r["archetype"], "size": r["size"], "garb": garb,
            "bbox": list(label_box), "lit": list(lb), "front": list(fb) if fb else None,
            "seats": [{"id": s["id"], "n": s["n"], "x": s["feet_px"][0], "y": s["feet_px"][1]} for s in sorted(mine, key=lambda s: s["n"])],
        }

    core_masks = [Image.open(MASKS / f"core-{k}.png") for k in ("healthy", "tripped")]
    core_alpha = grown_core_alpha(core_masks)
    cb = box_of(core_alpha)
    assert cb
    for k, key in (("healthy", "dark"), ("tripped", "tripped")):
        encs.append(Enc(f"core-{k}.webp", crop_layer(frames[key], core_alpha, cb), {"role": f"core-{k}", "offset": list(cb[:2])}))

    spr = seats_src["sprite"]
    assert spr["size"] == CELL
    sprites: dict[str, dict] = {}
    unshipped: dict[str, dict] = {}
    for gi, garb in enumerate(SHEET_GARBS):
        for pi, pose in enumerate(SHEET_POSES):
            cell = sheet.crop((pi * CELL, gi * CELL, (pi + 1) * CELL, (gi + 1) * CELL))
            ab = cell.getchannel("A").getbbox()
            assert ab, f"{garb}-{pose}: empty sprite cell"
            low = max(i for i, v in enumerate(np.asarray(cell.getchannel("A")).max(axis=1)) if v > 8)
            assert abs(low - spr["lowest_foot_y_px"]) <= 2, f"{garb}-{pose}: lowest foot at {low}, Blender says {spr['lowest_foot_y_px']}"
            key = f"{garb}-{pose}"
            anchor = spr["hip_floor_anchor_px_by_sprite"][key]
            meta = {"garb": garb, "pose": pose, "cell": [pi * CELL, gi * CELL], "alpha_bbox": list(ab), "anchor": anchor, "cell_sha256": sha256_bytes(cell.tobytes())}
            if pose in SHIPPED_POSES:
                encs.append(Enc(f"sprites/{key}.webp", cell.resize((SPRITE_OUT, SPRITE_OUT), Image.LANCZOS), {"role": "sprite", **meta}, lossless_alpha=True))
                sprites[key] = meta
            else:
                unshipped[key] = {**meta, "reason": "the app has no walking state"}

    # Quality: the highest (bisected) at which the directory fits TARGET_BYTES (manifest allowance included).
    allowance = 14_000
    sizes = lambda q: sum(len(e.encode(q)) for e in encs)  # noqa: E731
    lo, hi = Q_MIN, Q_MAX
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if sizes(mid) + allowance <= TARGET_BYTES:
            lo = mid
        else:
            hi = mid - 1
    q = lo
    assert sizes(q) + allowance <= TARGET_BYTES, "even the minimum quality does not fit the budget"

    shutil.rmtree(OUT, ignore_errors=True)
    outputs = []
    for e in encs:
        data = e.encode(q)
        p = OUT / e.path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        with Image.open(p) as chk:
            size = list(chk.size)
        outputs.append({"path": e.path, **e.extra, "size": size, "bytes": len(data), "sha256": sha256_bytes(data)})
    outputs.sort(key=lambda o: o["path"])

    manifest = {
        "generated_by": "tools/cut_plant_layers.py",
        "canvas": list(canvas),
        "quality": {"webp_quality": q, "method": 5, "alpha_quality": {"sprites": 100, "layers": 90}, "bisected_range": [Q_MIN, Q_MAX], "target_bytes": TARGET_BYTES},
        "core": {"bbox": anchors["core"]["bbox"], "crop": list(cb), "grow_px": CORE_GROW, "feather_px": CORE_FEATHER},
        "sprite": {"cell": CELL, "shipped_size": SPRITE_OUT, "px_per_plate_px": spr["px_per_plate_px"], "shipped": sprites, "not_shipped": unshipped},
        "inputs": inputs,
        "outputs": outputs,
    }
    mpath = OUT / "manifest.json"
    mpath.write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    total = sum(o["bytes"] for o in outputs) + mpath.stat().st_size
    manifest["total_bytes"] = total
    manifest["budget_bytes"] = BUDGET_BYTES
    mpath.write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    total = sum(o["bytes"] for o in outputs) + mpath.stat().st_size
    assert total <= BUDGET_BYTES, f"{total} bytes is over the budget"

    write_geometry(anchors, cb, rooms, spr, sprites)
    print(f"wrote {len(outputs)} files + manifest to {rel(OUT)} at quality {q}: {total:,} bytes (budget {BUDGET_BYTES:,})")


def write_geometry(a: dict, core_crop: tuple[int, int, int, int], rooms: dict, spr: dict, sprites: dict) -> None:
    j = json.dumps
    L = [
        "// Generated by tools/cut_plant_layers.py from design/art/source/hybrid/masks/ and design/art/blockout/anchors.json. Do not edit by hand.",
        "// All values are plate pixels on the 2400 x 1500 canvas the hybrid frames are drawn on; seat feet are the Blender seat floor points.",
        "",
        f"export const CANVAS = {{ width: {a['canvas'][0]}, height: {a['canvas'][1]} }} as const;",
        "",
        "export type Box = readonly [x0: number, y0: number, x1: number, y1: number];",
        "export interface Seat {",
        "  readonly id: string;",
        "  readonly n: number;",
        "  readonly x: number;",
        "  readonly y: number;",
        "}",
        "export interface Room {",
        "  readonly label: string;",
        "  readonly archetype: string;",
        "  readonly size: string;",
        "  /** Which worker sprites stand here: station coveralls or anti-contamination suits. */",
        "  readonly garb: \"station\" | \"antic\";",
        "  /** What the room paints (its silhouette where it is mostly opaque): labels keep clear of this. */",
        "  readonly bbox: Box;",
        "  /** Where rooms/<id>-lit.webp is drawn. */",
        "  readonly lit: Box;",
        "  /** Where rooms/<id>-front.webp is drawn, over the figures; null when the room has nothing in front of its seats. */",
        "  readonly front: Box | null;",
        "  /** Feet points, in the order people are seated. */",
        "  readonly seats: readonly Seat[];",
        "}",
        "",
        "/** The containment's box, and the box the core layers are cut to (the mask grown and feathered). */",
        f"export const CORE_BBOX: Box = {j(a['core']['bbox'])};",
        f"export const CORE_CROP: Box = {j(list(core_crop))};",
        "",
        "/** The sprite cell, how many sprite px make one plate px, and the pixel of each sprite that stands on its seat's feet point. */",
        f"export const SPRITE = {{ cell: {spr['size']}, pxPerPlatePx: {spr['px_per_plate_px']} }} as const;",
        "export const SPRITE_ANCHOR = {",
    ]
    for k, v in spr["hip_floor_anchor_px_by_sprite"].items():
        if k.split("-", 1)[1] in SHIPPED_POSES:
            L.append(f"  {j(k)}: [{v[0]}, {v[1]}],")
    L += [
        "} as const;",
        "",
        "/** What each sprite paints (its alpha bounds in sprite px): a figure's focus box follows it. */",
        "export const SPRITE_BOX = {",
    ]
    for k, v in sprites.items():
        L.append(f"  {j(k)}: {j(v['alpha_bbox'])},")
    L += ["} as const;", "", "export const ROOMS = {"]
    for rid, r in rooms.items():
        seats = ", ".join(f"{{ id: {j(s['id'])}, n: {s['n']}, x: {s['x']}, y: {s['y']} }}" for s in r["seats"])
        L.append(
            f"  {j(rid)}: {{ label: {j(r['label'])}, archetype: {j(r['archetype'])}, size: {j(r['size'])}, garb: {j(r['garb'])}, "
            f"bbox: {j(r['bbox'])}, lit: {j(r['lit'])}, front: {j(r['front'])}, seats: [{seats}] }},"
        )
    L += ["} as const satisfies Record<string, Room>;", "", "export type PlaceId = keyof typeof ROOMS;", "export const PLACE_IDS = Object.keys(ROOMS) as PlaceId[];", ""]
    GEOMETRY.parent.mkdir(parents=True, exist_ok=True)
    GEOMETRY.write_text("\n".join(L))


if __name__ == "__main__":
    main()
