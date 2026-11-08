import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { pkg, view } from "../../test/fixtures.js";
import type { CaptureView, WorkPackage } from "../../api/types.js";
import { resetLiveStatus, useLiveEvents } from "../../lib/live.js";
import { BoardView } from "./BoardView.js";
import { inTypingContext, splitPaste } from "./QuickAdd.js";
import { captureLine } from "./CaptureCard.js";
import { pendingCaptures } from "./useBoardData.js";

/** Quick add from the board and the capture card (redesign task 8; spec 6.2, 6.3). */

class FakeSource {
  static last: FakeSource | undefined;
  private listeners = new Map<string, ((m: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {
    FakeSource.last = this;
  }
  addEventListener(type: string, fn: (m: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, data: unknown = {}) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
  close() {}
}

function Page() {
  useLiveEvents(true);
  useEffect(() => {
    FakeSource.last?.emit("open");
  }, []);
  return <BoardView />;
}

function capture(over: Partial<CaptureView> = {}): CaptureView {
  return { schema_version: "0.1.0", id: "C-1", text: "Fix the login redirect", source: "web", created_at: "2026-11-08T10:00:00Z", ...over };
}

/** The reads the board makes; captures and packages are mutable so a test can watch them change. */
function api(s: { packages?: WorkPackage[]; captures?: CaptureView[] } = {}) {
  const state = { packages: s.packages ?? [], captures: s.captures ?? [] };
  const posted: unknown[] = [];
  server.use(
    http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: true, user: "ben" })),
    http.get("*/packages", () => HttpResponse.json(state.packages)),
    http.get("*/office", () => HttpResponse.json([])),
    http.get("*/admin", () => HttpResponse.json({ members: [], registry: { qualifications: [] } })),
    http.get("*/captures", () => HttpResponse.json(state.captures)),
    http.post("*/captures", async ({ request }) => {
      const body = (await request.json()) as { text: string; lane?: string };
      posted.push(body);
      const c = capture({ id: `C-${posted.length}`, text: body.text });
      state.captures = [...state.captures, c];
      return HttpResponse.json(c, { status: 201 });
    }),
    http.get("*/packages/:id/actions", () => HttpResponse.json([])),
    http.get("*/packages/:id/person-verifications", () => HttpResponse.json([])),
    http.get("*/packages/:id", ({ params }) => {
      const p = state.packages.find((x) => x.id === String(params["id"]))!;
      return HttpResponse.json({ ...view({}, p), originators: ["ben"], runs: [] });
    }),
  );
  return { state, posted };
}

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeSource);
  resetLiveStatus();
});
afterEach(() => vi.unstubAllGlobals());

describe("splitPaste", () => {
  it("gives one trimmed title per non-empty line", () => {
    expect(splitPaste("  Fix login \r\n\n Draft SOW\n")).toEqual(["Fix login", "Draft SOW"]);
  });
});

describe("inTypingContext", () => {
  it("is true inside fields and editable regions only", () => {
    expect(inTypingContext(document.createElement("input"))).toBe(true);
    expect(inTypingContext(document.createElement("textarea"))).toBe(true);
    expect(inTypingContext(document.createElement("select"))).toBe(true);
    expect(inTypingContext(document.createElement("button"))).toBe(false);
    expect(inTypingContext(null)).toBe(false);
  });
});

describe("captureLine", () => {
  it("asks for a lane first, then reports intake", () => {
    expect(captureLine(capture())).toEqual({ tone: "needs", text: "Classify the data lane" });
    expect(captureLine(capture({ lane: "internal" }))).toEqual({ tone: "wait", text: "Waiting for intake" });
    expect(captureLine(capture({ lane: "internal", intake: { run_id: "R-1", status: "running" } }))).toEqual({ tone: "wait", text: "Intake drafting" });
    expect(captureLine(capture({ lane: "internal", intake: { run_id: "R-1", status: "failed", error: "no runtime" } }))).toEqual({ tone: "block", text: "Intake failed: no runtime" });
  });
});

describe("pendingCaptures", () => {
  it("keeps only captures that are not answered and not yet packages, newest first", () => {
    const older = capture({ id: "C-old", created_at: "2026-11-08T09:00:00Z" });
    const newer = capture({ id: "C-new", created_at: "2026-11-08T11:00:00Z" });
    const answered = capture({ id: "C-ans", disposition: "answered", answer: "Yes." });
    const drafted = capture({ id: "C-pkg", disposition: "package", package_ids: ["WP-1"] });
    const legacy = capture({ id: "C-legacy", disposition: "package", package_id: "WP-2" });
    expect(pendingCaptures([older, answered, drafted, newer, legacy]).map((c) => c.id)).toEqual(["C-new", "C-old"]);
  });
});

