import { it, expect } from "vitest";
import { THEME_CATALOG, loadTheme, validateThemePack } from "./registry.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {resolve} from 'node:path';
it.each(THEME_CATALOG)(
  "has complete passive artwork for $title",
  async (entry) => {
    const pack = await loadTheme(entry.id, true);
    expect(validateThemePack(pack)).toBe(true);
    expect(pack.assets.characters).toHaveLength(6);
    expect(new Set(pack.assets.characters.map((a) => a.sha256)).size).toBe(6);
    expect(pack.assets.scene?.path).toMatch(/\.svg$/);
    expect(Object.keys(pack.assets.props)).toHaveLength(6);
    expect(pack.availability).toBe("development");
    const manifest = JSON.parse(
      readFileSync(
        resolve(`public/floor-themes/${entry.id}/assets.json`),
        "utf8",
      ),
    ) as { assets: { path: string; sha256: string; bytes: number }[] };
    for (const asset of [
      pack.assets.scene!,
      pack.assets.thumbnail!,
      ...pack.assets.characters,
      ...Object.values(pack.assets.props),
    ]) {
      const raw = readFileSync(
        resolve('public',asset.path.slice(1)),
      );
      expect(createHash("sha256").update(raw).digest("hex")).toBe(asset.sha256);
      expect(raw.byteLength).toBe(asset.bytes);
      expect(
        manifest.assets.some(
          (m) =>
            m.path === asset.path.split("/").at(-1) &&
            m.sha256 === asset.sha256,
        ),
      ).toBe(true);
    }
  },
);
