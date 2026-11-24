import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AGENTS, agentRows } from "../lib/agents.js";
import {
  CASTING_STORAGE_KEY,
  addAuthorFallback,
  createDraftFromPreset,
  loadCastingDraft,
  moveAuthorFallback,
  removeAuthorFallback,
  saveCastingDraft,
} from "../lib/casting.js";
import { CLI_ECOSYSTEMS } from "../lib/runtimes.js";
import { CastingDesk } from "./CastingDesk.js";

describe("omp runtime listing", () => {
  it("lists Oh My Pi (omp) honestly as not-yet runnable in agents and runtimes", () => {
    const agent = AGENTS.find((a) => a.id === "omp");
    expect(agent).toEqual({
      id: "omp",
      name: "Oh My Pi",
      vendor: "multi-provider",
      runnable: false,
    });

    const rows = agentRows([], undefined, undefined);
    const ompRow = rows.find((r) => r.info.id === "omp");
    expect(ompRow?.state).toBe("not-yet");
    expect(ompRow?.seated).toBe(false);
    expect(ompRow?.status).toMatch(/sandbox/i);

    const eco = CLI_ECOSYSTEMS.find((c) => c.id === "omp");
    expect(eco?.label).toBe("Oh My Pi (omp)");
    expect(eco?.cliCommand).toBe("omp");
    expect(eco?.runnable).toBe(false);
    expect(eco?.reasoningLevels).toEqual(["default", "off", "minimal", "low", "medium", "high", "max"]);
  });
});

describe("casting helpers", () => {
  it("prevents duplicates and primary duplication in the Author fallback chain", () => {
    const base = createDraftFromPreset("balanced");
    // Cannot add primary Author model
    const withPrimary = addAuthorFallback(base, base.roles.author.modelId);
    expect(withPrimary.authorFallbacks).toEqual(base.authorFallbacks);

    // Cannot add duplicate fallback
    const existing = base.authorFallbacks[0]!;
    const withDup = addAuthorFallback(base, existing);
    expect(withDup.authorFallbacks).toEqual(base.authorFallbacks);

    // Adding a valid new fallback, reordering, and removing work cleanly
    const added = addAuthorFallback(base, "openai/gpt-6.2-sol");
    expect(added.authorFallbacks).toEqual([existing, "openai/gpt-6.2-sol"]);

    const moved = moveAuthorFallback(added, 1, "up");
    expect(moved.authorFallbacks).toEqual(["openai/gpt-6.2-sol", existing]);

    const removed = removeAuthorFallback(moved, existing);
    expect(removed.authorFallbacks).toEqual(["openai/gpt-6.2-sol"]);
  });

  it("falls back gracefully when localStorage is unavailable or corrupt", () => {
    const throwingStorage = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("quota");
      },
    };
    const loaded = loadCastingDraft(throwingStorage);
    expect(loaded.presetId).toBe("balanced");
    expect(saveCastingDraft(loaded, throwingStorage)).toBe(false);

    const corruptStorage = {
      getItem: () => "{not-json",
    };
    expect(loadCastingDraft(corruptStorage).presetId).toBe("balanced");
  });
});

