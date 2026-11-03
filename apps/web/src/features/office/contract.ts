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
 * Checks an SVG document against the allowlist: well formed (one root <svg>, every tag closed in
 * order, no attribute twice, no text outside <title> and <desc>), only listed elements and
 * attributes, paint either a colour or a reference to one of its own gradients, references only to
 * its own fragments, and a view box (and any width and height) of exactly the given size from the
 * origin. Containment: the renderer draws the art as an image exactly the region's size, and an SVG
 * image clips to its own viewport, so geometry past the view box is never painted outside the region.
 */
export function validateSvg(text: string, size: { width: number; height: number }, where: string): string[] {
  const problems: string[] = [];
  if (text.length > 512_000) problems.push(`${where} is larger than 500 KB`);
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(text)) problems.push(`${where} declares a doctype, entity or processing instruction`);
  if (/<!\[CDATA\[/i.test(text)) problems.push(`${where} contains CDATA`);
  const body = text.replace(/^\s*<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const tag = /<\s*(\/?)\s*([A-Za-z][\w:.-]*)([^>]*?)(\/?)\s*>/g;
  const stack: string[] = [];
  let roots = 0;
  let closedRoot = false;
  let m: RegExpExecArray | null;
  let consumed = 0;
  const between = (from: number, to: number) => {
    const t = body.slice(from, to);
    if (/[<>]/.test(t)) problems.push(`${where} has markup that is not a well formed tag`);
    else if (t.trim() && !["title", "desc"].includes(stack.at(-1) ?? "")) problems.push(`${where} has text outside a title or description`);
  };
  while ((m = tag.exec(body))) {
    between(consumed, m.index);
    consumed = m.index + m[0].length;
    const [, closing, rawName, attrs, selfClosing] = m;
    const name = rawName!.toLowerCase();
    if (closing) {
      const open = stack.pop();
      if (open !== name) problems.push(`${where} closes <${rawName}> where <${open ?? "nothing"}> is open`);
      if (stack.length === 0) closedRoot = true;
      continue;
    }
    if (closedRoot || (stack.length === 0 && roots > 0)) problems.push(`${where} has content after its root element`);
    if (stack.length === 0) {
      roots++;
      if (name !== "svg") problems.push(`${where} has the root <${rawName}>, not <svg>`);
    } else if (name === "svg") problems.push(`${where} nests an <svg>`);
    if (!ELEMENTS.has(name)) problems.push(`${where} uses the element <${rawName}>`);
    if (!selfClosing) stack.push(name);
    else if (stack.length === 0) closedRoot = true;
    if (!ELEMENTS.has(name)) continue;
    const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    const leftover = attrs!.replace(attrRe, "").trim();
    if (leftover) problems.push(`${where} has an attribute without a quoted value on <${rawName}>`);
    const seen = new Set<string>();
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(attrs!))) {
      const key = a[1]!.toLowerCase();
      const value = (a[3] ?? a[4] ?? "").trim();
      if (seen.has(key)) problems.push(`${where} repeats the attribute ${a[1]} on <${rawName}>`);
      seen.add(key);
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
      if (name === "svg" && stack.length <= 1) {
        if (key === "viewbox" && value.replace(/\s+/g, " ") !== `0 0 ${size.width} ${size.height}`)
          problems.push(`${where} has the view box "${value}", not "0 0 ${size.width} ${size.height}"`);
        if ((key === "width" && value !== String(size.width)) || (key === "height" && value !== String(size.height)))
          problems.push(`${where} declares ${key} ${value}, not ${key === "width" ? size.width : size.height}`);
      }
    }
    if (name === "svg" && roots === 1 && stack.length <= 1 && !seen.has("viewbox")) problems.push(`${where} has no view box`);
    if (name === "svg" && roots === 1 && stack.length <= 1 && !seen.has("xmlns")) problems.push(`${where} does not declare the SVG namespace`);
  }
  between(consumed, body.length);
  if (stack.length > 0) problems.push(`${where} leaves <${stack.at(-1)}> open`);
  if (roots === 0) problems.push(`${where} is not an SVG document`);
  return problems;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isText = (v: unknown, max: number): v is string => isString(v) && v.trim().length > 0 && v.length <= max;

/** Hex SHA-256 of text, for checking a declared digest against the served bytes. */
export type Digester = (bytes: Uint8Array) => Promise<string> | string;

/**
 * Validates a theme against the contract. With `read`, it also fetches each asset, recomputes its
 * digest, checks its byte count and its SVG. Returns every problem found, in words; empty means valid.
 */
export async function validateTheme(theme: OfficeThemeV1, read?: (path: string) => Promise<Uint8Array | null>, digest?: Digester): Promise<string[]> {
  const problems: string[] = [];
  if (!isRecord(theme)) return ["the theme is not an object"];
  const t = theme as unknown as Record<string, unknown>;
  const allowedKeys = new Set(["schemaVersion", "id", "version", "title", "description", "availability", "tokens", "regions", "bodies", "motionProfile", "accessibility", "credits"]);
  for (const k of Object.keys(t)) if (!allowedKeys.has(k)) problems.push(`the theme has an unknown field ${k}`);
  if (t.schemaVersion !== 1) problems.push("the theme is not schema version 1");
  if (!isString(t.id) || !/^[a-z][a-z0-9-]{1,40}$/.test(t.id)) problems.push("the theme id is not a short lowercase name");
  if (!isString(t.version) || !/^\d+\.\d+\.\d+$/.test(t.version)) problems.push("the theme version is not x.y.z");
  if (!isText(t.title, 60)) problems.push("the theme needs a title of at most 60 characters");
  if (!isText(t.description, 300)) problems.push("the theme needs a description of at most 300 characters");
  if (t.availability !== "development" && t.availability !== "released") problems.push("availability must be development or released");
  if (t.motionProfile !== "shared-v1") problems.push("a theme uses the shared motion profile only");
  const acc = t.accessibility;
  if (!isRecord(acc) || !isText(acc.notes, 1000) || Object.keys(acc).some((k) => k !== "notes")) problems.push("the theme needs accessibility notes, and nothing else under accessibility");
  if (!Array.isArray(t.credits) || t.credits.length === 0 || !t.credits.every((c) => isText(c, 200))) problems.push("the theme needs at least one credit, each a line of text");
  const tokens = isRecord(t.tokens) ? t.tokens : {};
  if (!isRecord(t.tokens)) problems.push("the theme has no scene tokens");
  for (const k of Object.keys(tokens)) if (!(SCENE_TOKENS as readonly string[]).includes(k)) problems.push(`the token ${k} is not a scene token`);
  for (const k of SCENE_TOKENS) if (!isString(tokens[k]) || !HEX.test(tokens[k])) problems.push(`the scene token ${k} must be a #rrggbb colour`);
  const regions = isRecord(t.regions) ? t.regions : {};
  if (!isRecord(t.regions)) problems.push("the theme has no regions");
  for (const k of Object.keys(regions)) if (!(REGION_IDS as readonly string[]).includes(k)) problems.push(`the theme decorates ${k}, which is not a region`);
  const assets: { asset: ThemeAsset; size: { width: number; height: number }; where: string }[] = [];
  for (const id of REGION_IDS) {
    const r = regions[id];
    if (!isRecord(r)) {
      problems.push(`the theme has nothing for ${id}`);
      continue;
    }
    const keys = Object.keys(r).filter((k) => k !== "label" && k !== "art");
    if (keys.length) problems.push(`${id} carries ${keys.join(", ")}; a region holds only a label and art`);
    if (!isText(r.label, 32)) problems.push(`${id} needs a themed label of at most 32 characters`);
    if (r.art !== null) {
      const region = REGION[id];
      if (!isRecord(r.art)) problems.push(`${id} art must be an asset or null`);
      else {
        const art = r.art as unknown as ThemeAsset;
        if (art.width !== region.w || art.height !== region.h) problems.push(`${id} art is ${art.width} by ${art.height}, not the region's ${region.w} by ${region.h}`);
        assets.push({ asset: art, size: { width: region.w, height: region.h }, where: `${id} art` });
      }
    }
  }
  const bodies = Array.isArray(t.bodies) ? t.bodies : [];
  if (!Array.isArray(t.bodies) || bodies.length < 1 || bodies.length > 8) problems.push("a theme needs one to eight figure bodies");
  for (const [i, b] of bodies.entries()) {
    if (!isRecord(b)) problems.push(`body ${i} is not an asset`);
    else {
      if (b.width !== 64 || b.height !== 64) problems.push(`body ${i} is not 64 by 64`);
      assets.push({ asset: b as unknown as ThemeAsset, size: { width: 64, height: 64 }, where: `body ${i}` });
    }
  }
  const ASSET_KEYS = ["path", "sha256", "bytes", "width", "height", "creator", "rightsBasis", "licenseNoticeId"];
  for (const { asset, where } of assets) {
    const a = asset as unknown as Record<string, unknown>;
    for (const k of Object.keys(a)) if (!ASSET_KEYS.includes(k)) problems.push(`${where} has an unknown field ${k}`);
    if (!isString(a.path) || !a.path.startsWith(`/office-themes/${String(t.id)}/`) || !/^[a-z0-9-]+\.[0-9a-f]{12}\.svg$/.test(a.path.split("/").pop() ?? ""))
      problems.push(`${where} is not an SVG under /office-themes/${String(t.id)}/ named name.digest.svg`);
    if (!isString(a.sha256) || !/^[0-9a-f]{64}$/.test(a.sha256)) problems.push(`${where} has no SHA-256`);
    else if (isString(a.path) && !a.path.endsWith(`.${a.sha256.slice(0, 12)}.svg`)) problems.push(`${where} is not named with its digest`);
    if (!Number.isInteger(a.bytes) || (a.bytes as number) <= 0) problems.push(`${where} has no byte count`);
    if (!Number.isInteger(a.width) || !Number.isInteger(a.height)) problems.push(`${where} has no whole number size`);
    if (!isText(a.creator, 200)) problems.push(`${where} names no creator`);
    if (!isText(a.licenseNoticeId, 100)) problems.push(`${where} names no license notice`);
    if (!["original", "licensed", "public-domain"].includes(a.rightsBasis as string)) problems.push(`${where} has no rights basis`);
  }
  if (read) {
    for (const { asset, size, where } of assets) {
      if (!isString(asset.path)) continue;
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
