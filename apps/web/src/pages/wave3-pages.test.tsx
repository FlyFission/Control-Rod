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
];

describe("Wave 3/4 workbench pages", () => {
  it("Explore switches modes and runs Checkpoint and Merkle Freeze against /repos/checkpoint and /repos/freeze", async () => {
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
    const modeSelect = screen.getByLabelText(/Delivery Mode/i);
    await user.selectOptions(modeSelect, "capital-projects");
    expect((modeSelect as HTMLSelectElement).value).toBe("capital-projects");

    await user.type(screen.getByLabelText(/Worktree \/ Repo Path/i), "/home/flyfission/projects/Control-Rod");
    await user.click(screen.getByRole("button", { name: /Capture Checkpoint/i }));
    expect(await screen.findByText(/Checkpoint captured at refs\/cr-checkpoints\/explore-cp-1/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Merkle Freeze/i }));
    expect(await screen.findByText(/Merkle Freeze ready: deadbeef12345678/i)).toBeTruthy();
  });

  it("Compare renders side-by-side candidates and anchors digest review notes", async () => {
    const user = userEvent.setup();
    server.use(http.get("*/packages", () => HttpResponse.json(SAMPLE_PACKAGES)));
    await renderPage(<Compare />);
    expect(await screen.findByText("PKG-W3-1")).toBeTruthy();
    const input = screen.getByPlaceholderText(/Anchor a review note/i);
    await user.type(input, "Verified buckling factor");
    await user.click(screen.getByRole("button", { name: /Anchor Note/i }));
    expect(screen.getByText(/Verified buckling factor/i)).toBeTruthy();
  });

  it("Today groups packages into Needs Your Decision and Active Execution", async () => {
    server.use(http.get("*/packages", () => HttpResponse.json(SAMPLE_PACKAGES)));
    await renderPage(<Today />);
    expect(await screen.findByText(/Needs Your Decision \(1\)/i)).toBeTruthy();
    expect(screen.getByText(/Active Execution \(1\)/i)).toBeTruthy();
    expect(screen.getByText("Bridge Load Calculation")).toBeTruthy();
    expect(screen.getByText("API Hardening")).toBeTruthy();
  });
});
