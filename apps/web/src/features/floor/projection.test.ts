import { describe, it, expect } from "vitest";
import type { Run, OfficeItem } from "../../api/types.js";
import { pkg, view } from "../../test/fixtures.js";
import { projectFloor, variantForRun } from "./project.js";
import { selectPackagePage } from "./paging.js";
import { layoutEntities } from "./layout.js";
import type { FloorEntity } from "./types.js";
const page = { index: 0, size: 30 as const, filter: "active" as const };
const run = (over: Partial<Run> = {}): Run => ({
  schema_version: "0.1.0",
  id: "R1",
  package_id: "WP-0001",
  package_revision: 0,
  role: "author",
  agent_baseline: "site-author",
  runtime: { kind: "subscription", provider: "codex", model: "test" },
  round: 1,
  status: "running",
  queued_at: "2026-10-26T12:00:00Z",
  ...over,
});
const model = (runs: Run[], office: OfficeItem[] = []) =>
  projectFloor({
    packages: [pkg()],
    views: new Map([["WP-0001", view({ runs })]]),
    office,
    page,
  });
describe("authoritative Floor projection", () => {
  it("retains unknown statuses alongside later known terminal history with raw escaped context", () => {
    const m = model([
      run({ id: "unknown", status: "paused-for-review" as never }),
      run({
        id: "finished",
        status: "succeeded",
        finished_at: "2026-10-27T00:00:00Z",
      }),
    ]);
    expect(m.entities).toHaveLength(2);
    const unknown = m.entities.find((e) => e.runId === "unknown")!;
    expect(unknown.label).toBe("Status unavailable");
    expect(unknown.detail).toContain("paused-for-review");
    expect(unknown.variant).toBeUndefined();
  });
  it("preserves conflicting cross-package run identities as neutral source rows", () => {
    const a = view({ runs: [run()] });
    const b = view(
      { runs: [run({ package_id: "WP-2", status: "succeeded" })] },
      { id: "WP-2" },
    );
    const m = projectFloor({
      packages: [a.package, b.package],
      views: new Map([
        [a.package.id, a],
        [b.package.id, b],
      ]),
      office: [],
      page,
    });
    expect(m.entities).toHaveLength(2);
    expect(new Set(m.entities.map((e) => e.id)).size).toBe(2);
    expect(m.entities.every((e) => e.label === "Status unavailable")).toBe(
      true,
    );
    expect(m.warnings.join(" ")).toContain("R1");
  });
  it.each([
    ["queued", "Queued"],
    ["running", "Working"],
    ["succeeded", "Run finished"],
    ["failed", "Failed"],
    ["lost", "Lost run"],
    ["stopped", "Stopped"],
  ] as const)("maps %s without inventing acceptance", (status, label) =>
    expect(model([run({ status })]).entities[0]?.label).toBe(label),
  );
  it("does not accept a succeeded checker", () =>
    expect(
      model([run({ role: "pre-check", status: "succeeded" })]).entities[0]
        ?.label,
    ).toBe("Pre-check run finished"));
  it("prioritizes stopping and waiting", () => {
    expect(model([run({ stop_requested_at: "now" })]).entities[0]?.label).toBe(
      "Stopping",
    );
    expect(
      model([run({ status: "queued", waiting_reason: "Needs a key" })])
        .entities[0]?.detail,
    ).toBe("Needs a key");
  });
  it("keeps active rounds but only latest terminal per role", () => {
    const m = model([
      run(),
      run({ id: "R2", round: 2 }),
      run({ id: "old", status: "failed", finished_at: "2026-10-25" }),
      run({ id: "new", status: "succeeded", finished_at: "2026-10-26" }),
    ]);
    expect(m.entities.map((e) => e.id).sort()).toEqual([
      "run:R1",
      "run:R2",
      "run:new",
    ]);
  });
  it("omits stale views rather than showing accepted work", () => {
    const m = projectFloor({
      packages: [pkg({ revision: 1, status: "accepted" })],
      views: new Map([["WP-0001", view({ runs: [run()] })]]),
      office: [],
      page: { ...page, filter: "all" },
    });
    expect(m.entities).toHaveLength(0);
    expect(m.revisionConflicts).toEqual(["WP-0001"]);
  });
  it("joins matching acceptance with findings without treating workers as approvers", () => {
    const v = view(
      {
        decisions: [
          {
            kind: "accept-with-findings",
            package_id: "WP-0001",
            package_revision: 0,
          } as never,
        ],
      },
      { status: "accepted" },
    );
    const m = projectFloor({
      packages: [v.package],
      views: new Map([[v.package.id, v]]),
      office: [],
      page: { ...page, filter: "all" },
    });
    expect(m.entities[0]?.label).toBe("Accepted with findings");
    expect(m.entities[0]?.kind).toBe("package");
  });
  it("does not borrow acceptance annotations from a different package", () => {
    const v = view(
      {
        decisions: [
          {
            kind: "accept-with-findings",
            package_id: "WP-else",
            package_revision: 0,
          } as never,
        ],
      },
      { status: "accepted" },
    );
    expect(
      projectFloor({
        packages: [v.package],
        views: new Map([[v.package.id, v]]),
        office: [],
        page: { ...page, filter: "all" },
      }).entities[0]?.label,
    ).toBe("Accepted");
  });
  it("compares terminal timestamps as instants, not lexicographic local times", () => {
    const m = model([
      run({
        id: "earlier",
        status: "failed",
        finished_at: "2026-10-26T13:00:00+02:00",
      }),
      run({
        id: "later",
        status: "succeeded",
        finished_at: "2026-10-26T12:00:00Z",
      }),
    ]);
    expect(m.entities.map((e) => e.id)).toEqual(["run:later"]);
  });
  it("does not treat object-key ordering as conflicting work", () => {
    const original = run();
    const reordered = Object.fromEntries(
      Object.entries(original).reverse(),
    ) as Run;
    expect(model([original, reordered]).entities[0]?.label).toBe("Working");
  });
  it("separates office requests and coalesces duplicate runs", () => {
    const m = model(
      [run(), run()],
      [
        {
          kind: "permission",
          package_id: "WP-0001",
          package_revision: 0,
          title: "Key needed",
          detail: "Waiting for owner",
          since: "now",
        },
      ],
    );
    expect(m.entities).toHaveLength(2);
    expect(m.entities.find((e) => e.kind === "request")?.station).toBe(
      "office",
    );
  });
  it("keeps conflicting and unknown statuses visible as neutral", () => {
    expect(model([run(), run({ status: "failed" })]).entities[0]?.label).toBe(
      "Status unavailable",
    );
    expect(model([run({ status: "future" as never })]).entities[0]?.label).toBe(
      "Status unavailable",
    );
  });
  it("is stable under reordering and supports UTF-8 identifiers", () => {
    expect(model([run({ id: "B" }), run({ id: "A" })]).entities).toEqual(
      model([run({ id: "A" }), run({ id: "B" })]).entities,
    );
    expect(variantForRun("R1")).toBe(4);
    expect(variantForRun("🪸")).toBeGreaterThanOrEqual(0);
  });
  it("pages all packages and clamps a shrinking collection", () => {
    const pkgs = Array.from({ length: 31 }, (_, i) =>
      pkg({ id: `WP-${String(i).padStart(3, "0")}` }),
    );
    expect(
      selectPackagePage(pkgs, { ...page, index: 1 }).items.map((p) => p.id),
    ).toEqual(["WP-030"]);
    expect(
      selectPackagePage(pkgs.slice(0, 2), { ...page, index: 9 }).index,
    ).toBe(0);
  });
  it("retains overflow in the list and stays inside stations", () => {
    const entities = Array.from({ length: 7 }, (_, i) => ({
      ...model([run()]).entities[0]!,
      id: `run:${i}`,
    })) as FloorEntity[];
    const l = layoutEntities(entities);
    expect(l.placed).toHaveLength(6);
    expect(l.overflow.site).toHaveLength(1);
    for (const p of l.placed) {
      expect(p.x).toBeGreaterThan(340);
      expect(p.x).toBeLessThan(660);
      expect(p.y).toBeLessThan(260);
    }
  });
  it("does not invent pre-package capture agents or past-revision runs", () =>
    expect(
      model([run({ package_id: "CAP-1" }), run({ package_revision: 8 })])
        .entities,
    ).toHaveLength(0));
});
