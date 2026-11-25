import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw/http";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import type { UsageLimitsView } from "../api/types.js";
import { renderPage } from "../test/render.js";
import { server } from "../test/server.js";
import { LAYOUT_KEY } from "../lib/control-room-layout.js";
import { ControlRoom } from "./ControlRoom.js";

const NOW = Date.parse("2026-11-24T12:00:00.000Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

function view(over: Partial<UsageLimitsView> = {}): UsageLimitsView {
  return {
    reported: true,
    read_at: at(0),
    providers: [
      {
        id: "codex",
        source: "cli-log",
        observed_at: at(-14 * MIN),
        plan: "plus",
        windows: [
          { id: "five_hour", window_minutes: 300, used_percent: 11, resets_at: at(2 * HOUR + 11 * MIN), status: "allowed" },
          { id: "seven_day", window_minutes: 10080, used_percent: 88, resets_at: at(4 * 24 * HOUR + 23 * HOUR) },
        ],
      },
      {
        id: "claude",
        source: "cli-stream",
        observed_at: at(-2 * MIN),
        windows: [{ id: "seven_day_opus", used_percent: 98, resets_at: at(3 * HOUR), status: "warning" }],
      },
      { id: "grok", source: "none", windows: [] },
      { id: "opencode", source: "none", windows: [] },
      { id: "agy", source: "none", windows: [] },
    ],
    ...over,
  };
}

function probe(id: string, installed: boolean, auth: "signed-in" | "signed-out" | "unknown") {
  return { id, display_name: id, installed, auth, roles: [] };
}

function serve(body: UsageLimitsView | { status: number }, probes: ReturnType<typeof probe>[] = []) {
  server.use(
    http.get("*/subscriptions", () =>
      HttpResponse.json({ reported: probes.length > 0, probes, checkers: [], tiers: [], local_rule: "", pins: [] }),
    ),
  );
  server.use(http.get("*/usage/limits", () => ("status" in body ? HttpResponse.json({ message: "down" }, { status: body.status }) : HttpResponse.json(body))));
  server.use(http.get("*/metrics", () => HttpResponse.json({ packages_accepted: 3, first_pass_accepted: 2, findings_caught_before_review: 5, quick_answers: 4 })));
}

async function expectClean(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  });
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join("; ")})`)).toEqual([]);
}

const meter = (name: string) => screen.getByRole("meter", { name });

beforeEach(() => {
  // Only the clock is faked; timers and promises stay real so the query client and msw behave.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  window.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("control room: usage limits", () => {
  it("shows each window with percent left and when it resets", async () => {
    serve(view());
    await renderPage(<ControlRoom />);
    const five = await screen.findByRole("meter", { name: "Codex 5-hour window" });
    expect(five.getAttribute("aria-valuenow")).toBe("89");
    expect(five.getAttribute("aria-valuetext")).toBe("89 percent left, resets in 2 hours 11 minutes");
    expect(screen.getByText("89% left")).toBeTruthy();
    expect(screen.getByText("resets in 2h 11m")).toBeTruthy();
    expect(screen.getByText("12% left")).toBeTruthy();
    expect(screen.getByText("resets in 4d 23h")).toBeTruthy();
    expect(screen.getByText("plus")).toBeTruthy();
    expect(screen.getByText("as of 14 min ago, from Codex's session log")).toBeTruthy();
    expect(screen.getByText("as of 2 min ago, from Claude Code's run output")).toBeTruthy();
    expect(meter("Claude Code 7-day, Opus")).toBeTruthy();
  });

  it("draws the pace marker and says when the reserve is burning faster than time", async () => {
    serve(view());
    const { container } = await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 7-day window" });
    expect(container.querySelectorAll(".cr-pace").length).toBe(2);
    expect(screen.getByText(/ahead of pace: runs out about 4d 16h before reset/)).toBeTruthy();
  });

  it("turns amber at 20% left and red at 5% left, and the words change with the colour", async () => {
    serve(
      view({
        providers: [
          {
            id: "codex",
            source: "cli-log",
            observed_at: at(-MIN),
            windows: [
              { id: "five_hour", used_percent: 50, resets_at: at(HOUR) },
              { id: "seven_day", used_percent: 80, resets_at: at(HOUR) },
              { id: "monthly", used_percent: 96, resets_at: at(HOUR) },
              { id: "primary", used_percent: 100, status: "rejected", resets_at: at(65 * MIN) },
            ],
          },
        ],
      }),
    );
    await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    const row = (name: string) => meter(name).closest(".cr-row") as HTMLElement;
    expect(row("Codex 5-hour window").className).toContain("tone-ok");
    expect(within(row("Codex 5-hour window")).queryByText(/running low|almost out|limit reached/i)).toBeNull();
    expect(row("Codex 7-day window").className).toContain("tone-needs");
    expect(within(row("Codex 7-day window")).getByText("Running low")).toBeTruthy();
    expect(row("Codex Monthly").className).toContain("tone-stuck");
    expect(within(row("Codex Monthly")).getByText("Almost out")).toBeTruthy();
    const refused = row("Codex Primary window");
    expect(refused.className).toContain("tone-stuck");
    expect(within(refused).getByText("limit reached")).toBeTruthy();
    expect(within(refused).getByText("resets in 1h 5m")).toBeTruthy();
    expect(screen.getByText(/Lowest reserve: Codex primary window, limit reached, resets in 1h 5m/).className).toContain("warm");
  });

  it("names the lowest reserve, and stays calm when all are above 20%", async () => {
    serve(view());
    const { unmount } = await renderPage(<ControlRoom />);
    expect(await screen.findByText("Lowest reserve: Claude Code 7-day, Opus, 2% left, resets in 3h 0m")).toBeTruthy();
    unmount();
    serve(view({ providers: [{ id: "codex", source: "cli-log", windows: [{ id: "five_hour", used_percent: 10, resets_at: at(HOUR) }] }] }));
    await renderPage(<ControlRoom />);
    const calm = await screen.findByText("All reserves above 20%");
    expect(calm.className).not.toContain("warm");
  });

  it("says there are no current readings when every window has reset, still showing the stale rows", async () => {
    serve(view({ providers: [{ id: "codex", source: "cli-log", observed_at: at(-6 * HOUR), windows: [{ id: "five_hour", window_minutes: 300, used_percent: 90, resets_at: at(-HOUR) }] }] }));
    const { container } = await renderPage(<ControlRoom />);
    const head = await screen.findByText("No current readings: every window has reset since it was read.");
    expect(head.className).toContain("muted");
    expect(head.className).not.toContain("warm");
    expect(screen.queryByText(/All reserves above 20%/)).toBeNull();
    expect(container.querySelector(".is-stale")).toBeTruthy();
  });

  it("marks a reading whose window has already reset", async () => {
    serve(view({ providers: [{ id: "codex", source: "cli-log", observed_at: at(-6 * HOUR), windows: [{ id: "five_hour", window_minutes: 300, used_percent: 90, resets_at: at(-HOUR) }] }] }));
    const { container } = await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    expect(container.querySelector(".is-stale")).toBeTruthy();
    expect(screen.getByText("window has reset since this reading")).toBeTruthy();
    expect(screen.getByText("was 10% left")).toBeTruthy();
    expect(container.querySelector(".cr-pace")).toBeNull();
    expect(screen.queryByText(/Lowest reserve/)).toBeNull();
  });

  it("gives providers with no source no bars, and one quiet line", async () => {
    serve(view());
    await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    expect(screen.getAllByRole("meter")).toHaveLength(3);
    expect(
      screen.getByText("Not reported: Grok CLI, opencode, Antigravity."),
    ).toBeTruthy();
    expect(screen.queryByText(/Not reported yet/)).toBeNull();
  });

  it("shows a calm empty state before anything has been read, with a card for Claude Code and Codex", async () => {
    serve({ reported: false, providers: [] });
    const { container } = await renderPage(<ControlRoom />);
    expect(await screen.findByText("No readings yet.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Claude Code limits" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Codex limits" })).toBeTruthy();
    expect(screen.queryByRole("meter")).toBeNull();
    await expectClean(container);
  });

  it("shows Claude Code from the start: found and signed in, waiting for its first run", async () => {
    const v = view();
    v.providers = v.providers.map((p) => (p.id === "claude" ? { id: "claude", source: "none", windows: [] } : p));
    serve(v, [probe("claude", true, "signed-in"), probe("codex", true, "signed-in")]);
    await renderPage(<ControlRoom />);
    const card = await screen.findByRole("region", { name: "Claude Code limits" });
    await within(card).findByText("Signed in, no reading yet");
    expect(within(card).getByText(/once a Claude run that Control Rod makes reports them/)).toBeTruthy();
    expect(within(card).queryByRole("meter")).toBeNull();
    expect(screen.getByRole("meter", { name: "Codex 5-hour window" })).toBeTruthy();
    expect(screen.queryByText(/Not reported: .*Claude/)).toBeNull();
  });

  it("gives a signed-in harness whose report has no windows a waiting card, not an empty reading", async () => {
    const v = view();
    v.providers = v.providers.map((p) => (p.id === "claude" ? { id: "claude", source: "cli-stream", windows: [] } : p));
    serve(v, [probe("claude", true, "signed-in")]);
    await renderPage(<ControlRoom />);
    const card = await screen.findByRole("region", { name: "Claude Code limits" });
    await within(card).findByText("Signed in, no reading yet");
    expect(within(card).queryByText("No windows reported.")).toBeNull();
  });

  it("does not ask for machine details when both built-in harnesses have readings", async () => {
    let asked = 0;
    serve(view());
    server.use(
      http.get("*/subscriptions", () => {
        asked += 1;
        return HttpResponse.json({ reported: false, probes: [], checkers: [], tiers: [], local_rule: "", pins: [] });
      }),
    );
    await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    await new Promise((r) => setTimeout(r, 50));
    expect(asked).toBe(0);
  });

  it("stops asking for machine details once the usage read fails", async () => {
    let asked = 0;
    serve({ reported: false, providers: [] });
    server.use(
      http.get("*/subscriptions", () => {
        asked += 1;
        return HttpResponse.json({ reported: false, probes: [], checkers: [], tiers: [], local_rule: "", pins: [] });
      }),
    );
    const { qc } = await renderPage(<ControlRoom />);
    await screen.findByRole("region", { name: "Claude Code limits" });
    await waitFor(() => expect(asked).toBe(1));
    server.use(http.get("*/usage/limits", () => HttpResponse.json({ message: "down" }, { status: 503 })));
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["usage-limits"] });
    });
    await screen.findByText("Usage limits could not be loaded.");
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["subscriptions"], type: "active" });
    });
    expect(asked).toBe(1);
  });

  it("says when a built-in harness is missing or signed out", async () => {
    serve({ reported: false, providers: [] }, [probe("claude", true, "signed-out"), probe("codex", false, "unknown")]);
    await renderPage(<ControlRoom />);
    const claude = await screen.findByRole("region", { name: "Claude Code limits" });
    await within(claude).findByText("Not signed in");
    const codex = screen.getByRole("region", { name: "Codex limits" });
    expect(within(codex).getByText("Not found on this machine")).toBeTruthy();
  });

  it("says when the limits could not be loaded", async () => {
    serve({ status: 500 });
    const { container } = await renderPage(<ControlRoom />);
    const alert = await screen.findByText("Usage limits could not be loaded.");
    expect(alert.getAttribute("role")).toBe("alert");
    await expectClean(container);
  });

  it("passes an accessibility scan with readings", async () => {
    serve(view());
    const { container } = await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    await expectClean(container);
  });
});

describe("control room: many harnesses and CodexBar", () => {
  const bar = (id: UsageLimitsView["providers"][number]["id"], used: number, extra: Partial<UsageLimitsView["providers"][number]["windows"][number]> = {}) => ({
    id,
    source: "codexbar" as const,
    windows: [{ id: "monthly" as const, used_percent: used, resets_at: at(10 * HOUR), ...extra }],
  });

  it("names every harness in plain words", async () => {
    const ids = ["gemini", "agy", "cursor", "copilot", "opencode", "opencode-go", "grok", "amp", "kiro", "factory", "windsurf", "kilo", "warp", "mistral", "zed", "devin"] as const;
    serve(view({ providers: ids.map((id, i) => bar(id, 10 + i)) }));
    await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Gemini CLI Monthly" });
    for (const n of ["Gemini CLI", "Antigravity", "Cursor", "GitHub Copilot", "opencode", "opencode Go", "Grok CLI", "Amp", "Kiro", "Factory Droid", "Windsurf", "Kilo Code", "Warp", "Mistral Vibe", "Zed", "Devin"]) {
      expect(screen.getByRole("heading", { level: 3, name: n })).toBeTruthy();
    }
  });

  it("orders amber and red first, then least reserve, then by name", async () => {
    serve(
      view({
        providers: [
          bar("zed", 40),
          bar("amp", 40),
          bar("kiro", 5),
          bar("cursor", 85, { status: "allowed" }),
          bar("warp", 99),
          { id: "devin", source: "codexbar", windows: [] },
        ],
      }),
    );
    await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Cursor Monthly" });
    const heads = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(heads).toEqual(["Warp", "Cursor", "Amp", "Zed", "Kiro", "Devin", "Claude Code", "Codex"]);
  });

  it("ignores any label sent for a window, names it from its id, and says the numbers are from CodexBar", async () => {
    serve(view({ providers: [bar("grok", 91, { id: "weekly", label: "SuperGrok weekly" } as never)] }));
    await renderPage(<ControlRoom />);
    expect(await screen.findByRole("meter", { name: "Grok CLI Weekly" })).toBeTruthy();
    expect(screen.queryByText("SuperGrok weekly")).toBeNull();
    expect(screen.getByText("from CodexBar")).toBeTruthy();
  });

  it("names the window from its id", async () => {
    serve(view({ providers: [bar("gemini", 30, { id: "daily" })] }));
    await renderPage(<ControlRoom />);
    expect(await screen.findByRole("meter", { name: "Gemini CLI Daily" })).toBeTruthy();
  });

  it("invites installing CodexBar when the engine is absent, with a safe link", async () => {
    serve(view());
    const { container } = await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    const link = screen.getByRole("link", { name: "CodexBar" }) as HTMLAnchorElement;
    expect(link.href).toBe("https://github.com/steipete/CodexBar");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noreferrer");
    expect(container.querySelector(".cr-engine")?.textContent).toContain(
      "Limits for Cursor, Copilot, Gemini, Grok and 12 more come from CodexBar, a free open-source usage tracker (MIT). Install it and Control Rod reads its numbers; CodexBar signs in to each tool itself, Control Rod never sees a token.",
    );
    await expectClean(container);
  });

  it("says which CodexBar it is using when found, and lists what is still not reported", async () => {
    serve(view({ engine: { id: "codexbar", found: true, version: "0.81.0" } }));
    const { container } = await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    expect(screen.getByText("Using CodexBar 0.81.0 for the other tools.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "CodexBar" })).toBeNull();
    expect(screen.getByText("Not reported: Grok CLI, opencode, Antigravity.")).toBeTruthy();
    await expectClean(container);
  });
});

describe("control room: per-window freshness", () => {
  it("shows a window's own age when it differs from the provider's by more than 10 minutes", async () => {
    serve(
      view({
        providers: [
          {
            id: "codex",
            source: "cli-log",
            observed_at: at(-MIN),
            windows: [
              { id: "five_hour", window_minutes: 300, used_percent: 10, resets_at: at(HOUR), observed_at: at(-MIN) },
              { id: "seven_day", window_minutes: 10080, used_percent: 40, resets_at: at(3 * 24 * HOUR), observed_at: at(-2 * 24 * HOUR) },
              { id: "monthly", used_percent: 40, resets_at: at(3 * 24 * HOUR), observed_at: at(-5 * MIN) },
            ],
          },
        ],
      }),
    );
    await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 7-day window" });
    const row = (n: string) => meter(n).closest(".cr-row") as HTMLElement;
    expect(within(row("Codex 7-day window")).getByText("as of 2 d ago")).toBeTruthy();
    expect(within(row("Codex 5-hour window")).queryByText(/as of/)).toBeNull();
    expect(within(row("Codex Monthly")).queryByText(/as of/)).toBeNull();
  });
});

describe("control room: arranging modules", () => {
  const titles = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

  it("moves a module with the arrow keys, announces it, and keeps the order", async () => {
    serve(view());
    await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    expect(titles()).toEqual(["Usage limits", "Is it earning its place?"]);
    const grip = screen.getByRole("button", { name: /^Move Usage limits\./ });
    grip.focus();
    fireEvent.keyDown(grip, { key: "ArrowDown" });
    expect(titles()).toEqual(["Is it earning its place?", "Usage limits"]);
    expect(screen.getByRole("status").textContent).toBe("Usage limits moved to position 2 of 2");
    expect(JSON.parse(window.localStorage.getItem(LAYOUT_KEY) ?? "{}").order).toEqual(["earning-its-place", "usage-limits"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Move Usage limits\./ }));
    fireEvent.keyDown(screen.getByRole("button", { name: /^Move Usage limits\./ }), { key: "ArrowUp", altKey: true });
    expect(titles()).toEqual(["Usage limits", "Is it earning its place?"]);
    expect(screen.getByRole("status").textContent).toBe("Usage limits moved to position 1 of 2");
  });

  it("moves a module with the earlier and later buttons, keeps focus and announces it", async () => {
    serve(view());
    await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    const earlier = () => screen.getByRole("button", { name: "Move Usage limits earlier" }) as HTMLButtonElement;
    const later = () => screen.getByRole("button", { name: "Move Usage limits later" }) as HTMLButtonElement;
    expect(earlier().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move Is it earning its place? later" }) as HTMLButtonElement).disabled).toBe(true);
    later().focus();
    fireEvent.click(later());
    expect(titles()).toEqual(["Is it earning its place?", "Usage limits"]);
    expect(screen.getByRole("status").textContent).toBe("Usage limits moved to position 2 of 2");
    expect(later().disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Move Usage limits\./ }));
    expect(earlier().disabled).toBe(false);
    earlier().focus();
    fireEvent.click(earlier());
    expect(titles()).toEqual(["Usage limits", "Is it earning its place?"]);
    expect(screen.getByRole("status").textContent).toBe("Usage limits moved to position 1 of 2");
  });

  it("restores a saved order, ignores unknown ids and appends new modules", async () => {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ order: ["gone", "earning-its-place"], collapsed: ["gone"] }));
    serve(view());
    await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    expect(titles()).toEqual(["Is it earning its place?", "Usage limits"]);
  });

  it("survives unreadable storage", async () => {
    window.localStorage.setItem(LAYOUT_KEY, "{not json");
    serve(view());
    await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    expect(titles()).toEqual(["Usage limits", "Is it earning its place?"]);
  });

  it("collapses a module and remembers it", async () => {
    serve(view());
    await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    const fold = screen.getByRole("button", { name: /Collapse Usage limits/ });
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(fold);
    expect(screen.getByRole("button", { name: /Expand Usage limits/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("meter", { name: "Codex 5-hour window" })).toBeNull();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(LAYOUT_KEY) ?? "{}").collapsed).toEqual(["usage-limits"]));
  });

  it("ends a pointer drag on pointerup, pointercancel and lostpointercapture, and ignores other pointers", async () => {
    serve(view());
    const { container } = await renderPage(<ControlRoom />);
    await screen.findByRole("meter", { name: "Codex 5-hour window" });
    const grid = container.querySelector(".cr-grid") as HTMLElement;
    const dragging = () => container.querySelectorAll(".is-dragging").length;
    const grip = () => screen.getByRole("button", { name: /^Move Usage limits\./ });
    for (const end of ["pointerUp", "pointerCancel", "lostPointerCapture"] as const) {
      fireEvent.pointerDown(grip(), { pointerId: 7, button: 0 });
      expect(dragging()).toBe(1);
      // Another pointer neither moves nor ends the drag.
      fireEvent[end](grid, { pointerId: 8 });
      expect(dragging()).toBe(1);
      fireEvent.pointerDown(grip(), { pointerId: 9, button: 0 });
      expect(dragging()).toBe(1);
      fireEvent[end](grid, { pointerId: 7 });
      expect(dragging()).toBe(0);
    }
  });

  it("keeps the clock moving: the countdown follows the 30 second tick", async () => {
    serve(view());
    await renderPage(<ControlRoom />);
    await screen.findByText("resets in 2h 11m");
    vi.setSystemTime(NOW + 12 * MIN);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("resets in 1h 59m")).toBeTruthy();
  });
});
