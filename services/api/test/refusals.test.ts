import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { REASONS, teach } from "../src/refusals.js";
import { type Harness, ORIGIN, VirtualAuthenticator, registerWithInvitation, signIn, startHarness } from "./harness.js";

/** Refusals teach (workbench plan task 1.11; specification WB-03). */
const SRC = new URL("../src/", import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith(".ts") ? [join(dir, f)] : []));

describe("every reason code renders", () => {
  it("lists every code the API refuses with", () => {
    const used = new Set<string>();
    for (const f of files(SRC)) for (const m of readFileSync(f, "utf8").matchAll(/new Refusal\(\s*\d{3},\s*"([a-z0-9-]+)"/g)) used.add(m[1]!);
    expect(used.size).toBeGreaterThan(50);
    expect([...used].filter((c) => !REASONS[c]).sort()).toEqual([]);
  });

  it("lists every kernel reason code except allowed", () => {
    const rs = readFileSync(new URL("../../../kernel/src/decision.rs", import.meta.url), "utf8");
    const body = rs.slice(rs.indexOf("pub enum ReasonCode"), rs.indexOf("}", rs.indexOf("pub enum ReasonCode")));
    const variants = [...body.matchAll(/^\s+([A-Z][A-Za-z]+),/gm)].map((m) => m[1]!.replace(/[A-Z]/g, (ch, i) => (i ? "-" : "") + ch.toLowerCase()));
    expect(variants).toContain("not-independent");
    expect(variants.filter((v) => v !== "allowed" && !REASONS[v])).toEqual([]);
  });

  it("marks each floor of specification 11.2, and every entry is plain prose", () => {
    const floors = Object.entries(REASONS).filter(([, r]) => r.floor).map(([c]) => c).sort();
    expect(floors).toEqual(["autonomy-floor", "hardware-key-required", "lane-local-only", "not-human", "not-independent", "sealed-no-auto-merge"]);
    for (const [code, r] of Object.entries(REASONS)) {
      expect(r.sentence.length, code).toBeGreaterThan(10);
      expect(r.change.length, code).toBeGreaterThan(10);
      expect(`${r.sentence} ${r.change}`, code).not.toMatch(/[–—]/);
    }
    expect(teach("never-heard-of-it").sentence).toBe("The request was refused.");
  });
});

describe("over HTTP", () => {
  let h: Harness;
  let ben: string;
  let dana: string;
  const benKey = new VirtualAuthenticator();
  const danaKey = new VirtualAuthenticator();
  const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));

  beforeAll(async () => {
    h = await startHarness();
    ben = await signIn(h.app, benKey);
    const payload = { user_name: "dana" };
    const o = await h.app.inject({ method: "POST", url: "/admin/commands/member.enroll/options", headers: { cookie: ben, origin: ORIGIN }, payload: { payload } });
    const r = await h.app.inject({ method: "POST", url: "/admin/commands/member.enroll", headers: { cookie: ben, origin: ORIGIN },
      payload: { payload, assertion: benKey.assert(o.json().options) } });
    dana = await registerWithInvitation(h.app, r.json().invitation.token, danaKey);
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-ACT', 0, 'draft', $1)", [{ ...example, id: "WP-ACT", revision: 0, status: "draft" }]);
  }, 120_000);
  afterAll(async () => h?.stop());

  const actions = async (cookie: string) => (await h.app.inject({ method: "GET", url: "/packages/WP-ACT/actions", headers: { cookie } })).json();

  it("answers a refusal with the fact that would change it", async () => {
    const r = await h.app.inject({ method: "POST", url: "/captures/C-none/classify", headers: { cookie: dana, origin: ORIGIN }, payload: { lane: "internal" } });
    expect(r.json()).toEqual({ code: "authority-missing", message: "Classifying a data lane needs lane authority", change: REASONS["authority-missing"]!.change });
  });

  it("describes each decision on a draft for a qualified person: release allowed, the verdicts refused by state", async () => {
    const a = await actions(ben);
    const by = Object.fromEntries(a.map((x: { command: string }) => [x.command, x]));
    expect(by["draft.edit"]).toMatchObject({ allowed: true, signature: "none" });
    expect(by.release).toMatchObject({ allowed: true, signature: "direct", authority: ["approver", "engineer-in-responsible-charge"] });
    expect(by.accept).toMatchObject({ allowed: false, reason_code: "wrong-state", change: REASONS["wrong-state"]!.change });
    expect(Object.keys(by).sort()).toEqual(["accept", "accept-with-findings", "draft.edit", "reject", "release", "return"]);
  });

  it("names the missing qualification for a person without one", async () => {
    const a = await actions(dana);
    const release = a.find((x: { command: string }) => x.command === "release");
    expect(release).toMatchObject({ allowed: false, reason_code: "qualification-missing", missing: ["a signer qualification"] });
    const admin = (await h.app.inject({ method: "GET", url: "/admin", headers: { cookie: dana } })).json();
    const enroll = admin.actions.find((x: { command: string }) => x.command === "member.enroll");
    expect(enroll).toMatchObject({ allowed: false, reason_code: "authority-missing", missing: ["administrator authority"] });
    expect(admin.actions.find((x: { command: string }) => x.command === "theme.select")).toMatchObject({ allowed: true });
  });
});
