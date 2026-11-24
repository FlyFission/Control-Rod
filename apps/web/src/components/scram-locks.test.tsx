import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { type ReactNode, useState } from "react";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { DIGEST, pkg, view } from "../test/fixtures.js";
import type { ActionDescriptor, CaptureView, Run } from "../api/types.js";
import { lockFrom, ScramLockContext } from "../lib/scramLock.js";
import { hydrateServerProjects, selectProject, WorkspaceProjectUser } from "../lib/projects.js";
import { DecisionBar } from "./DecisionBar.js";
import { RunActions } from "./RunLog.js";
import { CardActions } from "../features/board/CardActions.js";
import { CaptureCard } from "../features/board/CaptureCard.js";
import { CaptureDrawer } from "../features/board/CaptureDrawer.js";
import { QuickAdd } from "../features/board/QuickAdd.js";
import { BoardReviewDrawer } from "../features/board/BoardReviewDrawer.js";
import { Shell } from "./Shell.js";
import type { BoardCard } from "../features/board/useBoardData.js";

/** A SCRAM or drill locks every control that changes work (control room redesign, section 6.6), by scope. */

const summary = (scram: object) => ({ scram, run_count: 0, pulled_at: new Date().toISOString() });
const ORG = [summary({ id: "s1", org_id: "o", scope: "organization", reason: "r", pulled_by: "m", drill: false })] as never;
const PROJ = [summary({ id: "s2", org_id: "o", scope: "project", project_id: "p1", reason: "r", pulled_by: "m", drill: false })] as never;
const SCOPES = [
  ["an organization SCRAM", ORG],
  ["a project SCRAM", PROJ],
] as const;

/** Mounts the node under the lock, with project p1 open (what a control without its own project reads). */
function Locked({ scrams, children }: { scrams: never; children: ReactNode }) {
  return (
    <WorkspaceProjectUser.Provider value="ben">
      <ScramLockContext.Provider value={lockFrom(scrams)}>{children}</ScramLockContext.Provider>
    </WorkspaceProjectUser.Provider>
  );
}
function openProject() {
  hydrateServerProjects("ben", [{ id: "p1", name: "Plant A", mode: "software" } as never]);
  selectProject("ben", "p1");
}
afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

const allow = (command: string): ActionDescriptor => ({ command, label: command, allowed: true, signature: "direct" });
const noopPasskeys = { async get() { return {} as never; }, async create() { return {}; } };
const capture = (over: Partial<CaptureView> = {}): CaptureView => ({ schema_version: "0.1.0", id: "C-1", text: "Fix the login redirect", source: "web", created_at: "2026-11-08T10:00:00Z", ...over });
const failedRun: Run = {
  schema_version: "0.1.0", id: "R-lost", package_id: "WP-9", package_revision: 0, role: "author", agent_baseline: "author-claude",
  runtime: { kind: "subscription", provider: "claude", model: "default" }, round: 1, status: "lost", queued_at: "2026-10-22T10:00:00Z", error: "Runner lost.",
} as Run;

