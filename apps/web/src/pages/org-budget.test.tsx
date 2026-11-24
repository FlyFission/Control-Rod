import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrgBudget } from "./AgentsRoster.js";

const view = (used: number, unreported: number) =>
  ({
    budgets: [{ budget: { scope: "organization", limit: { value: "1000", unit: "token" }, period: "P1D" }, used, state: "ok", unreported_runs: unreported }],
  }) as never;

describe("OrgBudget", () => {
  it("states what is left exactly when every run reported", () => {
    render(<OrgBudget view={view(400, 0)} failed={false} />);
    expect(screen.getByText("600 tokens left")).toBeTruthy();
  });

  it("calls what is left an upper bound when some runs did not report", () => {
    render(<OrgBudget view={view(400, 2)} failed={false} />);
    expect(screen.getByText("At most 600 tokens left")).toBeTruthy();
  });
});
