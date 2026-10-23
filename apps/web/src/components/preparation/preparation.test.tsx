import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { pkg, DIGEST } from "../../test/fixtures.js";
import { PreparationPanel } from "./PreparationPanel.js";
import type { PreparationView } from "../../api/types.js";
function fixture(): PreparationView {
  const p = pkg();
  return {
    snapshot: {
      schema_version: "0.1.0",
      id: "P1",
      package_id: p.id,
      package_revision: 0,
      revision: 0,
      created_by: { kind: "human", id: "owner" },
      created_at: "2026-10-23T00:00:00Z",
      request_kind: "general",
      package_contract: {
        mode: p.mode,
        objective: p.objective,
        deliverables: p.deliverables,
        design_inputs: [],
        rigor_mode: p.rigor_mode,
        data_lane: p.data_lane,
        verification: p.verification,
      },
      requirements: [
        {
          id: "R1",
          statement: "Need report",
          source_refs: [],
          journey_or_repro_refs: [],
        },
      ],
      criteria: [
        {
          id: "C1",
          statement: p.acceptance_criteria[0]!,
          requirement_ids: ["R1"],
          verification_check_ids: [],
        },
      ],
      context: { problem: "Saved need" },
      questions: [],
      resolutions: [],
      escalations: [],
      basis: [],
      technical_plan: {
        summary: "",
        current_state_refs: [],
        design_elements: [],
        alternatives: [],
        tasks: [],
        checks: [],
        rollout: "",
        risks: [],
      },
    },
    content_digest: DIGEST,
    requirements_digest: DIGEST,
    confirmed: false,
    readiness: "blocked",
    blockers: [
      { code: "open-item", message: "Supply input", owner: "Requester" },
    ],
    change_summary: "Enrolled",
  };
}
describe("manual preparation workbench", () => {
  it("shows stored context, requirement status and blocker ownership; saves with the loaded ETag", async () => {
    const current = fixture();
    let saved: unknown;
    let match: string | null = null;
    server.use(
      http.get("*/packages/:id/preparation", () => HttpResponse.json(current)),
      http.put("*/packages/:id/preparation", async ({ request }) => {
        saved = await request.json();
        match = request.headers.get("if-match");
        return HttpResponse.json({
          ...current,
          snapshot: { ...current.snapshot, revision: 1 },
        });
      }),
    );
    await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled />);
    const user = userEvent.setup();
    const problem = await screen.findByRole("textbox", {
      name: "Problem or need",
    });
    expect((problem as HTMLTextAreaElement).value).toBe("Saved need");
    expect(screen.getByText(/Requester.*Supply input/)).toBeTruthy();
    expect(screen.getByText(/Requirements not confirmed/)).toBeTruthy();
    await user.clear(problem);
    await user.type(problem, "Updated need");
    await user.click(screen.getByRole("button", { name: "Save preparation" }));
    await waitFor(() =>
      expect(saved).toMatchObject({ context: { problem: "Updated need" } }),
    );
    expect(match).toBe(`"${DIGEST.value}"`);
  });
  it("keeps unsaved work on conflict and offers explicit reload instead of merging", async () => {
    const current = fixture();
    server.use(
      http.get("*/packages/:id/preparation", () => HttpResponse.json(current)),
      http.put("*/packages/:id/preparation", () =>
        HttpResponse.json(
          {
            code: "stale",
            message: "Preparation changed. Reload and compare.",
          },
          { status: 409 },
        ),
      ),
    );
    await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled />);
    const user = userEvent.setup();
    const problem = await screen.findByRole("textbox", {
      name: "Problem or need",
    });
    await user.clear(problem);
    await user.type(problem, "Keep local work");
    await user.click(screen.getByRole("button", { name: "Save preparation" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Preparation changed",
    );
    expect((problem as HTMLTextAreaElement).value).toBe("Keep local work");
    expect(
      screen.getByRole("button", { name: "Reload saved preparation" }),
    ).toBeTruthy();
  });
  it("enrollment is explicit and absent when disabled", async () => {
    const rendered = await renderPage(
      <PreparationPanel pkg={pkg()} enabled={false} enrolled={false} />,
    );
    expect(
      screen.queryByRole("button", { name: "Start guided preparation" }),
    ).toBeNull();
    rendered.unmount();
    await renderPage(<PreparationPanel pkg={pkg()} enabled enrolled={false} />);
    expect(
      screen.getByRole("button", { name: "Start guided preparation" }),
    ).toBeTruthy();
  });
});