describe("QuickAdd on the board", () => {
  it("posts one capture on Enter, with no lane, and leaves a fresh focused field", async () => {
    const { posted } = api();
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Add a card" }));
    const field = screen.getByLabelText("Card title");
    expect(document.activeElement).toBe(field);
    await user.type(field, "Fix the login redirect{Enter}");
    await waitFor(() => expect(posted).toEqual([{ text: "Fix the login redirect", source: "web" }]));
    await waitFor(() => expect((screen.getByLabelText("Card title") as HTMLInputElement).value).toBe(""));
    expect(document.activeElement).toBe(screen.getByLabelText("Card title"));
    // The new capture shows at the top of Ready, asking for its lane.
    const card = (await screen.findByText("Fix the login redirect")).closest("article")!;
    expect(within(card).getByText("Classify the data lane")).toBeTruthy();
  });

  it("closes on Escape and returns focus to the opener; a typed draft survives losing focus", async () => {
    api();
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Add a card" }));
    await user.type(screen.getByLabelText("Card title"), "Half typed");
    await user.tab();
    expect((screen.getByLabelText("Card title") as HTMLInputElement).value).toBe("Half typed");
    await user.click(screen.getByLabelText("Card title"));
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Card title")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ Add a card" }));
  });

  it("opens from the c key outside a field, and not from c typed inside one", async () => {
    api();
    await renderPage(<Page />);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "+ Add a card" });
    await user.keyboard("c");
    const field = await screen.findByLabelText("Card title");
    await user.type(field, "abc");
    expect((field as HTMLInputElement).value).toBe("abc");
    expect(screen.getAllByLabelText("Card title")).toHaveLength(1);
  });

  it("offers one card per pasted line and posts them all", async () => {
    const { posted } = api();
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Add a card" }));
    await user.click(screen.getByLabelText("Card title"));
    await user.paste("Fix login\nDraft SOW\n\nSize relief valve");
    await user.click(screen.getByRole("button", { name: "Add 3 cards" }));
    await waitFor(() => expect(posted.map((b) => (b as { text: string }).text)).toEqual(["Fix login", "Draft SOW", "Size relief valve"]));
  });

  it("shows the server's refusal in place and keeps the text", async () => {
    api();
    server.use(http.post("*/captures", () => HttpResponse.json({ code: "refused", message: "Captures are paused", change: "Ask the owner to resume intake." }, { status: 409 })));
    await renderPage(<Page />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Add a card" }));
    await user.type(screen.getByLabelText("Card title"), "Fix login{Enter}");
    expect((await screen.findByRole("alert")).textContent).toContain("Captures are paused");
    expect((screen.getByLabelText("Card title") as HTMLInputElement).value).toBe("Fix login");
  });
});

describe("CaptureCard", () => {
  it("classifies the lane inline and then reads Intake drafting", async () => {
    const { state } = api({ captures: [capture()] });
    let classified: unknown;
    server.use(
      http.post("*/captures/C-1/classify", async ({ request }) => {
        classified = await request.json();
        state.captures = [capture({ lane: "proprietary", effective_lane: "proprietary", intake: { run_id: "R-1", status: "running" } })];
        return HttpResponse.json(state.captures[0]);
      }),
    );
    await renderPage(<Page />);
    const user = userEvent.setup();
    const card = (await screen.findByText("Fix the login redirect")).closest("article")!;
    await user.selectOptions(within(card).getByLabelText("Data lane"), "proprietary");
    await user.click(within(card).getByRole("button", { name: "Classify" }));
    await waitFor(() => expect(classified).toEqual({ lane: "proprietary" }));
    await waitFor(() => expect(card.textContent).toContain("Intake drafting"));
    expect(within(card).queryByRole("button", { name: "Classify" })).toBeNull();
  });

  it("shows a failed intake with its error and offers a retry", async () => {
    api({ captures: [capture({ lane: "internal", intake: { run_id: "R-9", status: "failed", error: "runtime not ready" } })] });
    let requeued = false;
    server.use(http.post("*/packages/C-1/runs/R-9/requeue", () => {
      requeued = true;
      return HttpResponse.json({}, { status: 201 });
    }));
    await renderPage(<Page />);
    const user = userEvent.setup();
    const card = (await screen.findByText("Fix the login redirect")).closest("article")!;
    expect(card.textContent).toContain("Intake failed: runtime not ready");
    await user.click(within(card).getByRole("button", { name: "Retry intake" }));
    await waitFor(() => expect(requeued).toBe(true));
  });

  it("gives way to the package cards once intake lists package ids", async () => {
    api({
      captures: [capture({ disposition: "package", package_ids: ["WP-1", "WP-2"] })],
      packages: [pkg({ id: "WP-1", title: "Login redirect fix" }), pkg({ id: "WP-2", title: "Login redirect tests" })],
    });
    await renderPage(<Page />);
    await screen.findByText("Login redirect fix");
    await screen.findByText("Login redirect tests");
    expect(screen.queryByText("Fix the login redirect")).toBeNull();
    expect(screen.queryByText("Classify the data lane")).toBeNull();
  });

  it("keeps the board usable and says so when captures cannot be read", async () => {
    api({ packages: [pkg({ id: "WP-1", title: "Lighting layout" })] });
    server.use(http.get("*/captures", () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    await renderPage(<Page />);
    await screen.findByText("Lighting layout");
    expect((await screen.findByRole("alert")).textContent).toContain("Could not read the captures");
    expect(screen.queryByText(/Add your first card/)).toBeNull();
  });
});
