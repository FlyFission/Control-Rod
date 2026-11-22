import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import { DIGEST, pkg, view } from "../../test/fixtures.js";
import type { ActionDescriptor, WorkPackage } from "../../api/types.js";
import { resetLiveStatus, useLiveEvents } from "../../lib/live.js";
import { BoardView } from "./BoardView.js";
import { Card } from "./Card.js";
import { CardActions } from "./CardActions.js";
import {
  BOARD_FIND_YIELDS_TO,
  cardStatusReadiness,
  filterBoardCards,
  shouldSpinStatus,
  shouldYieldBoardFind,
  sortLaneCards,
  type StatusReadiness,
} from "./boardPolish.js";
import type { BoardCard } from "./useBoardData.js";

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

function makeBoardCard(over: Partial<BoardCard> & { id?: string; title?: string } = {}): BoardCard {
  const p = pkg({ id: over.id ?? "WP-1", title: over.title ?? "Sample card" });
  return {
    pkg: over.pkg ?? p,
    kinds: over.kinds ?? ["doc"],
    column: over.column ?? "ready",
    next: over.next ?? { tone: "wait", text: "Waiting" },
    runActive: over.runActive ?? false,
    lastKnown: over.lastKnown ?? false,
    nuclear: over.nuclear ?? false,
    ...(over.owner ? { owner: over.owner } : {}),
    ...(over.heldPreCheck ? { heldPreCheck: over.heldPreCheck } : {}),
  };
}

