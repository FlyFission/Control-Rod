import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type OfficeThemeV1, validateSvg, validateTheme } from "./contract.js";
import { REGION } from "./layout.js";
import bright from "./themes/harness-bright.js";
import standard from "./themes/standard-office.js";
import released from "./themes/released.json";
import { OFFICE_THEMES, releasedOfficeThemes } from "./registry.js";
import { renderAll } from "../../../scripts/build-office-themes.ts";

/** The office theme contract and validator (plan tasks 4.2 and 4.4; specification 18). */

const PUBLIC = join(__dirname, "../../../public");
const read = async (path: string) => {
  try {
    return new Uint8Array(readFileSync(join(PUBLIC, path)));
  } catch {
    return null;
  }
};
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const size = { width: REGION.review.w, height: REGION.review.h };
const ok = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}"><rect x="0" y="0" width="10" height="10" fill="#123456"/></svg>`;

describe("themes", () => {
  it("passes for the default theme and the structurally different test theme, files and digests included", async () => {
    expect(await validateTheme(standard, read, sha)).toEqual([]);
    expect(await validateTheme(bright, read, sha)).toEqual([]);
    expect(standard.availability).toBe("released");
    // Structurally different: other tokens, other body count, every region's art distinct.
    expect(bright.tokens.floor).not.toBe(standard.tokens.floor);
    expect(bright.bodies.length).not.toBe(standard.bodies.length);
    expect(bright.regions.review.art?.sha256).not.toBe(standard.regions.review.art?.sha256);
  });

  it("refuses a theme that adds fields, moves a region, sets a semantic colour or skips a region", async () => {
    const extra = { ...standard, marks: { needs: "#ff0000" } } as unknown as OfficeThemeV1;
    expect(await validateTheme(extra)).toContain("the theme has an unknown field marks");
    const semantic = { ...standard, tokens: { ...standard.tokens, needs: "#ff0000" } } as unknown as OfficeThemeV1;
    expect(await validateTheme(semantic)).toContain("the token needs is not a scene token");
    const resized = { ...standard, regions: { ...standard.regions, review: { ...standard.regions.review, art: { ...standard.regions.review.art!, width: 999 } } } };
    expect((await validateTheme(resized)).some((p) => p.startsWith("review art is 999 by"))).toBe(true);
    const renamed = { ...standard, regions: { ...standard.regions, review: { ...standard.regions.review, name: "Approvals" } } } as unknown as OfficeThemeV1;
    expect(await validateTheme(renamed)).toContain("review carries name; a region holds only a label and art");
    const { quarantine: _q, ...rest } = standard.regions;
    expect(await validateTheme({ ...standard, regions: rest } as unknown as OfficeThemeV1)).toContain("the theme has nothing for quarantine");
  });

  it("requires accessibility notes, credits and every asset's provenance, and refuses malformed input", async () => {
    const { accessibility: _a, credits: _c, ...bare } = standard;
    const problems = await validateTheme(bare as unknown as OfficeThemeV1);
    expect(problems).toContain("the theme needs accessibility notes, and nothing else under accessibility");
    expect(problems).toContain("the theme needs at least one credit, each a line of text");
    const { creator: _cr, licenseNoticeId: _l, ...anon } = standard.bodies[0]!;
    const unsourced = { ...standard, bodies: [anon, ...standard.bodies.slice(1)] } as unknown as OfficeThemeV1;
    expect(await validateTheme(unsourced)).toEqual(expect.arrayContaining(["body 0 names no creator", "body 0 names no license notice"]));
    expect(await validateTheme(null as unknown as OfficeThemeV1)).toEqual(["the theme is not an object"]);
    const broken = { ...standard, regions: "everywhere", bodies: [7] } as unknown as OfficeThemeV1;
    expect(await validateTheme(broken)).toEqual(expect.arrayContaining(["the theme has no regions", "body 0 is not an asset"]));
  });

  it("catches an asset whose bytes do not match its digest", async () => {
    const swapped = async (path: string) => (path === standard.regions.bench.art!.path ? new TextEncoder().encode(ok) : read(path));
    const problems = await validateTheme(standard, swapped, sha);
    expect(problems).toContain("bench art does not match its declared digest");
  });
});

describe("generated files", () => {
  it("match what the generator renders now, with nothing extra in the theme folders", () => {
    const web = join(__dirname, "../../..");
    const rendered = renderAll();
    for (const [path, text] of rendered) expect(readFileSync(join(web, path), "utf8"), `${path} is stale; run scripts/build-office-themes.ts`).toBe(text);
    for (const t of OFFICE_THEMES)
      for (const f of readdirSync(join(PUBLIC, "office-themes", t.id))) expect(rendered.has(`public/office-themes/${t.id}/${f}`), `${t.id}/${f} is not generated`).toBe(true);
  });
});

