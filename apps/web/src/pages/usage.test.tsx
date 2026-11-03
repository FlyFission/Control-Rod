import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { Usage } from "./Usage.js";

/** Usage: budgets and the usage ledger (plan task 5.2; specification 26, WB-21). */

const metrics = { packages_accepted: 0, first_pass_accepted: 0, findings_caught_before_review: 0, median_review_minutes: null, median_minutes_to_done: null, quick_answers: 0 };
const budget = (id: string, over: Record<string, unknown>) => ({
  budget: { id, org_id: "org_local", scope: "organization", scope_id: "org_local", mode: "hard-cap", limit: { value: "60", unit: "minute" }, period: "P1D", status: "active", ...over },
  used: 50, in_flight: 45, unreported_runs: 0, since: new Date().toISOString(), state: "near",
});

describe("Usage", () => {
  it("shows each budget's use this window, what open runs hold, and a budget whose unit is not reported as not reported", async () => {
    server.use(
      http.get("*/metrics", () => HttpResponse.json(metrics)),
      http.get("*/usage", () => HttpResponse.json({
        budgets: [
          budget("bud_1", {}),
          { ...budget("bud_2", { mode: "track", limit: { value: "50", unit: "USD" }, period: "P1M" }), used: null, in_flight: 0, state: "not-reported" },
          { ...budget("bud_3", { scope: "agent", scope_id: "author-claude", mode: "alert", limit: { value: "1000", unit: "token" } }), used: 1500, in_flight: 0, state: "over" },
        ],
        records: [
          { id: "use_1", run_id: "R-1", source: "measured", wall_time: { value: "12.50", unit: "minute" }, recorded_at: new Date().toISOString(), package_id: "WP-1", role: "author", runtime: "claude", baseline: "author-claude" },
          { id: "use_2", run_id: "R-1", source: "reported", input_tokens: { value: "1200" }, output_tokens: { value: "300" }, recorded_at: new Date().toISOString(), package_id: "WP-1", role: "author", runtime: "claude", baseline: "author-claude" },
        ],
        telemetry: [{ runtime: "claude", runs: 3, reported: 3 }, { runtime: "codex", runs: 2, reported: 0 }],
        near_share: 0.8,
      })),
    );
    await renderPage(<Usage />);
    const budgets = await screen.findByRole("region", { name: "Budgets" });
    const one = await within(budgets).findByRole("row", { name: /bud_1/ });
    expect(one.textContent).toContain("50.00 of 60 minutes of run time in P1D");
    expect(one.textContent).toContain("including 45.00 held for runs not yet settled");
    expect(one.textContent).toContain("Near its limit (80% or more used)");
    expect(one.textContent).toContain("Hard cap");
    const two = within(budgets).getByRole("row", { name: /bud_2/ });
    expect(two.textContent).toContain("Not reported: no runtime here reports USD");
    expect(two.textContent).toContain("Use not known");
    expect(two.textContent).not.toContain("0.00");
    expect(within(budgets).getByRole("row", { name: /bud_3/ }).textContent).toContain("Agent author-claude");
    const ledger = screen.getByRole("region", { name: "Usage ledger" });
    expect(ledger.textContent).toContain("codex: none of its 2 finished runs reported tokens, so its token use is not known");
    expect(ledger.textContent).toContain("12.50 minutes of run time, measured");
    expect(ledger.textContent).toContain("1200 tokens in, 300 out, as the runtime reported");
  });

  it("says nothing is called near when the policy draws no line, and shows partial token use as at least", async () => {
    server.use(
      http.get("*/metrics", () => HttpResponse.json(metrics)),
      http.get("*/usage", () => HttpResponse.json({
        budgets: [{ ...budget("bud_4", { mode: "alert", limit: { value: "1000000", unit: "token" } }), used: 1500, in_flight: 0, unreported_runs: 2, state: "partial" }],
        records: [], telemetry: [], near_share: null,
      })),
    );
    await renderPage(<Usage />);
    expect(await screen.findByText("No budget is called near its limit: the approved policy does not set the line (budget_near_percent).")).toBeTruthy();
    const row = screen.getByRole("row", { name: /bud_4/ });
    expect(row.textContent).toContain("At least 1500.00 of 1000000 tokens in P1D");
    expect(row.textContent).toContain("2 finished runs reported none, so the total is not known");
    expect(row.textContent).toContain("Not fully reported");
  });

  it("says when no budget is set, and never shows a failed load as empty", async () => {
    server.use(
      http.get("*/metrics", () => HttpResponse.json(metrics)),
      http.get("*/usage", () => HttpResponse.json({ budgets: [], records: [], telemetry: [], near_share: 0.8 })),
    );
    const { unmount } = await renderPage(<Usage />);
    expect(await screen.findByText("No budget is set. Set one under Policies with policy authority.")).toBeTruthy();
    unmount();
    server.use(http.get("*/usage", () => HttpResponse.json({ code: "boom", message: "down" }, { status: 500 })));
    await renderPage(<Usage />);
    expect(await screen.findByText("Budgets could not be loaded.")).toBeTruthy();
    expect(screen.queryByText(/No budget is set/)).toBeNull();
  });
});