function setupBoardApi(s: {
  packages: WorkPackage[];
  actions?: Record<string, ActionDescriptor[]>;
  runs?: Record<string, "running" | "queued" | "held-precheck">;
}) {
  server.use(
    http.get("*/auth/session", () => HttpResponse.json({ registered: true, signed_in: true, user: "ben" })),
    http.get("*/packages", () => HttpResponse.json(s.packages)),
    http.get("*/office", () => HttpResponse.json([])),
    http.get("*/captures", () => HttpResponse.json([])),
    http.get("*/admin", () => HttpResponse.json({ members: [], registry: { qualifications: [] } })),
    http.get("*/packages/:id/actions", ({ params }) => HttpResponse.json(s.actions?.[String(params["id"])] ?? [])),
    http.get("*/packages/:id/person-verifications", () => HttpResponse.json([])),
    http.get("*/packages/:id", ({ params }) => {
      const id = String(params["id"]);
      const p = s.packages.find((x) => x.id === id)!;
      const runMode = s.runs?.[id];
      const runs =
        runMode === "running"
          ? [{ id: "R-1", package_id: id, package_revision: 0, role: "author", status: "running" }]
          : runMode === "held-precheck"
            ? [
                {
                  id: "R-2",
                  package_id: id,
                  package_revision: 0,
                  role: "pre-check",
                  status: "queued",
                  waiting_reason: "Need independent runtime",
                },
              ]
            : [];
      return HttpResponse.json({ ...view({}, p), originators: ["ben"], runs });
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeSource);
  resetLiveStatus();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
});

describe("sortLaneCards", () => {
  it("places needs and block cards above wait and ok cards while preserving recency within tiers", () => {
    const wait1 = makeBoardCard({ id: "WP-W1", next: { tone: "wait", text: "Waiting 1" } });
    const ok1 = makeBoardCard({ id: "WP-OK", next: { tone: "ok", text: "Accepted" } });
    const needs1 = makeBoardCard({ id: "WP-N1", next: { tone: "needs", text: "Release" } });
    const wait2 = makeBoardCard({ id: "WP-W2", next: { tone: "wait", text: "Waiting 2" } });
    const block1 = makeBoardCard({ id: "WP-B1", next: { tone: "block", text: "Blocked" } });
    const needs2 = makeBoardCard({ id: "WP-N2", next: { tone: "needs", text: "Accept" } });

    const input = [wait1, ok1, needs1, wait2, block1, needs2];
    const sorted = sortLaneCards(input);

    expect(sorted.map((c) => c.pkg.id)).toEqual(["WP-N1", "WP-B1", "WP-N2", "WP-W1", "WP-W2", "WP-OK"]);
    expect(input.map((c) => c.pkg.id)).toEqual(["WP-W1", "WP-OK", "WP-N1", "WP-W2", "WP-B1", "WP-N2"]);
  });

  it("wires attention-first sorting into BoardView columns", async () => {
    const release: ActionDescriptor = { command: "release", label: "Release", allowed: true, signature: "direct" };
    setupBoardApi({
      packages: [
        pkg({ id: "WP-WAIT", title: "Waiting draft", status: "draft" }),
        pkg({ id: "WP-NEEDS", title: "Needs release", status: "draft" }),
      ],
      actions: { "WP-WAIT": [], "WP-NEEDS": [release] },
    });
    await renderPage(<Page />);
    await waitFor(() => {
      const readyCol = document.querySelectorAll(".bd-col")[0]!;
      const titles = Array.from(readyCol.querySelectorAll(".bd-title")).map((el) => el.textContent);
      expect(titles).toEqual(["Needs release", "Waiting draft"]);
    });
  });
});

describe("shouldYieldBoardFind and scoped Cmd/Ctrl+F", () => {
  it("yields for inputs, textareas, selects, contenteditable, and [role='dialog']", () => {
    expect(BOARD_FIND_YIELDS_TO).toContain('[role="dialog"]');

    for (const tag of ["input", "textarea", "select"] as const) {
      expect(shouldYieldBoardFind(document.createElement(tag)), tag).toBe(true);
    }

    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(shouldYieldBoardFind(editable)).toBe(true);

    const nonEditable = document.createElement("div");
    nonEditable.setAttribute("contenteditable", "false");
    expect(shouldYieldBoardFind(nonEditable)).toBe(false);

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const insideDialog = document.createElement("button");
    dialog.appendChild(insideDialog);
    expect(shouldYieldBoardFind(insideDialog)).toBe(true);

    expect(shouldYieldBoardFind(document.createElement("button"))).toBe(false);
    expect(shouldYieldBoardFind(null)).toBe(false);
  });

  it("focuses board search on Cmd/Ctrl+F outside fields, yields inside fields/dialogs, and filters cards", async () => {
    setupBoardApi({
      packages: [
        pkg({ id: "WP-1", title: "Alpha pump scope", status: "draft" }),
        pkg({ id: "WP-2", title: "Beta valve check", status: "draft" }),
      ],
    });
    await renderPage(<Page />);
    const alphaBtn = await screen.findByRole("button", { name: "Alpha pump scope" });
    const searchInput = screen.getByRole("searchbox", { name: "Filter board cards" }) as HTMLInputElement;

    alphaBtn.focus();
    const ctrlF = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(ctrlF);
    expect(ctrlF.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(searchInput);

    // Pressing Meta+F while already in an input yields instead of hijacking.
    const inInput = new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true, cancelable: true });
    searchInput.dispatchEvent(inInput);
    expect(inInput.defaultPrevented).toBe(false);

    // Pressing Ctrl+F inside a [role="dialog"] yields and keeps focus inside the dialog.
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const dialogBtn = document.createElement("button");
    dialogBtn.textContent = "Inside dialog";
    dialog.appendChild(dialogBtn);
    document.body.appendChild(dialog);
    try {
      dialogBtn.focus();
      const inDialog = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
      dialogBtn.dispatchEvent(inDialog);
      expect(inDialog.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(dialogBtn);
    } finally {
      dialog.remove();
    }

    // Typing into the search input filters cards and clears cleanly without showing empty-board onboarding.
    const user = userEvent.setup();
    await user.type(searchInput, "Beta");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Alpha pump scope" })).toBeNull());
    expect(screen.getByRole("button", { name: "Beta valve check" })).toBeTruthy();

    await user.clear(searchInput);
    await user.type(searchInput, "no-such-package");
    await waitFor(() => expect(screen.getByText('No cards match "no-such-package".')).toBeTruthy());
    expect(screen.queryByText(/Add your first card/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Clear filter" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Alpha pump scope" })).toBeTruthy());
  });

  it("filterBoardCards matches title, id, project name, owner, and next text", () => {
    const cards = [
      makeBoardCard({ id: "WP-10", title: "Seal check", owner: "ana", pkg: pkg({ id: "WP-10", title: "Seal check", project: "prj_1" }) }),
      makeBoardCard({ id: "WP-20", title: "Pipe spec", owner: "ben", pkg: pkg({ id: "WP-20", title: "Pipe spec", project: "prj_2" }) }),
    ];
    expect(filterBoardCards(cards, "wp-10").map((c) => c.pkg.id)).toEqual(["WP-10"]);
    expect(filterBoardCards(cards, "Reactor", { prj_2: "Reactor Core" }).map((c) => c.pkg.id)).toEqual(["WP-20"]);
    expect(filterBoardCards(cards, "   ").length).toBe(2);
  });
});

