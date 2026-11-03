// Copy the transitive closure of generated TypeSpec runner schemas into the Go binary.
// Run after `pnpm spec`; never edit the embedded JSON by hand.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
const source = fileURLToPath(new URL("../spec/generated/json-schema/", import.meta.url));
const target = fileURLToPath(new URL("../daemon/internal/wire/schemas/", import.meta.url));
const roots = ["Job.json", "CompletionReceipt.json", "LogReply.json"];
const files = new Map();
function visit(file) {
  if (!/^[A-Za-z][A-Za-z0-9]*\.json$/.test(file)) throw new Error(`Unsupported schema reference: ${file}`);
  if (files.has(file)) return;
  const raw = readFileSync(source + file, "utf8");
  files.set(file, raw);
  function walk(v) {
    if (!v || typeof v !== "object") return;
    if (v.$ref && !v.$ref.startsWith("#")) visit(v.$ref.split("#")[0]);
    for (const child of Object.values(v)) walk(child);
  }
  walk(JSON.parse(raw));
}
roots.forEach(visit);
mkdirSync(target, { recursive: true });
for (const file of readdirSync(target)) if (file.endsWith(".json") && !files.has(file)) unlinkSync(target + file);
for (const [file, raw] of [...files].sort()) writeFileSync(target + file, raw);
console.log(`Embedded ${files.size} TypeSpec-generated runner schemas`);
