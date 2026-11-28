import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
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
  it("Snapshots shows no unbuilt fan-out controls and runs a checkpoint and a freeze", async () => {
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
    expect(screen.getByRole("heading", { name: "Snapshots" })).toBeTruthy();
    expect(screen.queryByText(/Cycle 2/i)).toBeNull();
    expect(screen.queryByLabelText(/Delivery Mode/i)).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    await user.type(screen.getByLabelText(/Worktree or repository path/i), "/home/flyfission/projects/Control-Rod");
    await user.click(screen.getByRole("button", { name: /Save checkpoint/i }));
    expect(await screen.findByText(/Checkpoint saved at refs\/cr-checkpoints\/explore-cp-1/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /^Freeze$/i }));
    expect(await screen.findByText(/Frozen: deadbeef12345678/i)).toBeTruthy();
  });

  it("Snapshots clears an earlier success when the next action fails (#206)", async () => {
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
      http.post("*/repos/freeze", () => HttpResponse.json({ error: "not a git worktree" }, { status: 400 })),
    );
    await renderPage(<Explore />);
    await user.type(screen.getByLabelText(/Worktree or repository path/i), "/home/flyfission/projects/Control-Rod");
    await user.click(screen.getByRole("button", { name: /Save checkpoint/i }));
    expect(await screen.findByText(/Checkpoint saved at/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /^Freeze$/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/Checkpoint saved at/i)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Today keeps recorded runs available when packages fail and never infers a run from package status", async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      http.get("*/office/figures", () => HttpResponse.json({ figures: [], needs_me: 0, inbox_items: 0, hidden: 0, generated_at: "2026-11-24T09:00:00Z" })),
      http.get("*/inbox", () => HttpResponse.json({ items: [], waiting_on_others: [], digest: { head: 0, lines: [] } })),
      http.get("*/runs/active", () => HttpResponse.json([{
        id: "run-example",
        package_id: "PKG-W3-1",
        title: "Bridge Load Calculation",
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

    expect(await screen.findByText(/In review \(1\)/i)).toBeTruthy();
    expect(await screen.findByRole("link", { name: /Bridge Load Calculation.*run-example/ })).toHaveProperty("hash", "#run-run-example");
    expect(screen.queryByText("API Hardening")).toBeNull();
    expect(screen.queryByText("Settled Calculation")).toBeNull();
  });
});
