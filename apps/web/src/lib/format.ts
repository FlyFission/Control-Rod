import type { Digest, VerificationRecord } from "../api/types.js";

/** The short form a person compares before signing: algorithm and first 12 hex digits. */
export function shortDigest(d: Digest | undefined): string {
  if (d === undefined) return "";
  return `${d.algorithm}:${d.value.slice(0, 12)}`;
}

export function time(iso: string | undefined): string {
  if (iso === undefined) return "";
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? iso : t.toLocaleString();
}

export function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

export type PreviewKind = "diff" | "markdown" | "image" | "pdf" | "geojson" | "json" | "csv" | "docx" | "code" | "text";

/** File extensions drawn with syntax colours, mapped to the highlighter's language names. */
export const CODE_LANG: Readonly<Record<string, string>> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  py: "python", go: "go", rs: "rust", rb: "ruby", java: "java", kt: "kotlin", swift: "swift",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp", php: "php",
  sh: "shellscript", bash: "shellscript", zsh: "shellscript", ps1: "powershell",
  yaml: "yaml", yml: "yaml", toml: "toml", ini: "ini", sql: "sql", graphql: "graphql",
  html: "html", css: "css", scss: "scss", xml: "xml", vue: "vue", svelte: "svelte",
  tsp: "typespec", proto: "proto", dockerfile: "docker", tf: "hcl", hcl: "hcl", lua: "lua",
};

function ext(name: string): string {
  const base = baseName(name).toLowerCase();
  if (base === "dockerfile") return "dockerfile";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1) : "";
}

/** The language a code file is highlighted as, or undefined for plain text. */
export function codeLang(name: string): string | undefined {
  return CODE_LANG[ext(name)];
}

export function previewKind(name: string): PreviewKind {
  const e = ext(name);
  if (e === "diff" || e === "patch") return "diff";
  if (e === "md" || e === "markdown" || e === "mdx") return "markdown";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "avif"].includes(e)) return "image";
  if (e === "pdf") return "pdf";
  if (e === "geojson") return "geojson";
  if (e === "json") return "json";
  if (e === "csv" || e === "tsv") return "csv";
  if (e === "docx") return "docx";
  if (CODE_LANG[e]) return "code";
  return "text";
}

/** True when parsed JSON looks like GeoJSON that a map can draw. */
export function isGeoJson(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const t = (v as { type?: unknown }).type;
  return (
    t === "FeatureCollection" ||
    t === "Feature" ||
    t === "Polygon" ||
    t === "MultiPolygon" ||
    t === "LineString" ||
    t === "MultiLineString" ||
    t === "Point" ||
    t === "MultiPoint" ||
    t === "GeometryCollection"
  );
}

/** Statuses as a person reads them. */
export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  released: "Released",
  "in-work": "In work",
  "in-verification": "In verification",
  accepted: "Accepted",
  closed: "Closed",
};

/** How independent a pre-check was of the author, in plain words. */
export function independenceText(record: VerificationRecord): string | null {
  const ind = record.independence;
  if (ind === undefined) return null;
  const rt = (r: { provider: string; model: string }) => (r.model === "default" ? r.provider : `${r.provider} ${r.model}`);
  if (ind.runtime === "independent") {
    return `Independent runtime: the author ran on ${rt(ind.author_runtime)}, the pre-check on ${rt(ind.checker_runtime)}.`;
  }
  const base = `Shared runtime: the author and the pre-check both ran on ${rt(ind.checker_runtime)}, in separate sessions.`;
  return ind.owner_override === undefined
    ? base
    : `${base} Owner override by ${ind.owner_override.by}: ${ind.owner_override.reason}`;
}

/** Elapsed time as a card says it: "under 1 min", "12 min", "2 h 5 min". Never negative. */
export function elapsedText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