describe("shouldSpinStatus truthfulness", () => {
  it("returns true only when isActive is true and readiness is active or live", () => {
    expect(shouldSpinStatus("active", true)).toBe(true);
    expect(shouldSpinStatus("live", true)).toBe(true);
    expect(shouldSpinStatus("active", false)).toBe(false);
    expect(shouldSpinStatus("live", false)).toBe(false);

    const nonSpinning: StatusReadiness[] = ["settled", "held", "unknown", "last-known", "blocked", "connecting"];
    for (const readiness of nonSpinning) {
      expect(shouldSpinStatus(readiness, true), `${readiness} with isActive=true`).toBe(false);
      expect(shouldSpinStatus(readiness, false), `${readiness} with isActive=false`).toBe(false);
    }
  });

  it("derives non-spinning readiness for held pre-checks, unknown streams, last-known cards, and settled work", () => {
    expect(cardStatusReadiness(makeBoardCard({ runActive: true, next: { tone: "wait", text: "An agent is working on it" } }), "live")).toBe("active");
    expect(cardStatusReadiness(makeBoardCard({ runActive: true, heldPreCheck: true, next: { tone: "needs", text: "Pre-check held" } }), "live")).toBe("held");
    expect(cardStatusReadiness(makeBoardCard({ runActive: true }), "unknown")).toBe("unknown");
    expect(cardStatusReadiness(makeBoardCard({ runActive: true, lastKnown: true }), "live")).toBe("last-known");
    expect(cardStatusReadiness(makeBoardCard({ runActive: true, next: { tone: "ok", text: "Accepted" } }), "live")).toBe("settled");
    expect(cardStatusReadiness(makeBoardCard({ runActive: true, next: { tone: "block", text: "Blocked" } }), "live")).toBe("blocked");
  });

  it("renders a spinner on Card only when genuinely active, never beside held, settled, or unknown", async () => {
    const p = pkg({ id: "WP-RUN", title: "Active card", status: "in-work" });
    const { rerender } = await renderPage(
      <Card
        pkg={p}
        kinds={["code"]}
        next={{ tone: "wait", text: "An agent is working on it" }}
        column="drafting"
        stream="live"
        runActive={true}
        readiness="active"
        onOpen={vi.fn()}
      />,
    );
    expect(document.querySelector(".bd-spin")).not.toBeNull();

    for (const readiness of ["held", "settled", "unknown", "last-known"] as const) {
      rerender(
        <Card
          pkg={p}
          kinds={["code"]}
          next={{ tone: "wait", text: "Waiting" }}
          column="drafting"
          stream={readiness === "unknown" ? "unknown" : "live"}
          lastKnown={readiness === "last-known"}
          runActive={true}
          readiness={readiness}
          onOpen={vi.fn()}
        />,
      );
      expect(document.querySelector(".bd-spin"), readiness).toBeNull();
    }
  });
});

describe("secondary card actions", () => {
  it("keeps Move to keyboard-reachable in its own actions row below the card title", async () => {
    const accept: ActionDescriptor = { command: "accept", label: "Accept", allowed: true, signature: "direct" };
    const ret: ActionDescriptor = { command: "return", label: "Return", allowed: true, signature: "direct" };
    const card = makeBoardCard({
      id: "WP-ACT",
      title: "Valve calculation",
      column: "needs-signature",
      next: { tone: "needs", text: "Accept" },
      offered: [accept, ret],
      digest: DIGEST,
    });
    card.offered = [accept, ret];
    card.digest = DIGEST;

    await renderPage(
      <Card
        pkg={card.pkg}
        kinds={card.kinds}
        next={card.next}
        column={card.column}
        actions={<CardActions card={card} />}
        onOpen={vi.fn()}
      />,
    );

    const article = screen.getByRole("article");
    const titleBtn = within(article).getByRole("button", { name: "Valve calculation" });
    const moveBtn = within(article).getByRole("button", { name: "Move to, Valve calculation" });

    expect(titleBtn.classList.contains("bd-title")).toBe(true);
    expect(moveBtn.closest(".bd-actions")).not.toBeNull();
    expect(titleBtn.closest(".bd-actions")).toBeNull();
    expect(moveBtn.tabIndex).toBeGreaterThanOrEqual(0);
    moveBtn.focus();
    expect(document.activeElement).toBe(moveBtn);

    fireEvent.keyDown(moveBtn, { key: "ArrowDown" });
    expect(await screen.findByRole("menu", { name: "Move to, Valve calculation" })).toBeTruthy();
  });
});
