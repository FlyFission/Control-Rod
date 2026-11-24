#!/usr/bin/env node
/**
 * Builds the self-contained static landing page bundle into `site/dist/` with zero
 * third-party network dependencies. Copies:
 *   - `site/index.html`, `site/styles.css`, `site/app.js`
 *   - Registered self-hosted fonts from `apps/web/public/fonts/` -> `site/dist/fonts/`
 *   - Registered MIT agent marks + LICENSE from `apps/web/public/agent-marks/` -> `site/dist/agent-marks/`
 *   - Deterministic SVGs and release-build screenshots from `docs/assets/readme/` -> `site/dist/assets/readme/`
 */
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = resolve(ROOT, "site");
const DIST = resolve(SITE, "dist");

export function buildSite() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  for (const file of ["index.html", "styles.css", "app.js"]) {
    const src = resolve(SITE, file);
    if (!existsSync(src)) {
      throw new Error(`Missing required site source file: site/${file}`);
    }
    cpSync(src, resolve(DIST, file));
  }

  const mounts = [
    [resolve(ROOT, "apps/web/public/fonts"), resolve(DIST, "fonts")],
    [resolve(ROOT, "apps/web/public/agent-marks"), resolve(DIST, "agent-marks")],
    [resolve(ROOT, "docs/assets/readme"), resolve(DIST, "assets/readme")],
  ];

  for (const [from, to] of mounts) {
    if (!existsSync(from) || !statSync(from).isDirectory()) {
      throw new Error(`Missing asset directory required for site build: ${from}`);
    }
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
  }

  return DIST;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = buildSite();
  console.log(`Built static landing site -> ${out}`);
}
