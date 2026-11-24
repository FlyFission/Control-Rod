#!/usr/bin/env python3
"""Cut the Plant's runtime layers from the site plate, room tiles and crew sources (spec 2026-11-24, section 4).

Reads design/art/source/{site-dark,site-tripped,site-390}.webp, source/tiles/*.webp, source/crew-*.webp,
design/art/blockout/anchors.json and design/art/blockout/tiles/tiles.json, and writes
  apps/web/public/plant/base.webp, base-1440.webp            the dark site plate, full and 1440 wide
  apps/web/public/plant/tiles/<tile>-<dark|lit|front>.webp   each room tile at its on-plate size (tile px / tile scale)
  apps/web/public/plant/tiles/<tile>-<layer>-1440.webp       the same at the 1440 path's scale (1440 / 2400)
  apps/web/public/plant/core-healthy.webp, core-tripped.webp the containment (core bbox + 40 px), feathered elliptical alpha
  apps/web/public/plant/crew/<pose>.webp                     crew frame downscaled to 256 x 256, alpha kept
  apps/web/public/plant/phone-base.webp                      the phone crop of the site plate (not on the 1440 path)
  apps/web/public/plant/manifest.json                        every output's size, bytes and sha256, plus input digests
  apps/web/src/features/office/plant-scene/geometry.ts       canvas, tiles, rooms (pad, tile box, seat feet in plate px) (generated)

Placement rule (design/art/tiles.md): a tile's top-left on the plate is pad - pad_anchor / scale, and a
seat's feet are top-left + seat / scale. Every number in the outputs comes from this script, and a new
room is a new entry in anchors.json, not new art. Stale outputs are removed on every run.

Usage: python3 tools/cut_plant_layers.py     Needs Pillow (webp support).
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design" / "art" / "source"
ANCHORS = ROOT / "design" / "art" / "blockout" / "anchors.json"
TILES_JSON = ROOT / "design" / "art" / "blockout" / "tiles" / "tiles.json"
OUT = ROOT / "apps" / "web" / "public" / "plant"
GEOMETRY = ROOT / "apps" / "web" / "src" / "features" / "office" / "plant-scene" / "geometry.ts"

CREW = ["working", "waiting", "stuck", "needs-you"]
LAYERS = ["dark", "lit", "front"]
CORE_MARGIN = 40
CREW_SIZE = 256
CREW_FRAME = 512
CREW_BASELINE = 496
# The 1440 path draws the plate 1440 wide: tiles are cut at that fraction of their on-plate size.
SMALL = 1440 / 2400
Q_BASE, Q_TILE, Q_CORE, Q_CREW = 82, 84, 84, 88
BUDGET_1440 = 1_500_000


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def save(im: Image.Image, path: Path, quality: int) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=quality, alpha_quality=100, method=6)
    with Image.open(path) as chk:
        size = list(chk.size)
    return {"path": str(path.relative_to(OUT)), "size": size, "bytes": path.stat().st_size, "sha256": sha256(path)}


def core_layer(src: Image.Image, bbox: list[int], canvas: tuple[int, int]) -> tuple[Image.Image, list[int]]:
    x0 = max(0, bbox[0] - CORE_MARGIN)
    y0 = max(0, bbox[1] - CORE_MARGIN)
    x1 = min(canvas[0], bbox[2] + CORE_MARGIN)
    y1 = min(canvas[1], bbox[3] + CORE_MARGIN)
    crop = src.crop((x0, y0, x1, y1)).convert("RGBA")
    # An ellipse that holds the containment (the bbox's inscribed ellipse) plus most of the margin.
    alpha = Image.new("L", crop.size, 0)
    inset = 4
    ImageDraw.Draw(alpha).ellipse((inset, inset, crop.width - 1 - inset, crop.height - 1 - inset), fill=255)
    crop.putalpha(alpha.filter(ImageFilter.GaussianBlur(10)))
    return crop, [x0, y0, x1, y1]


def crew_layer(path: Path) -> Image.Image:
    """The normalised crew frame (512 x 512, one shared scale, baseline at y=496) downscaled whole, never cropped."""
    im = Image.open(path).convert("RGBA")
    assert im.size == (CREW_FRAME, CREW_FRAME), f"{path.name} is {im.size}, expected the normalised {CREW_FRAME} square"
    return im.resize((CREW_SIZE, CREW_SIZE), Image.LANCZOS)


def r2(v: float) -> float:
    return round(v, 2)


def build_rooms(a: dict, t: dict) -> tuple[dict, dict]:
    """Tiles (on-plate size) and rooms (placement), from anchors.json and tiles.json."""
    tiles: dict[str, dict] = {}
    for key, tile in t["tiles"].items():
        sc = tile["scale"]
        w, h = round(tile["canvas"][0] / sc), round(tile["canvas"][1] / sc)
        with Image.open(SRC / "tiles" / f"{key}-dark.webp") as im:
            assert list(im.size) == tile["canvas"], f"{key}-dark is {im.size}, tiles.json says {tile['canvas']}"
            alpha_box = im.getchannel("A").point(lambda v: 255 if v > 32 else 0).getbbox()
        tiles[key] = {"w": w, "h": h, "scale": sc, "anchor": tile["pad_anchor"], "seats": tile["seats"], "content": alpha_box}
    rooms: dict[str, dict] = {}
    for rid, r in a["rooms"].items():
        key = f"{r['archetype']}-{r['size']}"
        tl = tiles[key]
        ax, ay = tl["anchor"]
        x0 = r["pad"]["x"] - ax / tl["scale"]
        y0 = r["pad"]["y"] - ay / tl["scale"]
        cx0, cy0, cx1, cy1 = tl["content"]
        seats = [
            {"id": f"{rid}:{s['local']}", "n": i + 1, "x": r2(x0 + s["x"] / tl["scale"]), "y": r2(y0 + s["y"] / tl["scale"])}
            for i, s in enumerate(tl["seats"])
        ]
        rooms[rid] = {
            "label": rid.replace("-", " ").replace("_", " ").capitalize(),
            "archetype": r["archetype"],
            "size": r["size"],
            "tile": key,
            "pad": {"x": r["pad"]["x"], "y": r["pad"]["y"]},
            "box": [r2(x0), r2(y0), r2(x0 + tl["w"]), r2(y0 + tl["h"])],
            "bbox": [round(x0 + cx0 / tl["scale"]), round(y0 + cy0 / tl["scale"]), round(x0 + cx1 / tl["scale"]), round(y0 + cy1 / tl["scale"])],
            "seats": seats,
        }
    return {k: {"w": v["w"], "h": v["h"]} for k, v in tiles.items()}, rooms


def write_geometry(a: dict, core_crop: list[int], tiles: dict, rooms: dict) -> None:
    lines = [
        "// Generated by tools/cut_plant_layers.py from design/art/blockout/{anchors,tiles/tiles}.json. Do not edit by hand.",
        "// Every number below comes from the placement rule in design/art/tiles.md: tile top-left = pad - anchor / scale,",
        "// seat feet = tile top-left + seat / scale. All values are plate pixels on the 2400 x 1500 canvas.",
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
        "  /** The tile's key: its files are plant/tiles/<tile>-<dark|lit|front>.webp. */",
        "  readonly tile: string;",
        "  readonly pad: { readonly x: number; readonly y: number };",
        "  /** Where the tile image is drawn (its transparent margin included). */",
        "  readonly box: Box;",
        "  /** What the tile paints (its alpha bounds): labels keep clear of this. */",
        "  readonly bbox: Box;",
        "  /** Feet points, in the order people are seated. */",
        "  readonly seats: readonly Seat[];",
        "}",
        "",
        "/** The containment's box, and the box the core layers are cut to (the box plus a margin). */",
        f"export const CORE_BBOX: Box = {json.dumps(a['core']['bbox'])};",
        f"export const CORE_CROP: Box = {json.dumps(core_crop)};",
        "",
        "/** The crew frame: its size in source pixels, and the row that stands on the seat's feet point. */",
        f"export const CREW_FRAME = {CREW_FRAME};",
        f"export const CREW_BASELINE = {CREW_BASELINE};",
        "",
        "/** Each tile's drawn size on the plate. */",
        "export const TILES = {",
    ]
    for k, v in tiles.items():
        lines.append(f"  {json.dumps(k)}: {{ w: {v['w']}, h: {v['h']} }},")
    lines += ["} as const;", "", "export const ROOMS = {"]
    for pid, r in rooms.items():
        seats = ", ".join(f"{{ id: {json.dumps(s['id'])}, n: {s['n']}, x: {s['x']}, y: {s['y']} }}" for s in r["seats"])
        lines.append(
            f"  {json.dumps(pid)}: {{ label: {json.dumps(r['label'])}, archetype: {json.dumps(r['archetype'])}, size: {json.dumps(r['size'])}, tile: {json.dumps(r['tile'])}, "
            f"pad: {json.dumps(r['pad'])}, box: {json.dumps(r['box'])}, bbox: {json.dumps(r['bbox'])}, seats: [{seats}] }},"
        )
    lines += [
        "} as const satisfies Record<string, Room>;",
        "",
        "export type PlaceId = keyof typeof ROOMS;",
        "export const PLACE_IDS = Object.keys(ROOMS) as PlaceId[];",
        "",
    ]
    GEOMETRY.parent.mkdir(parents=True, exist_ok=True)
    GEOMETRY.write_text("\n".join(lines))


def main() -> None:
    a = json.loads(ANCHORS.read_text())
    t = json.loads(TILES_JSON.read_text())
    canvas = tuple(a["canvas"])
    inputs = {str(p.relative_to(ROOT)): sha256(p) for p in sorted(SRC.glob("site-*.webp")) + sorted((SRC / "tiles").glob("*.webp")) + sorted(SRC.glob("crew-*.webp"))}
    for p in (ANCHORS, TILES_JSON):
        inputs[str(p.relative_to(ROOT))] = sha256(p)
    outputs: list[dict] = []
    if OUT.exists():
        shutil.rmtree(OUT)

    dark = Image.open(SRC / "site-dark.webp").convert("RGB")
    tripped = Image.open(SRC / "site-tripped.webp").convert("RGB")
    for im in (dark, tripped):
        assert im.size == canvas, f"source is {im.size}, canvas is {canvas}"
    outputs.append(save(dark, OUT / "base.webp", Q_BASE))
    outputs.append(save(dark.resize((1440, 900), Image.LANCZOS), OUT / "base-1440.webp", Q_BASE))
    phone = Image.open(SRC / "site-390.webp").convert("RGB")
    outputs.append(save(phone, OUT / "phone-base.webp", Q_BASE))

    tiles, rooms = build_rooms(a, t)
    for key, tl in tiles.items():
        for layer in LAYERS:
            im = Image.open(SRC / "tiles" / f"{key}-{layer}.webp").convert("RGBA")
            outputs.append(save(im.resize((tl["w"], tl["h"]), Image.LANCZOS), OUT / "tiles" / f"{key}-{layer}.webp", Q_TILE))
            sw, sh = round(tl["w"] * SMALL), round(tl["h"] * SMALL)
            outputs.append(save(im.resize((sw, sh), Image.LANCZOS), OUT / "tiles" / f"{key}-{layer}-1440.webp", Q_TILE))

    healthy, crop = core_layer(dark, a["core"]["bbox"], canvas)
    trip, _ = core_layer(tripped, a["core"]["bbox"], canvas)
    outputs.append(save(healthy, OUT / "core-healthy.webp", Q_CORE))
    outputs.append(save(trip, OUT / "core-tripped.webp", Q_CORE))

    for pose in CREW:
        outputs.append(save(crew_layer(SRC / f"crew-{pose}.webp"), OUT / "crew" / f"{pose}.webp", Q_CREW))

    write_geometry(a, crop, tiles, rooms)

    def total(pred) -> int:
        return sum(o["bytes"] for o in outputs if pred(o["path"]))

    path_1440 = total(lambda p: p == "base-1440.webp" or (p.startswith("tiles/") and p.endswith("-1440.webp")) or p.startswith(("crew/", "core-")))
    manifest = {
        "generated_by": "tools/cut_plant_layers.py",
        "canvas": list(canvas),
        "inputs": inputs,
        "outputs": sorted(outputs, key=lambda o: o["path"]),
        "bytes_1440_path": path_1440,
        "budget_1440_path": BUDGET_1440,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"wrote {len(outputs)} files to {OUT.relative_to(ROOT)}")
    for label, pred in [
        ("base-1440", lambda p: p == "base-1440.webp"),
        ("tiles, 1440 variants", lambda p: p.startswith("tiles/") and p.endswith("-1440.webp")),
        ("cores", lambda p: p.startswith("core-")),
        ("crew", lambda p: p.startswith("crew/")),
        ("base (2400) + full tiles + phone base (not on the 1440 path)", lambda p: p in ("base.webp", "phone-base.webp") or (p.startswith("tiles/") and not p.endswith("-1440.webp"))),
    ]:
        print(f"  {label}: {total(pred):,} bytes")
    verdict = "within" if path_1440 <= BUDGET_1440 else "OVER"
    print(f"1440 path total: {path_1440:,} bytes ({verdict} the {BUDGET_1440:,} byte budget)")


if __name__ == "__main__":
    main()
