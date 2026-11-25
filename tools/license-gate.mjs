// Fails if any production Node dependency uses a license outside the allowlist.
import { execFileSync } from "node:child_process";
import { expressionAllowed } from "./spdx.mjs";

const allowed = new Set([
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0", "0BSD", "BlueOak-1.0.0", "CC0-1.0", "Unlicense", "Zlib",
]);

const raw = execFileSync("pnpm", ["licenses", "list", "--json", "--prod"], { encoding: "utf8" });
const byLicense = JSON.parse(raw);
const violations = [];
for (const [license, packages] of Object.entries(byLicense)) {
  if (!expressionAllowed(license, allowed)) {
    for (const pkg of packages) violations.push(`${pkg.name}@${pkg.versions?.join(",") ?? "?"}: ${license}`);
  }
}
if (violations.length > 0) {
  console.error("Disallowed licenses:\n" + violations.join("\n"));
  process.exit(1);
}
console.log(`License gate passed for ${Object.values(byLicense).flat().length} packages.`);
