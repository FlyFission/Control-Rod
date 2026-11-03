import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { DIGEST, view } from "../../test/fixtures.js";
import { preparationViewFixture } from "./test-fixtures.js";
import { CriterionCoverage } from "./CriterionCoverage.js";
it("shows reported criterion outcomes and retained checker evidence separately from mapped intent", async () => {
  const p = preparationViewFixture();
  server.use(
    http.get("*/packages/:id/preparation", () => HttpResponse.json(p)),
  );
  await renderPage(
    <CriterionCoverage
      view={view({
        preparation_enrolled: true,
        preparation_verification_complete: true,
        criterion_results_run_id: "CHECKER-1",
        criterion_results_integrity: "intact",
        criterion_results: {
          package_id: "WP-0001",
          package_revision: 0,
          release_manifest_digest: DIGEST,
          verification_record_digest: DIGEST,
          results: [
            {
              criterion_id: "C1",
              outcome: "pass",
              finding_refs: [],
              check_results: [
                {
                  check_id: "V1",
                  outcome: "pass",
                  evidence_refs: ["checker:checks.md"],
                },
              ],
            },
          ],
        },
      })}
    />,
  );
  expect(
    await screen.findByRole("heading", { name: "Verification by criterion" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "checks.md" }).getAttribute("href"),
  ).toContain("/verification-evidence/CHECKER-1/checks.md");
  expect(screen.getByText(/Reported outcomes/)).toBeTruthy();
});
it("makes altered evidence visible and blocks the acceptance claim", async () => {
  await renderPage(
    <CriterionCoverage
      view={view({
        preparation_enrolled: true,
        preparation_verification_complete: false,
        criterion_results_integrity: "changed",
      })}
    />,
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain(
    "Acceptance is blocked",
  );
});

it("reports altered author deliverables independently of checker evidence", async () => {
  await renderPage(
    <CriterionCoverage
      view={view({
        preparation_enrolled: true,
        deliverable_integrity: "changed",
      })}
    />,
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain(
    "Author deliverables changed",
  );
});
