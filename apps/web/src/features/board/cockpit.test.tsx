import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { pkg, view } from "../../test/fixtures.js";
import type { Run } from "../../api/types.js";
import { Card } from "./Card.js";
import { BoardReviewDrawer, drawerStep, refusalReason, stepKey } from "./BoardReviewDrawer.js";
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

describe("drawerStep and stepKey", () => {
  const v = (over: Parameters<typeof view>[0] = {}) => view({ runs: [], ...over }, { id: "WP-1", status: "in-verification" }) as never;
  it("never makes Send back the primary step unless the check found problems", () => {
    expect(drawerStep(v(), ["return", "reject"], "Needs a second qualified person").action).toBeUndefined();
    expect(drawerStep(v(), ["return"], "Waiting on a person verification").text).toBe("Waiting on a person verification.");
  });
  it("explains why Accept is closed even when Send back and Reject are open", () => {
    // The server lists every decision, Release included, whatever the state.
    const refused = [
      { command: "release", reason: "The work is not in a state this action applies to" },
      { command: "reject", reason: "Not yours" },
      { command: "accept", reason: "A person verification is required", change: "Record a passing person verification" },
    ];
    expect(refusalReason("in-verification", refused)).toBe("A person verification is required. Record a passing person verification.");
    expect(refusalReason("draft", refused)).toBe("The work is not in a state this action applies to");
    expect(refusalReason("in-verification", [{ command: "release", reason: "wrong state" }])).toBeUndefined();
    expect(drawerStep(v({ pre_check: { outcome: "fail", verifier: "v", method: "m", findings: [] } as never }), ["return"], undefined).action).toEqual({ kind: "decide", decision: "return" });
  });
  it("keys a running step by what it offers, not by its changing label", () => {
    const a = drawerStep(v({ runs: [run({ status: "running", label: "Reading files" })] }), [], undefined);
    const b = drawerStep(v({ runs: [run({ status: "running", label: "Writing tests" })] }), [], undefined);
    expect(a.text).not.toBe(b.text);
    expect(stepKey(a)).toBe(stepKey(b));
  });
});

