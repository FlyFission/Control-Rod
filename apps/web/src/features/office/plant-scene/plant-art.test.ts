import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CANVAS, CORE_CROP, ROOMS, SPRITE_ANCHOR } from "./geometry.js";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "../../../../public/plant");
const manifest = JSON.parse(readFileSync(join(PUBLIC, "manifest.json"), "utf8")) as {
  canvas: number[];
  quality: { webp_quality: number };
  budget_bytes: number;
  total_bytes: number;
  inputs: Record<string, string>;
  sprite: { shipped: Record<string, { anchor: number[] }>; not_shipped: Record<string, unknown> };
  outputs: { path: string; role: string; room?: string; offset: number[]; size: number[]; bytes: number; sha256: string }[];
};
const out = (path: string) => manifest.outputs.find((o) => o.path === path)!;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)).map((f) => `${e.name}/${f}`) : [e.name]));
}

describe("plant art manifest", () => {
  it("lists every file on disk with the bytes and sha256 recorded, and nothing unreferenced is left", () => {
    const onDisk = walk(PUBLIC).filter((f) => f !== "manifest.json").sort();
    expect(manifest.outputs.map((o) => o.path).sort()).toEqual(onDisk);
    for (const o of manifest.outputs) {
      const data = readFileSync(join(PUBLIC, o.path));
      expect(data.length, o.path).toBe(o.bytes);
      expect(createHash("sha256").update(data).digest("hex"), o.path).toBe(o.sha256);
    }
  });

  it("stays within the byte budget and records the quality it chose", () => {
    const total = walk(PUBLIC).reduce((n, f) => n + statSync(join(PUBLIC, f)).size, 0);
    expect(total).toBeLessThanOrEqual(1_500_000);
    expect(manifest.budget_bytes).toBe(1_500_000);
    expect(manifest.quality.webp_quality).toBeGreaterThan(0);
    expect(Object.keys(manifest.inputs).some((k) => k.endsWith("frame-lit.webp"))).toBe(true);
  });

  it("places each room's layers where geometry.ts says, inside the canvas, at the sizes the files have", () => {
    expect(manifest.canvas).toEqual([CANVAS.width, CANVAS.height]);
    for (const [id, room] of Object.entries(ROOMS)) {
      for (const [role, box] of [["lit", room.lit], ["front", room.front]] as const) {
        const o = out(`rooms/${id}-${role}.webp`);
        expect(o, `${id} ${role}`).toBeDefined();
        const b = box!;
        expect(o.offset).toEqual([b[0], b[1]]);
        expect(o.size).toEqual([b[2] - b[0], b[3] - b[1]]);
        expect(b[2]).toBeLessThanOrEqual(CANVAS.width);
        expect(b[3]).toBeLessThanOrEqual(CANVAS.height);
      }
      // The label box lies inside the lit layer.
      expect(room.bbox[0]).toBeGreaterThanOrEqual(room.lit[0]);
      expect(room.bbox[3]).toBeLessThanOrEqual(room.lit[3]);
    }
    for (const k of ["healthy", "tripped"]) {
      const o = out(`core-${k}.webp`);
      expect(o.offset).toEqual([CORE_CROP[0], CORE_CROP[1]]);
      expect(o.size).toEqual([CORE_CROP[2] - CORE_CROP[0], CORE_CROP[3] - CORE_CROP[1]]);
    }
    expect(out("base.webp").size).toEqual([CANVAS.width, CANVAS.height]);
    expect(out("base-1440.webp").size[0]).toBe(1440);
  });

  it("seats every room's people on feet points inside its lit layer, and every sprite has an anchor on its cell", () => {
    for (const [id, room] of Object.entries(ROOMS)) {
      expect(room.seats.length, id).toBeGreaterThan(0);
      for (const s of room.seats) {
        expect(s.x).toBeGreaterThan(room.lit[0]);
        expect(s.x).toBeLessThan(room.lit[2]);
        expect(s.y).toBeGreaterThan(room.lit[1]);
        expect(s.y).toBeLessThan(room.lit[3]);
      }
    }
    for (const garb of ["station", "antic"]) {
      for (const pose of ["working", "waiting", "stuck", "needs-you"]) {
        const key = `${garb}-${pose}` as keyof typeof SPRITE_ANCHOR;
        expect(existsSync(join(PUBLIC, `sprites/${key}.webp`)), key).toBe(true);
        expect([...SPRITE_ANCHOR[key]]).toEqual(manifest.sprite.shipped[key]!.anchor);
      }
    }
    expect(Object.keys(manifest.sprite.not_shipped)).toEqual(["antic-walking", "station-walking"]);
  });
});
