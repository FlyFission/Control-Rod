import { REGION, REGION_IDS, type RegionId } from "./layout.js";

/**
 * The office theme contract (specification 18; plan task 4.2). A theme is inert scene data: a few
 * scene palette tokens, a themed label for each region, decorative art sized exactly to each region,
 * and figure body styles. It can never draw a mark, label, count or control, receive a pointer, move
 * or rename a region, or carry script, styles, fonts, external references or motion.
 */

/** The only palette a theme may set: backgrounds and decoration. Semantic colours are never themable. */
export const SCENE_TOKENS = ["backdrop", "floor", "wall", "decoration", "decorationAlt"] as const;
export type SceneToken = (typeof SCENE_TOKENS)[number];

export interface ThemeAsset {
  /** Served path under /office-themes/<theme>/, named with its digest. */
  path: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  creator: string;
  rightsBasis: "original" | "licensed" | "public-domain";
  licenseNoticeId: string;
}

export interface OfficeThemeV1 {
  schemaVersion: 1;
  id: string;
  version: string;
  title: string;
  description: string;
  availability: "development" | "released";
  tokens: Readonly<Record<SceneToken, string>>;
  regions: Readonly<Record<RegionId, { label: string; art: ThemeAsset | null }>>;
  /** Figure body styles, drawn inside the silhouette the semantic layer outlines. */
  bodies: readonly ThemeAsset[];
  motionProfile: "shared-v1";
  /** What the theme's own accessibility review found; the harness evidence is recorded separately. */
  accessibility: { notes: string };
  credits: readonly string[];
}

/** Every element a theme's SVG may use: shapes, groups, gradients and clipping, nothing else. */
const ELEMENTS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "defs", "lineargradient", "radialgradient", "stop", "clippath", "title", "desc",
]);

/** Every attribute a theme's SVG may use: geometry and paint. No style, no events, no links out. */
const ATTRIBUTES = new Set([
  "xmlns", "viewbox", "width", "height", "preserveaspectratio", "id",
  "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "points",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap",
  "stroke-linejoin", "stroke-dasharray", "stroke-miterlimit", "opacity", "transform", "clip-path", "clip-rule",
  "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "spreadmethod",
]);

