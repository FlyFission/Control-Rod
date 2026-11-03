import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { type Harness, VirtualAuthenticator, signIn, startHarness } from "./harness.js";

/**
 * The office floor reads the Inbox before it reads the runs, so a restart can commit between the two:
 * the Inbox still holds a SCRAM's words while the run, read afterwards, no longer says it was held.
 * Presenting, the SCRAM's reason must not reach the response either way (plan task 4.10, OV-07).
 * The interleaving is reproduced by letting the Inbox answer as it would have before the restart.
 */
const SECRET = "Credentials for the vendor portal were posted in a public channel";
const stale = vi.hoisted(() => ({ items: [] as Record<string, unknown>[], theirs: [] as Record<string, unknown>[] }));
vi.mock("../src/inbox.js", async (original) => {
  const real = await original<typeof import("../src/inbox.js")>();
  return {
    ...real,
    inbox: async (...args: Parameters<typeof real.inbox>) => {
      const box = await real.inbox(...args);
      return { ...box, items: [...stale.items, ...box.items], waiting_on_others: [...stale.theirs, ...box.waiting_on_others] };
    },
  };
});

let h: Harness;
let cookie: string;
const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, new VirtualAuthenticator());
  for (const id of ["WP-RACE-OWN", "WP-RACE-THEIRS"]) {
    await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'in-work', $2)",
      [id, { ...example, id, revision: 0, status: "in-work", data_lane: "internal", design_inputs: [] }]);
    // Lifted and cleared: the run no longer carries any hold.
    const r = { schema_version: "0.1.0", id: `R-${id.slice(3).toLowerCase()}`, package_id: id, package_revision: 0, role: "author", agent_baseline: "unassigned",
      runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: new Date().toISOString(), generation: 1 };
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 1, 'queued', $3)", [r.id, id, r]);
  }
  const words = `SCRAM scr_race has stopped this work: ${SECRET}`;
  const since = new Date().toISOString();
  // What the Inbox read before the restart committed: one item the viewer acts on, one someone else does.
  stale.items.push({ kind: "permission", package_id: "WP-RACE-OWN", package_revision: 0, title: "Own", detail: words, since, scram_id: "scr_race", href: { to: "/packages" } });
  stale.theirs.push({ kind: "release", package_id: "WP-RACE-THEIRS", package_revision: 0, title: "Theirs", detail: "Release this package", since, scram_id: "scr_race",
    waiting_on: "a restart after SCRAM", reason: words, href: { to: "/packages" } });
}, 120_000);
afterAll(async () => h?.stop());

describe("presenting while a restart lands between reads", () => {
  it("never shows a SCRAM's reason carried only by the Inbox's earlier read", async () => {
    const floor = (await h.app.inject({ method: "GET", url: "/office/figures?presenting=true", headers: { cookie } })).json();
    const own = floor.figures.find((f: { package_id: string }) => f.package_id === "WP-RACE-OWN");
    const theirs = floor.figures.find((f: { package_id: string }) => f.package_id === "WP-RACE-THEIRS");
    expect(own.cause).toBe("Author run was held by a SCRAM; its reason is not shown while presenting");
    expect(theirs.cause).toBe("Author run was held by a SCRAM; its reason is not shown while presenting");
    expect(JSON.stringify(floor)).not.toContain(SECRET);
    // Not presenting, the person sees the words as the Inbox gave them.
    const plain = (await h.app.inject({ method: "GET", url: "/office/figures", headers: { cookie } })).json();
    expect(JSON.stringify(plain)).toContain(SECRET);
  });
});