describe("registry", () => {
  it("ships exactly the released themes, and the build reads the same list", () => {
    expect(releasedOfficeThemes().map((t) => t.id)).toEqual(released);
    expect(released).toEqual(["standard-office"]);
    expect(new Set(OFFICE_THEMES.map((t) => t.id)).size).toBe(OFFICE_THEMES.length);
  });
});

describe("SVG allowlist", () => {
  it("accepts plain shapes and gradients sized to the region", () => {
    expect(validateSvg(ok, size, "art")).toEqual([]);
    const gradient = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}"><defs><linearGradient id="a"><stop offset="0" stop-color="#ffffff"/></linearGradient></defs><rect width="5" height="5" fill="url(#a)"/></svg>`;
    expect(validateSvg(gradient, size, "art")).toEqual([]);
  });

  it.each([
    ["a script", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><script>alert(1)</script></svg>`, "uses the element <script>"],
    ["an event handler", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><rect onclick="x()" width="1" height="1"/></svg>`, "uses the attribute onclick"],
    ["an external link", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><image href="https://example.com/a.png"/></svg>`, "uses the element <image>"],
    ["a use reference", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><use href="#a"/></svg>`, "uses the element <use>"],
    ["a foreign object", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><foreignObject/></svg>`, "uses the element <foreignObject>"],
    ["a style element", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><style>*{}</style></svg>`, "uses the element <style>"],
    ["a style attribute", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><rect style="fill:red" width="1" height="1"/></svg>`, "uses the attribute style"],
    ["a filter", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><filter id="f"/></svg>`, "uses the element <filter>"],
    ["an animation", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><rect width="1" height="1"><animate attributeName="x"/></rect></svg>`, "uses the element <animate>"],
    ["text", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><text>Approve</text></svg>`, "uses the element <text>"],
    ["an external paint", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><rect fill="url(https://x/y#a)" width="1" height="1"/></svg>`, "paints with"],
    ["a named colour", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><rect fill="currentColor" width="1" height="1"/></svg>`, "paints with"],
    ["an entity", `<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"/>`, "declares a doctype"],
    ["art larger than its region", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 400 400"><rect width="1" height="1"/></svg>`, "has the view box"],
    ["mismatched closing tags", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><g><rect width="1" height="1"></g></rect></svg>`, "closes <g> where <rect> is open"],
    ["an unclosed element", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><g>`, "leaves <g> open"],
    ["a repeated attribute", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><rect fill="#000000" fill="#ffffff" width="1" height="1"/></svg>`, "repeats the attribute fill"],
    ["loose text", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300">Approve</svg>`, "text outside a title"],
    ["a second root", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"/><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"/>`, "content after its root"],
    ["a root that is not svg", `<g/>`, "has the root <g>"],
    ["a width other than the region's", `<svg xmlns="http://www.w3.org/2000/svg" width="900" viewBox="0 0 160 300"/>`, "declares width 900"],
    ["no namespace", `<svg viewBox="0 0 160 300"/>`, "does not declare the SVG namespace"],
    ["a closing tag in another case", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><g></G></svg>`, "closes <G> where <g> is open"],
    ["attributes run together", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><rect width="1"height="1"/></svg>`, "runs attributes together"],
    ["an undefined entity", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><title>&missing;</title></svg>`, "undefined entity"],
    ["an attribute on a closing tag", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><g></g fill="#ffffff"></svg>`, "malformed closing tag"],
    ["an unquoted attribute", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300"><rect width=1 height="1"/></svg>`, "without a quoted value"],
  ])("refuses %s", (_name, text, problem) => {
    expect(validateSvg(text, size, "art").some((p) => p.includes(problem))).toBe(true);
  });

  it("accepts nothing an XML parser rejects: every accepted document, theme art included, parses cleanly", async () => {
    const parses = (text: string) => new DOMParser().parseFromString(text, "image/svg+xml").getElementsByTagName("parsererror").length === 0;
    const accepted = [ok, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}"><title>A &amp; B &#38;</title></svg>`];
    for (const theme of [standard, bright])
      for (const a of [...Object.values(theme.regions).map((r) => r.art!), ...theme.bodies]) accepted.push(new TextDecoder().decode((await read(a.path))!));
    for (const text of accepted) expect(parses(text), text.slice(0, 80)).toBe(true);
    // And the malformed cases above are malformed to a parser too, so the scanner is not stricter than XML by accident.
    for (const bad of ["<g></G>", '<rect width="1"height="1"/>', "<title>&missing;</title>", '<g></g fill="#fff">'])
      expect(parses(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 300">${bad}</svg>`)).toBe(false);
  });
});