const HEX = /^#[0-9a-fA-F]{6}$/;
const PAINT = /^(none|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|url\(#[A-Za-z][\w-]*\))$/;

/**
 * Checks an SVG document against the allowlist: only listed elements and attributes, paint either a
 * colour or a reference to one of its own gradients, references only to its own fragments, and a
 * view box of exactly the given size starting at the origin, so the art can only fill its region.
 */
export function validateSvg(text: string, size: { width: number; height: number }, where: string): string[] {
  const problems: string[] = [];
  if (text.length > 512_000) problems.push(`${where} is larger than 500 KB`);
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(text)) problems.push(`${where} declares a doctype, entity or processing instruction`);
  if (/<!\[CDATA\[/i.test(text)) problems.push(`${where} contains CDATA`);
  const body = text.replace(/^\s*<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const tag = /<\s*(\/?)\s*([A-Za-z][\w:.-]*)([^>]*?)(\/?)\s*>/g;
  let rootSeen = false;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = tag.exec(body))) {
    // Text between tags is allowed only as plain titles; markup outside the tag pattern is refused.
    if (/[<>]/.test(body.slice(consumed, m.index))) problems.push(`${where} has markup that is not a well formed tag`);
    consumed = m.index + m[0].length;
    const [, closing, rawName, attrs] = m;
    const name = rawName!.toLowerCase();
    if (!ELEMENTS.has(name)) {
      problems.push(`${where} uses the element <${rawName}>`);
      continue;
    }
    if (closing) continue;
    if (name === "svg") {
      if (rootSeen) problems.push(`${where} nests an <svg>`);
      rootSeen = true;
    }
    const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    const leftover = attrs!.replace(attrRe, "").trim();
    if (leftover) problems.push(`${where} has an attribute without a quoted value on <${rawName}>`);
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(attrs!))) {
      const key = a[1]!.toLowerCase();
      const value = (a[3] ?? a[4] ?? "").trim();
      if (!ATTRIBUTES.has(key)) {
        problems.push(`${where} uses the attribute ${a[1]} on <${rawName}>`);
        continue;
      }
      if ((key === "fill" || key === "stroke") && !PAINT.test(value)) problems.push(`${where} paints with "${value}"`);
      if (key === "stop-color" && !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)) problems.push(`${where} has a gradient stop "${value}"`);
      if (key === "clip-path" && !/^url\(#[A-Za-z][\w-]*\)$/.test(value)) problems.push(`${where} clips with "${value}"`);
      if (key === "xmlns" && value !== "http://www.w3.org/2000/svg") problems.push(`${where} declares the namespace ${value}`);
      // The namespace is checked exactly above; every other value must stay inside the document.
      if (key !== "xmlns" && /javascript:|data:|https?:|url\((?!#)/i.test(value)) problems.push(`${where} refers outside itself in ${a[1]}`);
      if (name === "svg" && key === "viewbox" && value.replace(/\s+/g, " ") !== `0 0 ${size.width} ${size.height}`)
        problems.push(`${where} has the view box "${value}", not "0 0 ${size.width} ${size.height}"`);
    }
  }
  if (/[<>]/.test(body.slice(consumed))) problems.push(`${where} has markup that is not a well formed tag`);
  if (!rootSeen) problems.push(`${where} is not an SVG document`);
  else if (!/<svg[^>]*\bviewBox\s*=/i.test(body)) problems.push(`${where} has no view box`);
  return problems;
}

/** Hex SHA-256 of text, for checking a declared digest against the served bytes. */
export type Digester = (bytes: Uint8Array) => Promise<string> | string;

/**
 * Validates a theme against the contract. With `read`, it also fetches each asset, recomputes its
 * digest, checks its byte count and its SVG. Returns every problem found, in words; empty means valid.
 */
export async function validateTheme(theme: OfficeThemeV1, read?: (path: string) => Promise<Uint8Array | null>, digest?: Digester): Promise<string[]> {
  const problems: string[] = [];
  const t = theme as unknown as Record<string, unknown>;
  const allowedKeys = new Set(["schemaVersion", "id", "version", "title", "description", "availability", "tokens", "regions", "bodies", "motionProfile", "accessibility", "credits"]);
  for (const k of Object.keys(t)) if (!allowedKeys.has(k)) problems.push(`the theme has an unknown field ${k}`);
  if (theme.schemaVersion !== 1) problems.push("the theme is not schema version 1");
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(theme.id ?? "")) problems.push("the theme id is not a short lowercase name");
  if (!/^\d+\.\d+\.\d+$/.test(theme.version ?? "")) problems.push("the theme version is not x.y.z");
  if (!theme.title?.trim() || theme.title.length > 60) problems.push("the theme needs a title of at most 60 characters");
  if (theme.availability !== "development" && theme.availability !== "released") problems.push("availability must be development or released");
  if (theme.motionProfile !== "shared-v1") problems.push("a theme uses the shared motion profile only");
  const tokens = (theme.tokens ?? {}) as Record<string, string>;
  for (const k of Object.keys(tokens)) if (!(SCENE_TOKENS as readonly string[]).includes(k)) problems.push(`the token ${k} is not a scene token`);
  for (const k of SCENE_TOKENS) if (!HEX.test(tokens[k] ?? "")) problems.push(`the scene token ${k} must be a #rrggbb colour`);
  const regions = (theme.regions ?? {}) as Record<string, { label?: string; art?: ThemeAsset | null }>;
  for (const k of Object.keys(regions)) if (!(REGION_IDS as readonly string[]).includes(k)) problems.push(`the theme decorates ${k}, which is not a region`);
  const assets: { asset: ThemeAsset; size: { width: number; height: number }; where: string }[] = [];
  for (const id of REGION_IDS) {
    const r = regions[id];
    if (!r) {
      problems.push(`the theme has nothing for ${id}`);
      continue;
    }
    const keys = Object.keys(r).filter((k) => k !== "label" && k !== "art");
    if (keys.length) problems.push(`${id} carries ${keys.join(", ")}; a region holds only a label and art`);
    if (!r.label?.trim() || r.label.length > 32) problems.push(`${id} needs a themed label of at most 32 characters`);
    if (r.art) {
      const region = REGION[id];
      if (r.art.width !== region.w || r.art.height !== region.h) problems.push(`${id} art is ${r.art.width} by ${r.art.height}, not the region's ${region.w} by ${region.h}`);
      assets.push({ asset: r.art, size: { width: region.w, height: region.h }, where: `${id} art` });
    }
  }
  if (!Array.isArray(theme.bodies) || theme.bodies.length < 1 || theme.bodies.length > 8) problems.push("a theme needs one to eight figure bodies");
  for (const [i, b] of (theme.bodies ?? []).entries()) assets.push({ asset: b, size: { width: 64, height: 64 }, where: `body ${i}` });
  for (const { asset, where } of assets) {
    if (!asset.path.startsWith(`/office-themes/${theme.id}/`) || !asset.path.endsWith(".svg")) problems.push(`${where} is not an SVG under /office-themes/${theme.id}/`);
    if (!/^[0-9a-f]{64}$/.test(asset.sha256)) problems.push(`${where} has no SHA-256`);
    else if (!asset.path.includes(`.${asset.sha256.slice(0, 12)}.`)) problems.push(`${where} is not named with its digest`);
    if (!["original", "licensed", "public-domain"].includes(asset.rightsBasis)) problems.push(`${where} has no rights basis`);
  }
  if (read) {
    for (const { asset, size, where } of assets) {
      const bytes = await read(asset.path);
      if (!bytes) {
        problems.push(`${where} is missing at ${asset.path}`);
        continue;
      }
      if (bytes.byteLength !== asset.bytes) problems.push(`${where} is ${bytes.byteLength} bytes, not the declared ${asset.bytes}`);
      if (digest && (await digest(bytes)) !== asset.sha256) problems.push(`${where} does not match its declared digest`);
      problems.push(...validateSvg(new TextDecoder().decode(bytes), size, where));
    }
  }
  return problems;
}