describe("the drawer, calm", () => {
  it("leads with the title, one sentence and one primary step; the rest is folded under Details", async () => {
    serve();
    await renderPage(<BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => {}} />);
    const drawer = await screen.findByRole("complementary", { name: "Review WP-1" });
    expect(await within(drawer).findByRole("heading", { level: 2, name: "Cockpit" })).toBeTruthy();
    expect(await within(drawer).findByText("Ready for your sign-off.")).toBeTruthy();
    expect(await within(drawer).findByRole("button", { name: "Accept" })).toBeTruthy();
    // Nothing else is on the first screen: no custody, switches, digest, run log or output preview.
    expect(within(drawer).queryByRole("group", { name: "Custody chain" })).toBeNull();
    expect(within(drawer).queryByRole("combobox", { name: "Workflow" })).toBeNull();
    expect(within(drawer).queryByText(/sha256:/)).toBeNull();
    expect(within(drawer).queryByRole("button", { name: /patches\/x\.diff/ })).toBeNull();
    const details = within(drawer).getByRole("region", { name: "Details" });
    for (const name of [/What was asked/, /Check result/, /Outputs/, /Agent runs/, /Who and how/, /Signing record/]) {
      expect(within(details).getByRole("button", { name }).getAttribute("aria-expanded")).toBe("false");
    }    // The same words as the board: the column it sits in, versions from 1, agents by name, no "2 of 1 file".
    expect(within(drawer).getByText(/Ready to accept/)).toBeTruthy();
    expect(within(details).queryByText(/Revision \d/)).toBeNull();
    expect(within(details).queryByText(/\d+ of \d+ files?/)).toBeNull();
    expect(within(details).getByText(/writes, .* checks/)).toBeTruthy();
  });

  it("opens one detail at a time, and closes it again", async () => {
    serve();
    await renderPage(<BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => {}} />);
    const user = userEvent.setup();
    const asked = await screen.findByRole("button", { name: /What was asked/ });
    await user.click(asked);
    expect(asked.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Every work item names its owner/)).toBeTruthy();
    const who = screen.getByRole("button", { name: /Who and how/ });
    await user.click(who);
    expect(asked.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("group", { name: "Custody chain" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Workflow" })).toBeTruthy();
    await user.click(who);
    expect(screen.queryByRole("group", { name: "Custody chain" })).toBeNull();
  });

  it("previews a diff output at once under Outputs, as a unified diff, and lets another output be chosen", async () => {
    serve();
    await renderPage(<BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => {}} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: /^.?\s*Outputs/ }));
    const outputs = screen.getByRole("list", { name: "Produced outputs" }).parentElement!;
    // The diff is chosen first although the markdown is listed first.
    const diffBtn = await within(outputs).findByRole("button", { name: /patches\/x\.diff/ });
    expect(diffBtn.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(within(outputs).getByTestId("diff-view")).toBeTruthy());
    expect(within(outputs).getByText(/Added line 2/)).toBeTruthy();
    const mdBtn = within(outputs).getByRole("button", { name: /notes\/a\.md/ });
    await userEvent.setup().click(mdBtn);
    expect(mdBtn.getAttribute("aria-pressed")).toBe("true");
    expect(within(outputs).queryByTestId("diff-view")).toBeNull();
  });

  it("expands an output to the whole panel, titled by the file, and Esc goes back to the card before closing", async () => {
    serve();
    let closed = 0;
    await renderPage(<BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => (closed += 1)} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^.?\s*Outputs/ }));
    await waitFor(() => expect(screen.getByTestId("diff-view")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("x.diff");
    expect(screen.getByText("From Cockpit")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Download" }).getAttribute("download")).toBe("x.diff");
    // The card's details are kept, hidden, under the file.
    expect(screen.queryByRole("button", { name: /^.?\s*Outputs/ })).toBeNull();
    await user.keyboard("{Escape}");
    expect(closed).toBe(0);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Cockpit");
    expect(screen.getByRole("button", { name: /^.?\s*Outputs/ }).getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(closed).toBe(1);
  });

  it("opens a run's full log over the card instead of a pop-up, and can open straight to it", async () => {
    serve();
    server.use(http.get("*/packages/:id/runs/:run/log", () => HttpResponse.json({ lines: ["start", "error: boom", "done"] })));
    await renderPage(<BoardReviewDrawer packageId="WP-1" mode="software" openRunLog="R-1" onClose={() => {}} />);
    expect(await screen.findByRole("heading", { level: 2, name: "Author log, round 1" })).toBeTruthy();
    expect(await screen.findByText("error: boom")).toBeTruthy();
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Only problem lines \(1\)/ })).toBeTruthy();
  });

  it("says a check that could not finish in plain words, offers Run again, and keeps the raw error behind a toggle", async () => {
    const raw = 'Policy: the login directory could not be hashed, so the check cannot count: protected login entry "/x/codex" is over the 20971520 byte limit';
    serve({ runs: [run({}), run({ id: "R-2", role: "pre-check", status: "failed", queued_at: "2026-11-24T09:10:00Z", error: raw })], pre_check: undefined as never });
    let requeued = "";
    server.use(http.post("*/packages/:id/runs/:run/requeue", ({ params }) => ((requeued = String(params.run)), HttpResponse.json(run({ id: "R-3", role: "pre-check", status: "queued" })))));
    await renderPage(<BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => {}} />);
    const user = userEvent.setup();
    expect(await screen.findByText("The check could not finish. Run it again.")).toBeTruthy();
    expect(screen.getByText(/sign-in folder was too large/)).toBeTruthy();
    expect(screen.queryByText(raw)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show technical details" }));
    expect(screen.getByText(raw)).toBeTruthy();
    // Run again is the one primary step; Accept waits until the check has run.
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Run again" }));
    await waitFor(() => expect(requeued).toBe("R-2"));
    // Run history under Details says it plainly too; the raw text stays behind its own toggle, never an alert.
    await user.click(screen.getByRole("button", { name: /Agent runs/ }));
    expect(screen.getAllByText(/sign-in folder was too large/).length).toBeGreaterThan(1);
    expect(screen.queryAllByRole("alert").filter((a) => a.textContent?.includes("20971520"))).toEqual([]);
  });

  it("puts Send back and Reject one click away, and opens the note box focused", async () => {
    serve();
    server.use(
      http.get("*/packages/:id/actions", () =>
        HttpResponse.json([
          { command: "accept", label: "Accept", allowed: true, signature: "direct" },
          { command: "return", label: "Return", allowed: true, signature: "direct" },
          { command: "reject", label: "Reject", allowed: true, signature: "direct" },
        ]),
      ),
    );
    await renderPage(<BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => {}} />);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Accept" });
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    const more = screen.getByRole("button", { name: "Other choices" });
    await user.click(more);
    // The disclosure stays where focus was, says it is open, and the choices follow it in tab order.
    expect(more.isConnected).toBe(true);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Send back with a note" }));
    await user.click(screen.getByRole("button", { name: "Send back with a note" }));
    const box = screen.getByRole("textbox", { name: "What should change in the next revision?" });
    expect(document.activeElement).toBe(box);
    expect(screen.getByRole("button", { name: "Sign: Return with direction" })).toHaveProperty("disabled", false);
  });

  it("says when person verifications could not be read, with a retry, instead of asking for one", async () => {
    let reads = 0;
    serve();
    server.use(
      http.get("*/packages/:id", () => HttpResponse.json(view({ runs: [run({})], pre_check: { outcome: "pass", verifier: "v", method: "m", findings: [] } as never }, { id: "WP-1", title: "Safety work", status: "in-verification", grade: "safety" } as never))),
      http.get("*/packages/:id/actions", () => HttpResponse.json([{ command: "accept", label: "Accept", allowed: true, signature: "direct" }])),
      http.get("*/packages/:id/person-verifications", () => (reads++, new HttpResponse(null, { status: 500 }))),
    );
    await renderPage(<BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => {}} />);
    expect(await screen.findByText("The person verifications could not be read, so Accept is not offered yet.")).toBeTruthy();
    const before = reads;
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(reads).toBeGreaterThan(before));
  });

  it("has the one close button, and closes on a click outside unless a note is being typed", async () => {
    serve();
    server.use(
      http.get("*/packages/:id/actions", () =>
        HttpResponse.json([
          { command: "accept", label: "Accept", allowed: true, signature: "direct" },
          { command: "return", label: "Return", allowed: true, signature: "direct" },
        ]),
      ),
    );
    let closed = 0;
    await renderPage(
      <div>
        <p data-testid="outside">Board</p>
        <BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => closed++} />
      </div>,
    );
    const user = userEvent.setup();
    const drawer = await screen.findByRole("complementary", { name: "Review WP-1" });
    const x = within(drawer).getByRole("button", { name: "Close review drawer" });
    expect(x.className).toBe("close-x");
    await user.click(await within(drawer).findByRole("button", { name: "Other choices" }));
    await user.click(within(drawer).getByRole("button", { name: "Send back with a note" }));
    await user.type(within(drawer).getByRole("textbox"), "half a thought");
    await user.click(screen.getByTestId("outside"));
    expect(closed).toBe(0);
    await user.clear(within(drawer).getByRole("textbox"));
    await user.click(screen.getByTestId("outside"));
    expect(closed).toBe(1);
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
    expect(runLine(run({ status: "running", started_at: "2026-11-24T09:00:00Z" })).text).toBe("Agent working");
    expect(runLine(run({ status: "running", role: "pre-check" })).text).toBe("Being checked");
    // A queued run is waiting, not running: no elapsed time.
    expect(runLine(run({ status: "queued" }))).toEqual({ tone: "wait", text: "Waiting for a free agent" });
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

  it("reads title, next step, then the quiet facts, with no kind chip or owner initials on the face", async () => {
    await renderPage(<Card pkg={pkg({ id: "WP-8", title: "Fix it" })} kinds={["code"]} column="drafting" owner="ben" next={{ tone: "needs", text: "Accept" }} onOpen={() => {}} />);
    const card = screen.getByRole("article");
    const order = [...card.children].map((e) => e.className);
    expect(order.indexOf("bd-next")).toBeLessThan(order.findIndex((c) => c.includes("bd-meta")));
    expect(within(card).queryByText("Code")).toBeNull();
    expect(card.querySelector(".bd-avatar[title^='Owner']")).toBeNull();
    expect(within(card).getByText("Owner ben")).toBeTruthy();
  });

  it("says a running run without a start time is running, not waiting", async () => {
    await renderPage(<Card pkg={pkg({ id: "WP-8", title: "Running" })} kinds={["code"]} column="drafting" next={{ tone: "wait", text: "Being checked" }} runRunning onOpen={() => {}} />);
    const card = screen.getByRole("article");
    expect(within(card).getByText("Being checked")).toBeTruthy();
    expect(within(card).queryByText(/Waiting/)).toBeNull();
  });
});
