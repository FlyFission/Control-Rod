import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { readRoleTools } from "../src/sandbox.js";
import { findRoleIn, jobIntakeGuides, packFiles, preCheckRole, roleToolText, type WorkConfig } from "../src/work.js";

const repo = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const softwarePack = join(repo, "packs", "software");
const cfg: WorkConfig = { root: repo, ajv: new Ajv2020() };

const PACK_FILE_MAX = 256 * 1024;
const PACK_TOTAL_MAX = 2 * 1024 * 1024;
const PLAYBOOKS = ["bugfix", "feature", "migration"] as const;

function walkEntries(dir: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    entries.push(p);
    if (lstatSync(p).isDirectory()) entries.push(...walkEntries(p));
  }
  return entries;
}

describe("packs/software", () => {
  it("contains only real files and directories within pack size limits (no symlinks)", () => {
    const all = walkEntries(softwarePack);
    expect(all.length).toBeGreaterThan(0);
    let total = 0;
    for (const p of all) {
      const st = lstatSync(p);
      expect(st.isSymbolicLink(), `unexpected symlink: ${p}`).toBe(false);
      if (st.isFile()) {
        expect(st.size, `file too large: ${p}`).toBeLessThanOrEqual(PACK_FILE_MAX);
        total += st.size;
      }
    }
    expect(total).toBeLessThanOrEqual(PACK_TOTAL_MAX);
  });

  it("resolves shared software roles via findRoleIn and preCheckRole", () => {
    const author = findRoleIn(cfg, "software-author");
    expect(author).not.toBeNull();
    expect(author!.packDir).toBe(softwarePack);
    expect(author!.text).toBe(readFileSync(join(softwarePack, "roles", "software-author.md"), "utf8"));
    expect(author!.text).toContain("out/");
    expect(author!.text).toContain("acceptance criterion");

    // Family fallback: software-author -> software -> software-pre-check
    const checker = preCheckRole(cfg, "software-author");
    expect(checker).toBe(readFileSync(join(softwarePack, "roles", "software-pre-check.md"), "utf8"));
    expect(checker).toContain("inputs/deliverables/");
    expect(checker).toContain("Never edit or fix the deliverables yourself");
    expect(preCheckRole(cfg, "software-bugfix")).toBe(checker);

    // Job intake.md files must never mask the top-level intake role.
    const intake = findRoleIn(cfg, "intake");
    expect(intake?.packDir).toBe(join(repo, "packs", "general"));
  });

  it("resolves software-author tools cleanly for author and pre-check runs", () => {
    const pkg = { agent_assignment: [{ role: "software-author" }] };
    const authorTools = roleToolText(cfg, { role: "author" }, pkg);
    expect(authorTools).toBe(readFileSync(join(softwarePack, "roles", "software-author.tools.md"), "utf8"));

    const parsed = readRoleTools(authorTools);
    expect(parsed.malformed).toEqual([]);
    expect(parsed.hosts).toEqual([]);
    expect(parsed.tools).toEqual(expect.arrayContaining(["Read", "Write", "Edit", "Glob", "Grep"]));

    const checkerTools = roleToolText(cfg, { role: "pre-check" }, pkg);
    expect(checkerTools).not.toMatch(/^\s*network\s*:/im);
    expect(readRoleTools(checkerTools).hosts).toEqual([]);
  });

  it("loads templates and typicals for bugfix, feature, and migration via packFiles", () => {
    for (const playbook of PLAYBOOKS) {
      const dir = join(softwarePack, playbook);
      expect(statSync(dir).isDirectory()).toBe(true);
      const files = packFiles(dir);
      const names = files.map((f) => f.name);
      expect(names.some((n) => n.startsWith("pack/templates/"))).toBe(true);
      expect(names.some((n) => n.startsWith("pack/typicals/"))).toBe(true);

      for (const f of files) {
        const rel = f.name.replace(/^pack\//, "");
        const disk = readFileSync(join(dir, rel));
        expect(Buffer.from(f.content_base64, "base64").equals(disk)).toBe(true);
        if (rel.endsWith(".json")) {
          const parsed = JSON.parse(disk.toString("utf8")) as Record<string, unknown>;
          expect(parsed.role).toBe("software-author");
          expect(typeof parsed.typical).toBe("string");
        }
      }
    }
  });

  it("exposes depth-2 intake guides for every software playbook via jobIntakeGuides", () => {
    const guides = jobIntakeGuides(cfg);
    for (const playbook of PLAYBOOKS) {
      const p = join(softwarePack, playbook, "roles", "intake.md");
      expect(existsSync(p)).toBe(true);
      const expected = `## Job guidance: software/${playbook}\n\n${readFileSync(p, "utf8")}`;
      expect(guides).toContain(expected);
    }
  });
});
