import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { pkg, view } from "../../test/fixtures.js";
import type { Run } from "../../api/types.js";
import { Card } from "./Card.js";
import { BoardReviewDrawer } from "./BoardReviewDrawer.js";
import { runLine } from "../../lib/next.js";
import { latestProviders } from "./useBoardData.js";
import { elapsedText } from "../../lib/format.js";

const DIFF = "--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,2 @@\n keep\n-old\n+new\n";
const digest = (c: string) => ({ algorithm: "sha256" as const, value: c.repeat(64) });
const run = (over: Partial<Run>): Run =>
  ({ id: "R-1", package_id: "WP-1", package_revision: 0, role: "author", agent_baseline: "a", runtime: { kind: "local", provider: "claude", model: "m" }, round: 1, status: "succeeded", queued_at: "2026-11-24T09:00:00Z", ...over }) as Run;

function serve(over: Parameters<typeof view>[0] = {}) {
  server.use(
    http.get("*/admin", () => HttpResponse.json({ members: [], registry: { qualifications: [] }, projects: [] })),
    http.get("*/packages/:id/actions", () => HttpResponse.json([{ command: "accept", label: "Accept", allowed: true, signature: "direct" }])),
    http.get("*/packages/:id/person-verifications", () => HttpResponse.json([])),
    http.get("*/packages/:id/outputs/*", () => new HttpResponse(DIFF, { headers: { "Content-Type": "text/plain" } })),
    http.get("*/packages/:id", () =>
      HttpResponse.json({
        ...view({ outputs: [{ path: "notes/a.md", digest: digest("a") }, { path: "patches/x.diff", digest: digest("b") }], runs: [run({})], pre_check: { outcome: "pass", verifier: "v", method: "m", findings: [] } as never, ...over }, { id: "WP-1", title: "Cockpit", status: "in-verification" }),
      }),
    ),
  );
}
afterEach(() => window.localStorage.clear());

describe("the drawer as a cockpit", () => {
  it("is one layout with no tabs: status, run log, outputs and the decision bar, in that order", async () => {
    serve();
    await renderPage(<BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => {}} />);
    const drawer = await screen.findByRole("complementary", { name: "Review WP-1" });
    expect(within(drawer).queryByRole("tablist")).toBeNull();
    expect(within(drawer).queryByRole("tab")).toBeNull();
    const status = await within(drawer).findByLabelText("Status");
    const log = within(drawer).getByRole("region", { name: /Run log/ });
    const outputs = within(drawer).getByRole("region", { name: /Outputs/ });
    const decision = await within(drawer).findByRole("region", { name: "Your decision" });
    const after = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(status, log)).toBe(true);
    expect(after(log, outputs)).toBe(true);
    expect(after(outputs, decision)).toBe(true);
    // The decision bar sits in the drawer's foot, outside the scrolling body, so it never scrolls away.
    expect(decision.closest(".bd-drawer-foot")).toBeTruthy();
    expect(decision.closest(".bd-cockpit-main")).toBeNull();
    // The facts a decision rests on are in the strip.
    expect(within(status).getByRole("group", { name: "Custody chain" })).toBeTruthy();
    expect(within(status).getByRole("button", { name: /3?\s*criteri/ })).toBeTruthy();
    expect(within(status).getByText("pass")).toBeTruthy();
    expect(within(status).getByRole("group", { name: "Context" })).toBeTruthy();
    expect(within(status).getByRole("combobox", { name: "Workflow" })).toBeTruthy();
  });

  it("opens criteria on demand from the strip and closes them again", async () => {
    serve();
    await renderPage(<BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => {}} />);
    const user = userEvent.setup();
    const btn = await screen.findByRole("button", { name: /criteri/ });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    await user.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(within(screen.getByRole("region", { name: "Details" })).getByText(/Every work item names its owner/)).toBeTruthy();
    await user.click(btn);
    expect(screen.queryByRole("region", { name: "Details" })).toBeNull();
  });

  it("previews a diff output at once, as a unified diff, and lets another output be chosen", async () => {
    serve();
    await renderPage(<BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => {}} />);
    const outputs = await screen.findByRole("region", { name: /Outputs/ });
    // The diff is chosen first although the markdown is listed first.
    const diffBtn = await within(outputs).findByRole("button", { name: /patches\/x\.diff/ });
    expect(diffBtn.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(within(outputs).getByTestId("diff-view")).toBeTruthy());
    expect(within(outputs).getByText(/Added line 2/)).toBeTruthy();
    expect(within(outputs).getByText(/Removed line 2/)).toBeTruthy();
    const mdBtn = within(outputs).getByRole("button", { name: /notes\/a\.md/ });
    await userEvent.setup().click(mdBtn);
    expect(mdBtn.getAttribute("aria-pressed")).toBe("true");
    expect(within(outputs).queryByTestId("diff-view")).toBeNull();
  });

  it("closes on Escape", async () => {
    serve();
    let closed = 0;
    await renderPage(<BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => closed++} />);
    await screen.findByRole("complementary", { name: "Review WP-1" });
    await userEvent.setup().keyboard("{Escape}");
    expect(closed).toBe(1);
  });
});

