import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildSite } from "../build-site.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const CLAIMS = [
  /runs? in (?:a|its own) sandbox/gi,
  /sandbox(?:es)? limits?/gi,
  /sandboxed runs?/gi,
  /fully air[- ]?gapped/gi,
  /air[- ]?gapped/gi,
  /tamper[- ]?proof/gi,
  /independently witnessed/gi,
  /\bcertified\b/gi,
  /\bcompliant\b/gi,
  /\bguarantee[sd]?\b/gi,
];
const QUALIFIERS = /\b(?:not|no|never|planned|designed to|will|until|future|roadmap|aims? to|intended|zero)\b/i;

function unqualifiedClaims(text) {
  const sentences = text.match(/[^.!?\n]+[.!?]?/g) || [];
  const findings = [];
  for (const s of sentences) {
    for (const pattern of CLAIMS) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(s)) !== null) {
        const win = s.slice(Math.max(0, m.index - 120), m.index + m[0].length + 20);
        if (!QUALIFIERS.test(win)) {
          findings.push(`${m[0]} in: ${s.trim()}`);
        }
      }
    }
  }
  return findings;
}

function remoteAssetUrls(text) {
  const hits = [];
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)|@import\s+["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = (m[1] || m[2] || m[3] || "").trim();
    // Anchor links (<a href="https://github.com/...">) are navigation, whereas asset loads
    // (<link>, <script>, <img>, CSS url(), @import) must never hit another host.
    const full = m[0];
    const isAnchor = /^href\s*=/i.test(full) && !/\.(?:css|woff2?|js|png|svg|webp|ico)$/i.test(raw);
    if (!isAnchor && /^(?:https?:)?\/\//i.test(raw) && !raw.includes("www.w3.org")) {
      hits.push(raw);
    }
  }
  return hits;
}

test("buildSite creates complete self-hosted bundle with fonts, agent marks + MIT LICENSE, SVGs, and screenshots", () => {
  const dist = buildSite();
  for (const rel of [
    "index.html",
    "styles.css",
    "app.js",
    "fonts/InterVariable.woff2",
    "fonts/JetBrainsMono-Regular.woff2",
    "agent-marks/claude.svg",
    "agent-marks/codex.svg",
    "agent-marks/agy.svg",
    "agent-marks/LICENSE",
    "assets/readme/council-loop.svg",
    "assets/readme/evidence-board.svg",
    "assets/readme/pr-receipt-card.svg",
    "assets/readme/workflow-modes.svg",
    "assets/readme/second-checker.svg",
    "assets/readme/app/board.png",
    "assets/readme/app/workflow.png",
    "assets/readme/app/control-room.png",
    "assets/readme/app/inbox.png",
    "assets/readme/app/office.png",
    "assets/readme/app/packages.png",
  ]) {
    assert.equal(existsSync(resolve(dist, rel)), true, `Expected ${rel} in site/dist`);
  }
});

test("site HTML and CSS load zero third-party fonts, scripts, or images", () => {
  const dist = buildSite();
  const html = readFileSync(resolve(dist, "index.html"), "utf8");
  const css = readFileSync(resolve(dist, "styles.css"), "utf8");
  assert.deepEqual(remoteAssetUrls(html), []);
  assert.deepEqual(remoteAssetUrls(css), []);

  // Every relative ./ img src in index.html must exist in site/dist
  const imgSrcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(imgSrcs.length >= 6, true);
  for (const src of imgSrcs) {
    assert.equal(existsSync(resolve(dist, src)), true, `Missing image ${src}`);
  }
});

test("site copy and quickstart doc pass Control Rod public-claims honesty rules", () => {
  for (const rel of ["site/index.html", "site/app.js", "docs/quickstart-check.md", "README.md"]) {
    const content = readFileSync(resolve(ROOT, rel), "utf8");
    assert.deepEqual(unqualifiedClaims(content), [], `Unqualified public claim in ${rel}`);
  }
});

test("site HTML meets SEO and interactive accessibility structure (single h1, unique IDs, non-affiliation notice)", () => {
  const html = readFileSync(resolve(ROOT, "site/index.html"), "utf8");
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  assert.equal(h1Count, 1, "Expected exactly one <h1> on the landing page");
  assert.match(html, /<meta\s+name="description"/i);
  assert.match(html, /not affiliated with/i);
  assert.match(html, /agent-marks\/LICENSE/);

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = ids.filter((id, idx) => ids.indexOf(id) !== idx);
  assert.deepEqual(dupes, [], `Duplicate DOM IDs found: ${dupes.join(", ")}`);
  assert.equal(readdirSync(resolve(ROOT, "docs/assets/readme/app")).filter((f) => f.endsWith(".png")).length >= 6, true);
});
