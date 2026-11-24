import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DIFF_LINE_CAP, DiffView } from "./DiffView.js";

const PATCH = `--- a/f.ts
+++ b/f.ts
@@ -1,3 +1,3 @@
 same
-before
+after
 tail
`;

describe("DiffView", () => {
  it("marks added and removed lines by sign and class, with both line numbers", () => {
    render(<DiffView text={PATCH} />);
    const rows = screen.getAllByRole("row").filter((r) => r.getAttribute("data-kind"));
    expect(rows.map((r) => r.getAttribute("data-kind"))).toEqual(["ctx", "del", "add", "ctx"]);
    const del = rows[1]!;
    const add = rows[2]!;
    // The sign is text, so a reader without colour still has it; the screen reader hears the word.
    expect(del.querySelector(".diff-sign")!.textContent).toContain("−");
    expect(add.querySelector(".diff-sign")!.textContent).toContain("+");
    expect(within(del).getByText(/Removed line 2/)).toBeTruthy();
    expect(within(add).getByText(/Added line 2/)).toBeTruthy();
    expect([...del.querySelectorAll(".diff-no")].map((c) => c.textContent)).toEqual(["2", ""]);
    expect([...add.querySelectorAll(".diff-no")].map((c) => c.textContent)).toEqual(["", "2"]);
    expect(screen.getByLabelText("1 files, 1 lines added, 1 lines removed")).toBeTruthy();
  });

  it("falls back to plain text when the text is not a diff", () => {
    const { container } = render(<DiffView text={"hello\nworld"} />);
    expect(container.querySelector("pre.preview-text")!.textContent).toBe("hello\nworld");
  });

  it("draws a long patch in part and shows the rest on request", async () => {
    const body = Array.from({ length: DIFF_LINE_CAP + 40 }, (_, i) => `+line ${i}`).join("\n");
    const text = `--- a/big\n+++ b/big\n@@ -0,0 +1,${DIFF_LINE_CAP + 40} @@\n${body}\n`;
    const { container } = render(<DiffView text={text} />);
    expect(container.querySelectorAll("tr.diff-line")).toHaveLength(DIFF_LINE_CAP);
    await userEvent.setup().click(screen.getByRole("button", { name: /Show all \(40 more lines\)/ }));
    expect(container.querySelectorAll("tr.diff-line")).toHaveLength(DIFF_LINE_CAP + 40);
  });
});