describe("CastingDesk", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders honest local-draft notice and contains zero API-key or token inputs", () => {
    const { container } = render(<CastingDesk />);
    expect(screen.getByRole("heading", { name: "Casting desk" })).toBeTruthy();
    expect(screen.getByText(/saved in this browser only/i)).toBeTruthy();
    expect(screen.getByText(/API persistence and passkey signing \(ADR 0023\)/i)).toBeTruthy();
    expect(screen.getByText(/No API keys or tokens are stored here/i)).toBeTruthy();

    // Zero text/password inputs for API keys or tokens
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  it("applies each of the 4 presets and updates role assignments and read-back", async () => {
    const user = userEvent.setup();
    render(<CastingDesk />);

    const presets = screen.getByRole("group", { name: "Casting presets" });
    const balancedBtn = within(presets).getByRole("button", { name: "Balanced" });
    const deepBtn = within(presets).getByRole("button", { name: "Deep / High-Assurance" });
    const frugalBtn = within(presets).getByRole("button", { name: "Fast & Frugal" });
    const localBtn = within(presets).getByRole("button", { name: "Local-Only (Restricted Lane)" });

    expect(balancedBtn.getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Author model") as HTMLSelectElement).value).toBe("anthropic/claude-sonnet-5-5");
    expect((screen.getByLabelText("Blind Checker model") as HTMLSelectElement).value).toBe("openai/gpt-6.2-sol");
    expect(screen.getByText(/Claude Sonnet 5\.5 \(Anthropic, medium\) authors; Codex GPT-6\.2 Sol \(OpenAI, high\) checks blindly/)).toBeTruthy();

    await user.click(deepBtn);
    expect(deepBtn.getAttribute("aria-pressed")).toBe("true");
    expect(balancedBtn.getAttribute("aria-pressed")).toBe("false");
    expect((screen.getByLabelText("Author model") as HTMLSelectElement).value).toBe("anthropic/claude-opus-4-6");
    expect((screen.getByLabelText("Blind Checker model") as HTMLSelectElement).value).toBe("openai/gpt-6.2-astra");
    expect(screen.getByText(/Claude Opus 4\.6 \(Anthropic, high\) authors; Codex GPT-6\.2 Astra \(OpenAI, high\) checks blindly/)).toBeTruthy();

    await user.click(frugalBtn);
    expect(frugalBtn.getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Author model") as HTMLSelectElement).value).toBe("anthropic/claude-sonnet-4-5");
    expect((screen.getByLabelText("Blind Checker model") as HTMLSelectElement).value).toBe("openai/gpt-6-sol");
    expect(screen.getByText(/Claude Sonnet 4\.5 \(Anthropic, low\) authors; Codex GPT-6 Sol \(OpenAI, medium\) checks blindly/)).toBeTruthy();

    await user.click(localBtn);
    expect(localBtn.getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Author model") as HTMLSelectElement).value).toBe("ollama/qwen2.5-coder:32b");
    expect((screen.getByLabelText("Planner model") as HTMLSelectElement).value).toBe("ollama/deepseek-r1:32b");
    expect(screen.getByText(/Local Blind Checker restriction/i)).toBeTruthy();
    expect(screen.getAllByText(/Local models cannot serve as deciding checkers on Safety or Material grades/i).length).toBeGreaterThanOrEqual(1);
  });

  it("updates role model and effort and persists to localStorage", async () => {
    const user = userEvent.setup();
    render(<CastingDesk />);

    await user.selectOptions(screen.getByLabelText("Author model"), "google/gemini-2.5-pro");
    const authorEffort = screen.getByRole("group", { name: "Author effort" });
    await user.click(within(authorEffort).getByRole("button", { name: "Max" }));

    expect(within(authorEffort).getByRole("button", { name: "Max" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Gemini 2\.5 Pro \(Google, max\) authors/)).toBeTruthy();

    const storedRaw = window.localStorage.getItem(CASTING_STORAGE_KEY);
    expect(storedRaw).toBeTruthy();
    const stored = JSON.parse(storedRaw!);
    expect(stored.roles.author).toEqual({ modelId: "google/gemini-2.5-pro", effort: "max" });
    expect(stored.presetId).toBe("custom");
  });

  it("shows cross-vendor independence warning when Author and Blind Checker share a vendor family", async () => {
    const user = userEvent.setup();
    render(<CastingDesk />);

    expect(screen.queryByText(/Cross-vendor independence warning/i)).toBeNull();

    // Switch Blind Checker to Anthropic (same vendor as default Balanced Author)
    await user.selectOptions(screen.getByLabelText("Blind Checker model"), "anthropic/claude-opus-4-6");

    expect(screen.getByText(/Cross-vendor independence warning/i)).toBeTruthy();
    expect(screen.getByText(/share the same vendor family \(Anthropic\)/i)).toBeTruthy();
  });

  it("keeps Advanced collapsed by default, manages Author-only fallbacks, and states Blind Checkers never fail over", async () => {
    const user = userEvent.setup();
    render(<CastingDesk />);

    const summary = screen.getByText(/Advanced: author fallback chain/i);
    const details = summary.closest("details")!;
    expect(details.open).toBe(false);

    await user.click(summary);
    expect(details.open).toBe(true);

    // Explicit non-editable callout
    expect(within(details).getByText(/Blind Checkers never fail over/i)).toBeTruthy();

    const list = within(details).getByRole("list", { name: "Author fallback chain" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2); // Primary + 1 default fallback (Claude Sonnet 4.5)

    // Add a second fallback
    const addSelect = within(details).getByLabelText("Add author fallback model");
    await user.selectOptions(addSelect, "openai/gpt-6.2-sol");
    await user.click(within(details).getByRole("button", { name: "Add fallback" }));

    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("Codex GPT-6.2 Sol")).toBeTruthy();

    // Move Codex GPT-6.2 Sol up to Fallback 1
    await user.click(within(list).getByRole("button", { name: "Move Codex GPT-6.2 Sol up" }));
    const itemsAfterMove = within(list).getAllByRole("listitem");
    expect(itemsAfterMove[1]!.textContent).toContain("Codex GPT-6.2 Sol");
    expect(itemsAfterMove[2]!.textContent).toContain("Claude Sonnet 4.5");

    // Remove Claude Sonnet 4.5
    await user.click(within(list).getByRole("button", { name: "Remove Claude Sonnet 4.5" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).queryByText("Claude Sonnet 4.5")).toBeNull();

    // Reset to preset restores Balanced defaults
    await user.click(within(details).getByRole("button", { name: "Reset to preset" }));
    const itemsAfterReset = within(list).getAllByRole("listitem");
    expect(itemsAfterReset).toHaveLength(2);
    expect(itemsAfterReset[1]!.textContent).toContain("Claude Sonnet 4.5");
  });
});
