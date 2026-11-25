// Fails if any production Node dependency uses a license outside the allowlist.
import { execFileSync } from "node:child_process";

const allowed = new Set([
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0", "0BSD", "BlueOak-1.0.0", "CC0-1.0", "Unlicense", "Zlib",
]);

// An SPDX expression passes when one of its OR options passes, and an option passes when every
// license it joins with AND is allowed (pako, under docx-preview's zip reader, is "MIT AND Zlib").
function expressionAllowed(expression) {
  return expression
    .replace(/[()]/g, "")
    .split(/\s+OR\s+/)
    .some((option) => option.split(/\s+AND\s+/).every((l) => allowed.has(l.trim())));
}

const raw = execFileSync("pnpm", ["licenses", "list", "--json", "--prod"], { encoding: "utf8" });
const byLicense = JSON.parse(raw);
const violations = [];
for (const [license, packages] of Object.entries(byLicense)) {
  if (!expressionAllowed(license)) {
    for (const pkg of packages) violations.push(`${pkg.name}@${pkg.versions?.join(",") ?? "?"}: ${license}`);
  }
}
if (violations.length > 0) {
  console.error("Disallowed licenses:\n" + violations.join("\n"));
  process.exit(1);
}
console.log(`License gate passed for ${Object.values(byLicense).flat().length} packages.`);
