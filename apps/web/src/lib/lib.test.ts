import { describe, expect, it } from "vitest";
import type { OfficeItem } from "../api/types.js";
import { pkg } from "../test/fixtures.js";
import { boardColumn, groupBoard } from "./board.js";
import { availableDecisions, decisionLabel } from "./decide.js";
import { composeCapture, splitAttachments } from "./attachments.js";
import { sortOffice } from "./office.js";
import { layoutFloor } from "./floor.js";
import { view } from "../test/fixtures.js";
import { api } from "../api/client.js";

describe("board mapping", () => {
  it("maps each status to its work step", () => {
    expect(boardColumn(pkg({ status: "draft" }), false)).toBe("ready");
    expect(boardColumn(pkg({ status: "released" }), false)).toBe("drafting");
    expect(boardColumn(pkg({ status: "in-work" }), false)).toBe("drafting");
    expect(boardColumn(pkg({ status: "in-verification" }), false)).toBe("agent-check");
    expect(boardColumn(pkg({ status: "in-verification" }), true)).toBe("needs-signature");
    expect(boardColumn(pkg({ status: "accepted" }), false)).toBe("reached");
    expect(boardColumn(pkg({ status: "closed" }), false)).toBeNull();
  });

  it("uses the office to tell a finished pre-check apart", () => {
    const a = pkg({ id: "A", status: "in-verification", revision: 2 });
    const b = pkg({ id: "B", status: "in-verification" });
    const office: OfficeItem[] = [
      { kind: "accept", package_id: "A", package_revision: 2, title: "t", detail: "d", since: "2026-10-22T10:00:00Z" },
      // An accept item for an older revision does not count.
      { kind: "accept", package_id: "B", package_revision: 5, title: "t", detail: "d", since: "2026-10-22T10:00:00Z" },
    ];
    const g = groupBoard([a, b], office);
    expect(g["needs-signature"].map((p) => p.id)).toEqual(["A"]);
    expect(g["agent-check"].map((p) => p.id)).toEqual(["B"]);
  });
});

describe("office sorting", () => {
  it("puts holds on agents first, then disputes, accepts and releases, oldest first", () => {
    const item = (kind: OfficeItem["kind"], id: string, since: string): OfficeItem => ({
      kind,
      package_id: id,
      package_revision: 0,
      title: id,
      detail: "",
      since,
    });
    const sorted = sortOffice([
      item("release", "r1", "2026-10-22T09:00:00Z"),
      item("accept", "a2", "2026-10-22T11:00:00Z"),
      item("accept", "a1", "2026-10-22T08:00:00Z"),
      item("dispute", "d1", "2026-10-22T12:00:00Z"),
      item("permission", "p1", "2026-10-22T13:00:00Z"),
    ]);
    expect(sorted.map((o) => o.package_id)).toEqual(["p1", "d1", "a1", "a2", "r1"]);
  });
});

describe("decisions offered", () => {
  it("matches the package state and the pre-check outcome", () => {
    expect(availableDecisions("draft", false)).toEqual(["release", "reject"]);
    expect(availableDecisions("in-verification", false)).toEqual(["return", "reject"]);
    expect(availableDecisions("in-verification", true, "pass")).toEqual(["accept", "return", "reject"]);
    expect(availableDecisions("in-verification", true, "fail")).toEqual(["accept-with-findings", "return", "reject"]);
    expect(availableDecisions("accepted", true, "pass")).toEqual([]);
  });
});

describe("attachments", () => {
  it("composes the fence the control plane extracts and splits it back for display", () => {
    const text = composeCapture("Site a facility for this project.", [
      { name: "parcel.kml", base64: "PD94bWwg" },
      { name: 'odd"name.pdf', base64: "JVBERi0x" },
    ]);
    expect(text).toBe(
      'Site a facility for this project.\n\n```attachment name="parcel.kml" encoding="base64"\nPD94bWwg\n```\n\n```attachment name="odd_name.pdf" encoding="base64"\nJVBERi0x\n```',
    );
    expect(splitAttachments(text)).toEqual({
      text: "Site a facility for this project.",
      files: ["parcel.kml", "odd_name.pdf"],
    });
  });

  it("allows a file with no typed text", () => {
    expect(composeCapture("  ", [{ name: "a.geojson", base64: "e30=" }])).toBe(
      '```attachment name="a.geojson" encoding="base64"\ne30=\n```',
    );
  });
});

describe("decision labels", () => {
  it("calls acceptance of a parcel package Confirm boundary", () => {
    expect(decisionLabel("accept", "site-parcel")).toBe("Confirm boundary");
    expect(decisionLabel("accept", "site-layout")).toBe("Accept");
    expect(decisionLabel("return", "site-parcel")).toBe("Return with direction");
  });
});

describe("floor layout", () => {
  it("seats site roles in the Site and civil set even outside Capital Projects mode", () => {
    const v = view(
      {
        runs: [
          {
            schema_version: "0.1.0",
            id: "r9",
            package_id: "WP-0001",
            package_revision: 0,
            role: "author",
            agent_baseline: "site-parcel",
            runtime: { kind: "subscription", provider: "claude", model: "m" },
            round: 1,
            status: "running",
            queued_at: "2026-10-22T10:00:00Z",
          },
        ],
      },
      { mode: "general", agent_assignment: [{ role: "site-parcel", agent_baseline: "site-parcel", baseline_revision: 1 }] },
    );
    expect(layoutFloor([v], [])[0]?.room).toBe("site");
  });

  it("puts pre-checks in the verification bay, queued runs on the bench and office items in your office", () => {
    const run = (id: string, role: "author" | "pre-check", status: "running" | "queued" | "succeeded") => ({
      schema_version: "0.1.0" as const,
      id,
      package_id: "WP-0001",
      package_revision: 0,
      role,
      agent_baseline: "b",
      runtime: { kind: "subscription" as const, provider: "claude", model: "m" },
      round: 1,
      status,
      queued_at: "2026-10-22T10:00:00Z",
    });
    const v = view({ runs: [run("r1", "author", "running"), run("r2", "pre-check", "running"), run("r3", "author", "queued"), run("r4", "author", "succeeded")] });
    const figs = layoutFloor([v], [
      { kind: "accept", package_id: "WP-0002", package_revision: 0, title: "t", detail: "", since: "2026-10-22T10:00:00Z" },
    ]);
    expect(figs.map((f) => [f.id, f.room])).toEqual([
      ["run:r1", "site"],
      ["run:r2", "verify"],
      ["run:r3", "bench"],
      ["office:accept:WP-0002:0", "office"],
    ]);
  });
});

describe("output links", () => {
  it("keeps the folders of an output's path and encodes each part", () => {
    expect(api.outputUrl("WP-1", "reports/summary 1.md")).toMatch(/\/packages\/WP-1\/outputs\/reports\/summary%201\.md$/);
  });
});
