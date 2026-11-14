import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/render.js";
import { CheckerHistory } from "./CheckerHistory.js";

const digest = (value: string) => ({ algorithm: "sha256" as const, value });

describe("checker attempt history", () => {
  it("shows a sticky refusal and every attempt in order, including inconclusive ones", async () => {
    await renderPage(
      <CheckerHistory
        blocked={{
          code: "sticky-fail",
          reason: "A check of this deliverable already failed.",
          change: "Revise the deliverable or sign an override.",
          deliverable_digest: digest("a".repeat(64)),
        }}
        attempts={[
          {
            schema_version: "0.1.0",
            id: "CA-fail",
            package_id: "WP-1",
            package_revision: 0,
            run_id: "R-fail",
            round: 1,
            checker_runtime: "codex",
            reported_model: "codex-a",
            deliverable_digest: digest("a".repeat(64)),
            outcome: "fail",
            counts_as: "fail",
            started_at: "2026-11-14T15:00:00.000Z",
            finished_at: "2026-11-14T15:01:00.000Z",
            evidence: "/packages/WP-1/runs/R-fail/log",
          },
          {
            schema_version: "0.1.0",
            id: "CA-time",
            package_id: "WP-1",
            package_revision: 0,
            run_id: "R-time",
            round: 2,
            checker_runtime: "codex",
            reported_model: "codex-b",
            deliverable_digest: digest("a".repeat(64)),
            outcome: "timeout",
            counts_as: "inconclusive",
            started_at: "2026-11-14T15:02:00.000Z",
            finished_at: "2026-11-14T15:03:00.000Z",
            evidence: "/packages/WP-1/runs/R-time/log",
            recheck_override: {
              by: "ben",
              at: "2026-11-14T15:01:30.000Z",
              reason: "Look once more",
              subject_digest: digest("b".repeat(64)),
              assertion: { credential_id: "k", authenticator_data: "a", client_data_json: "c", signature: "s" },
            },
          },
        ]}
        overrides={[]}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("A check of this deliverable already failed.");
    const items = [...screen.getByRole("list", { name: "Checker attempts" }).querySelectorAll("li")];
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("fail");
    expect(items[1]?.textContent).toContain("timeout");
    expect(items[1]?.textContent).toContain("counts as inconclusive");
    expect(items[1]?.textContent).toContain("Look once more");
    expect(screen.getByRole("link", { name: "/packages/WP-1/runs/R-fail/log" }).getAttribute("href")).toBe("/packages/WP-1/runs/R-fail/log");
  });
});