describe.each(SCOPES)("under %s", (_name, scrams) => {
  it("disables the decision bar's decisions and its pending Sign button", async () => {
    openProject();
    server.use(
      http.get("*/packages/WP-0001/actions", () => HttpResponse.json([allow("accept"), allow("reject")])),
      http.get("*/packages/WP-0001/person-verifications", () => HttpResponse.json([])),
    );
    const v = view({}, { project: "p1", status: "in-verification", revision: 3 });
    await renderPage(<Locked scrams={scrams}><DecisionBar view={v} passkeys={noopPasskeys} /></Locked>);
    const accept = (await screen.findByRole("button", { name: "Accept" })) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    expect(accept.title).toMatch(/SCRAM is in force/);
    expect((screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables the card's primary button and every decision in its menu", async () => {
    openProject();
    const p = pkg({ id: "WP-7", project: "p1", status: "in-verification", revision: 2 });
    const card = { pkg: p, kinds: ["doc"], column: "needs-signature", next: { tone: "needs", text: "x" }, runActive: false, lastKnown: false, nuclear: false, offered: [allow("accept"), allow("return")], digest: DIGEST } as unknown as BoardCard;
    await renderPage(<Locked scrams={scrams}><CardActions card={card} passkeys={noopPasskeys} /></Locked>);
    const primary = screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement;
    expect(primary.disabled).toBe(true);
    expect(primary.title).toMatch(/SCRAM is in force/);
  });

  it("disables Classify and Retry intake on a capture card, and in its drawer", async () => {
    openProject();
    const unclassified = capture();
    await renderPage(<Locked scrams={scrams}><CaptureCard capture={unclassified} /></Locked>);
    expect((screen.getByRole("button", { name: "Classify" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables Classify and Retry intake in the capture drawer", async () => {
    openProject();
    const failed = capture({ lane: "internal", intake: { run_id: "R-1", status: "failed", error: "x" } as never });
    const { unmount } = await renderPage(<Locked scrams={scrams}><CaptureDrawer capture={failed} onClose={() => {}} /></Locked>);
    expect((screen.getByRole("button", { name: /Retry intake/ }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    await renderPage(<Locked scrams={scrams}><CaptureDrawer capture={capture()} onClose={() => {}} /></Locked>);
    expect((screen.getByRole("button", { name: /Classify/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables Requeue on a run", async () => {
    openProject();
    await renderPage(<Locked scrams={scrams}><RunActions packageId="WP-9" run={failedRun} /></Locked>);
    const b = screen.getByRole("button", { name: "Requeue this run" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toMatch(/SCRAM is in force/);
  });

  it("blocks the C key and disables the add button", async () => {
    openProject();
    await renderPage(<Locked scrams={scrams}><QuickAdd /></Locked>);
    const user = userEvent.setup();
    await user.keyboard("c");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect((screen.getAllByRole("button")[0] as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the SCRAM banner's load error", () => {
  it("shows in the shell when the SCRAM list cannot be read", async () => {
    server.use(http.get("*/scrams", () => HttpResponse.json({}, { status: 500 })), http.get("*/inbox", () => HttpResponse.json({ items: [] })));
    await renderPage(<Shell session={{ registered: true, signed_in: true, user: "ben" }}><p>app</p></Shell>);
    expect(await screen.findByText("Whether a SCRAM is in force could not be loaded.")).toBeTruthy();
  });
});

describe("the phone More sheet", () => {
  function phone() {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    server.use(http.get("*/inbox", () => HttpResponse.json({ items: [] })));
  }
  it("keeps Tab inside the sheet", async () => {
    phone();
    await renderPage(<Shell session={{ registered: true, signed_in: true, user: "ben" }}><p>app</p></Shell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    const stops = [...sheet.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
    stops[stops.length - 1]!.focus();
    await user.tab();
    expect(document.activeElement).toBe(stops[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(stops[stops.length - 1]);
  });
  it("returns focus to More when the scrim closes it", async () => {
    phone();
    await renderPage(<Shell session={{ registered: true, signed_in: true, user: "ben" }}><p>app</p></Shell>);
    const user = userEvent.setup();
    const more = screen.getByRole("button", { name: "More" });
    await user.click(more);
    await user.click(document.querySelector(".more-scrim")!);
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
    expect(document.activeElement).toBe(more);
  });
});

describe("the review drawer", () => {
  it("returns focus to what opened it when it closes", async () => {
    server.use(
      http.get("*/admin", () => HttpResponse.json({ members: [], registry: { qualifications: [] }, projects: [] })),
      http.get("*/packages/:id/actions", () => HttpResponse.json([])),
      http.get("*/packages/:id/person-verifications", () => HttpResponse.json([])),
      http.get("*/packages/:id", () => HttpResponse.json(view({}, { id: "WP-1", title: "Cockpit", status: "in-verification" }))),
    );
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open review</button>
          {open && <BoardReviewDrawer packageId="WP-1" mode="software" onClose={() => setOpen(false)} />}
        </>
      );
    }
    await renderPage(<Host />);
    const user = userEvent.setup();
    const opener = screen.getByRole("button", { name: "Open review" });
    await user.click(opener);
    await user.click(await screen.findByRole("button", { name: "Close review drawer" }));
    expect(screen.queryByRole("complementary", { name: "Review WP-1" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
