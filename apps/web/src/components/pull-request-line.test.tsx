import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PullRequestLine } from "./PullRequestLine.js";

/** The pull request line in words (change record pr-watch). */
const url = "https://github.com/o/r/pull/1";
const opened = (watch?: { state: "open" | "merged" | "closed"; checks: "passing" | "failing" | "pending" | "none" }) => ({
  state: "opened" as const, url, at: "2026-11-28T01:00:00Z",
  ...(watch ? { watch: { ...watch, read_at: "2026-11-28T02:00:00Z" } } : {}),
});

describe("PullRequestLine", () => {
  it("reads as before until GitHub has been read", () => {
    render(<PullRequestLine pr={opened()} />);
    expect(screen.getByRole("status").textContent).toMatch(/^Draft pull request opened: o\/r\/pull\/1$/);
  });

  it("says what GitHub last said, keeps the link, and names when it was checked", () => {
    render(<PullRequestLine pr={opened({ state: "open", checks: "failing" })} />);
    const line = screen.getByRole("status");
    expect(line.textContent).toMatch(/^Pull request open, checks failing \(checked .+\): o\/r\/pull\/1$/);
    expect(screen.getByRole("link").getAttribute("href")).toBe(url);
  });

  it("says merged and closed in plain words", () => {
    const { rerender } = render(<PullRequestLine pr={opened({ state: "merged", checks: "passing" })} />);
    expect(screen.getByRole("status").textContent).toMatch(/^Pull request merged/);
    rerender(<PullRequestLine pr={opened({ state: "closed", checks: "none" })} />);
    expect(screen.getByRole("status").textContent).toMatch(/^Pull request closed without merging/);
  });

  it("shows an address that is not https as text, not a link", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://github.com/o/r/pull/1"]) {
      const { unmount } = render(<PullRequestLine pr={{ ...opened(), url: bad }} />);
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByRole("status").textContent).toContain(bad);
      unmount();
    }
  });
});
