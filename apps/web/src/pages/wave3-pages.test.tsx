import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { Compare } from "./Compare.js";
import { Explore } from "./Explore.js";
import { Today } from "./Today.js";

const SAMPLE_PACKAGES = [
  {
    schema_version: "0.1.0",
    id: "PKG-W3-1",
    revision: 2,
    title: "Bridge Load Calculation",
    project: "CapitalBridge",
    mode: "capital-projects",
    grade: "safety",
    status: "in-verification",
  },
  {
    schema_version: "0.1.0",
    id: "PKG-W3-2",
    revision: 1,
    title: "API Hardening",
    project: "Control-Rod",
    mode: "software",
    grade: "general-service",
    status: "in-work",
  },
  {
    schema_version: "0.1.0",
    id: "PKG-W3-3",
    revision: 3,
    title: "Settled Calculation",
    project: "CapitalBridge",
    mode: "capital-projects",
    grade: "safety",
    status: "accepted",
  },
];

describe("Wave 3/4 workbench pages", () => {
  it("Explore disables Cycle 2 multi-CLI fan-out controls and runs Checkpoint and Merkle Freeze", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/repos/checkpoint", () =>
        HttpResponse.json({
          ok: true,
          ref: "refs/cr-checkpoints/explore-cp-1",
          commit_sha: "cafebabe1234567890",
          tree_sha: "fedcba9876543210",
        }),
      ),
      http.post("*/repos/freeze", () =>
        HttpResponse.json({
          ok: true,
          checkpoint_ref: "refs/cr-checkpoints/explore-1",
          commit_sha: "abc1234567890",
          tree_sha: "def1234567890",
          manifest_digest: "deadbeef1234567890abcdef",
          file_count: 14,
        }),
      ),
    );
    await renderPage(<Explore />);
    expect(screen.getByRole("heading", { name: "Explore" })).toBeTruthy();
    expect(screen.getByText(/Multi-CLI fan-out coming in Cycle 2/i)).toBeTruthy();
    expect((screen.getByLabelText(/Delivery Mode/i) as HTMLSelectElement).disabled).toBe(true);

    await user.type(screen.getByLabelText(/Worktree \/ Repo Path/i), "/home/flyfission/projects/Control-Rod");
    await user.click(screen.getByRole("button", { name: /Capture Checkpoint/i }));
    expect(await screen.findByText(/Checkpoint captured at refs\/cr-checkpoints\/explore-cp-1/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Merkle Freeze/i }));
    expect(await screen.findByText(/Merkle Freeze ready: deadbeef12345678/i)).toBeTruthy();
  });

  it("Compare renders side-by-side candidates, adds temporary local notes, and shows retry on error", async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      http.get("*/packages", () =>
        fail
          ? HttpResponse.json({ code: "error", message: "Packages unavailable" }, { status: 500 })
          : HttpResponse.json(SAMPLE_PACKAGES),
      ),
    );
    await renderPage(<Compare />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Packages unavailable/i)).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole("button", { name: /Try again/i }));

    expect(await screen.findByText("PKG-W3-1")).toBeTruthy();
    const input = screen.getByPlaceholderText(/Add a temporary local note/i);
    await user.type(input, "Verified buckling factor");
    await user.click(screen.getByRole("button", { name: /Add Local Note/i }));
    expect(screen.getByText(/Verified buckling factor/i)).toBeTruthy();
    expect(screen.getByText("PKG-W3-1@r2")).toBeTruthy();
  });

  it("Today keeps recorded runs available when packages fail and never infers a run from package status", async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      http.get("*/runs", () => HttpResponse.json([{
        id: "run-example",
        package_id: "PKG-W3-1",
        role: "pre-check",
        status: "running",
        runtime: { provider: "codex" },
      }])),
      http.get("*/packages", () =>
        fail
          ? HttpResponse.json({ code: "error", message: "Backend offline" }, { status: 500 })
          : HttpResponse.json(SAMPLE_PACKAGES),
      ),
    );
    await renderPage(<Today />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Backend offline/i)).toBeTruthy();
    expect(await screen.findByRole("link", { name: /run-example/ })).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole("button", { name: /Try again/i }));

    expect(await screen.findByText(/Needs Your Decision \(1\)/i)).toBeTruthy();
    expect(await screen.findByRole("link", { name: /Bridge Load Calculation.*run-example/ })).toHaveProperty("hash", "#run-run-example");
    expect(screen.queryByText("API Hardening")).toBeNull();
    expect(screen.queryByText("Settled Calculation")).toBeNull();
  });
});
