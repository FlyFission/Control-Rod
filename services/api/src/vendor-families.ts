import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The one vendor-family table: the "families" object in daemon/internal/runner/models.json. The
 * daemon's checker-independence check reads the same file, and the API passes the table to the
 * kernel with every pre-check, so all three judge independence from one list (change record
 * kernel-boundary). OpenCode and Ollama are absent on purpose: either can serve any vendor's
 * model, so the runtime alone does not name a family. A blank family is left out.
 */
let cache: Readonly<Record<string, string>> | undefined;

export function vendorFamilies(): Readonly<Record<string, string>> {
  if (!cache) {
    const path = fileURLToPath(new URL("../../../daemon/internal/runner/models.json", import.meta.url));
    const raw = (JSON.parse(readFileSync(path, "utf8")) as { families?: unknown }).families;
    const out: Record<string, string> = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [runtime, family] of Object.entries(raw)) {
        if (typeof family === "string" && family.trim()) out[runtime] = family;
      }
    }
    cache = Object.freeze(out);
  }
  return cache;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The family the table names for a provider, compared trimmed and without case, as the kernel
 * does. Undefined when it names none, a blank one or two different ones.
 */
export function familyOf(provider: string, families: Readonly<Record<string, string>> = vendorFamilies()): string | undefined {
  let found: string | undefined;
  for (const [key, value] of Object.entries(families)) {
    if (!same(key, provider)) continue;
    const family = value.trim();
    if (!family || (found !== undefined && !same(found, family))) return undefined;
    found = family;
  }
  return found;
}

/**
 * The kernel's rule (transition.rs `RuntimeIdentity::may_be_same`): one provider, one family, or
 * a provider without a known family may be the same runtime. The kernel decides; the API uses
 * this to describe the record and to look for the owner's signed policy before it asks.
 */
export function mayBeSameRuntime(a: string, b: string, families: Readonly<Record<string, string>> = vendorFamilies()): boolean {
  if (same(a, b)) return true;
  const fa = familyOf(a, families);
  const fb = familyOf(b, families);
  return fa === undefined || fb === undefined || same(fa, fb);
}