describe("the card's running line", () => {
  it("says what the run is doing from its label, or its role when it has none", () => {
    expect(runLine(run({ status: "running", label: "Writing tests", started_at: "2026-11-24T09:00:00Z" }))).toEqual({ tone: "wait", text: "Writing tests", since: "2026-11-24T09:00:00Z" });
    expect(runLine(run({ status: "running", started_at: "2026-11-24T09:00:00Z" })).text).toBe("Author running");
    expect(runLine(run({ status: "running", role: "pre-check" })).text).toBe("Pre-check running");
    // A queued run is waiting, not running: no elapsed time.
    expect(runLine(run({ status: "queued" }))).toEqual({ tone: "wait", text: "Author queued" });
  });

  it("reads elapsed time the way a card says it", () => {
    expect(elapsedText(5_000)).toBe("under 1 min");
    expect(elapsedText(12 * 60_000 + 30_000)).toBe("12 min");
    expect(elapsedText(125 * 60_000)).toBe("2 h 5 min");
    expect(elapsedText(-1)).toBe("under 1 min");
  });

  it("names the author's and checker's runtimes from their latest runs", () => {
    expect(latestProviders([run({ id: "1", queued_at: "2026-11-24T09:00:00Z" }), run({ id: "2", queued_at: "2026-11-24T10:00:00Z", runtime: { kind: "local", provider: "codex", model: "m" } }), run({ id: "3", role: "pre-check", runtime: { kind: "local", provider: "agy", model: "m" } })])).toEqual({ author: "codex", checker: "agy" });
    expect(latestProviders(undefined)).toEqual({});
  });

  it("draws the line, the elapsed time and a progress cue on a running card, and the agents' icons", async () => {
    const started = new Date(Date.now() - 12 * 60_000).toISOString();
    await renderPage(
      <Card pkg={pkg({ id: "WP-9", title: "Running" })} kinds={["code"]} column="drafting" next={{ tone: "wait", text: "Writing tests", since: started }} runRunning author="claude" checker="codex" onOpen={() => {}} />,
    );
    const card = screen.getByRole("article");
    expect(within(card).getByText("Writing tests")).toBeTruthy();
    expect(within(card).getByText("12 min")).toBeTruthy();
    expect(within(card).getByRole("img", { name: "Agent running" })).toBeTruthy();
    expect(within(card).getByText("Author agent claude")).toBeTruthy();
    expect(within(card).getByText("Checker agent codex")).toBeTruthy();
    // The same shared logo set as the workflow diagram and the seats, not a generic glyph.
    expect(card.querySelector("[data-badge='claude'] img[src='/agent-marks/claude.svg']")).not.toBeNull();
    expect(card.querySelector("[data-badge='codex'] img[src='/agent-marks/codex.svg']")).not.toBeNull();
    // A running line is live, so it does not say "Waiting".
    expect(within(card).queryByText(/Waiting/)).toBeNull();
  });

  it("says a running run without a start time is running, not waiting", async () => {
    await renderPage(<Card pkg={pkg({ id: "WP-8", title: "Running" })} kinds={["code"]} column="drafting" next={{ tone: "wait", text: "Pre-check running" }} runRunning onOpen={() => {}} />);
    const card = screen.getByRole("article");
    expect(within(card).getByText("Pre-check running")).toBeTruthy();
    expect(within(card).queryByText(/Waiting/)).toBeNull();
  });
});
