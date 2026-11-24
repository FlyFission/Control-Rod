import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/render.js";
import { FindingDetail, ScopeDriftNote } from "./FindingDetail.js";

describe("finding detail and scope drift", () => {
  it("shows a finding's location, evidence and fix scope", async () => {
    await renderPage(
      <FindingDetail
        finding={{
          id: "F-001",
          severity: "major",
          text: "Rating has no source",
          evidence: "expected a nameplate citation",
          location: { path: "report.md", line: 3 },
          scope_paths: ["report.md", "docs/"],
        }}
      />,
    );
    expect(screen.getByText("report.md:3")).toBeTruthy();
    expect(screen.getByText(/Evidence: expected a nameplate citation/)).toBeTruthy();
    expect(screen.getByText("docs/")).toBeTruthy();
  });

  it("renders nothing for a finding without detail, or for no drift", async () => {
    const { container } = await renderPage(
      <>
        <FindingDetail finding={{ id: "F-002", severity: "minor", text: "plain" }} />
        <ScopeDriftNote drift={undefined} />
        <ScopeDriftNote drift={{ round: 2, scope_paths: ["a.md"], outside: [] }} />
      </>,
    );
    expect(container.textContent).toBe("");
  });

  it("names the files changed outside the fix scope", async () => {
    await renderPage(<ScopeDriftNote drift={{ round: 2, scope_paths: ["report.md"], outside: ["notes.md"] }} />);
    expect(screen.getByRole("status").textContent).toContain("Round 2 also changed files outside the fix scope");
    expect(screen.getByText("notes.md")).toBeTruthy();
  });
});
