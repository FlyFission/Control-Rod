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

export type PreviewKind = "markdown" | "image" | "pdf" | "geojson" | "json" | "text";

export function previewKind(name: string): PreviewKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "geojson") return "geojson";
  if (ext === "json") return "json";
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
