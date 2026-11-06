// Usage: node apps/web/scripts/check-contrast.mjs
// Computes WCAG 2.x contrast for every text token on every surface in each look
// of apps/web/src/design/tokens.css and writes the table to the board-m1
// evidence folder. Exits 1 if any pair is under 4.5:1.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MIN_RATIO, contrastTable, parseLooks } from "./contrast-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const css = readFileSync(resolve(here, "../src/design/tokens.css"), "utf8");
const rows = contrastTable(parseLooks(css));

const out = resolve(repo, ".nuclear/changes/board-m1/evidence/tokens-contrast-looks.txt");
const lines = [
  "Command: node apps/web/scripts/check-contrast.mjs",
  `Date: ${new Date().toISOString().slice(0, 10)}`,
  "Source: apps/web/src/design/tokens.css (:root = look a, [data-look=b], [data-look=c])",
  `Rule: WCAG 2.x contrast ratio, text tokens on surface tokens, minimum ${MIN_RATIO}:1`,
  "",
  "look  text token     colour   surface       colour   ratio   result",
  ...rows.map(
    (r) =>
      `${r.look.padEnd(5)} ${r.text.padEnd(14)} ${r.fg}  ${r.surface.padEnd(12)}  ${r.bg}  ${r.ratio.toFixed(2).padStart(5)}   ${r.pass ? "pass" : "FAIL"}`,
  ),
  "",
  `Failures: ${rows.filter((r) => !r.pass).length} of ${rows.length}`,
  "",
];
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n"));
console.log(lines.join("\n"));
if (rows.some((r) => !r.pass)) process.exit(1);
