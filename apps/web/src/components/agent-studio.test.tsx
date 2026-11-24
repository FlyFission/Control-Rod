import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_STUDIO_STORAGE_KEY,
  STARTER_AGENTS,
  deleteCustomAgent,
  loadCustomAgents,
  renderAgentPackMarkdown,
  resetCustomAgents,
  resolveAgentModel,
  saveCustomAgents,
  toggleCustomAgent,
  upsertCustomAgent,
} from "../lib/agentStudio.js";
import { createDraftFromPreset, type CastingSheetDraft } from "../lib/casting.js";
import { AgentStudio } from "./AgentStudio.js";
import { CastingDesk } from "./CastingDesk.js";

function WiredCastingAndStudio() {
  const [draft, setDraft] = useState<CastingSheetDraft>(() => createDraftFromPreset("balanced"));
  return (
    <>
      <CastingDesk draft={draft} onDraftChange={setDraft} />
      <AgentStudio castingDraft={draft} />
    </>
  );
}

describe("agentStudio helpers", () => {
  it("resolves @role aliases live against any CastingSheetDraft", () => {
    const balanced = createDraftFromPreset("balanced");
    const deep = createDraftFromPreset("deep");
    const reviewer = STARTER_AGENTS.find((a) => a.id === "security-reviewer")!;

    const rBalanced = resolveAgentModel(reviewer, balanced);
    expect(rBalanced.roleAlias).toBe("@checker");
    expect(rBalanced.model.id).toBe("openai/gpt-6.2-sol");
    expect(rBalanced.model.vendor).toBe("OpenAI");
    expect(rBalanced.effort).toBe("high");

    const rDeep = resolveAgentModel(reviewer, deep);
    expect(rDeep.model.id).toBe("openai/gpt-6.2-astra");
    expect(rDeep.effort).toBe("high");
  });

  it("refuses deletion of built-in starter agents and supports CRUD on custom agents", () => {
    const initial = resetCustomAgents();
    expect(deleteCustomAgent(initial, "security-reviewer")).toHaveLength(initial.length);

    const added = upsertCustomAgent(initial, {
      name: "Piping Spec Auditor",
      description: "Checks piping material classes against line lists.",
      mode: "capital-projects",
      roleAlias: "@checker",
      instructions: "Verify flange rating and wall thickness schedules.",
    });
    expect(added).toHaveLength(initial.length + 1);
    const created = added.find((a) => a.id === "piping-spec-auditor");
    expect(created).toBeTruthy();
    expect(created?.builtIn).toBe(false);

    const toggled = toggleCustomAgent(added, "piping-spec-auditor");
    expect(toggled.find((a) => a.id === "piping-spec-auditor")?.enabled).toBe(false);

    const removed = deleteCustomAgent(toggled, "piping-spec-auditor");
    expect(removed).toHaveLength(initial.length);
  });

  it("renders deterministic YAML frontmatter and instructions", () => {
    const calcVerifier = STARTER_AGENTS.find((a) => a.id === "calc-verifier")!;
    const md = renderAgentPackMarkdown(calcVerifier);
    expect(md).toContain("---\n");
    expect(md).toContain("id: calc-verifier\n");
    expect(md).toContain('name: "Calculation Verifier"\n');
    expect(md).toContain("mode: capital-projects\n");
    expect(md).toContain('role: "@checker"\n');
    expect(md).toContain("Verify every engineering number");
  });

  it("falls back cleanly when localStorage is unavailable or corrupt", () => {
    const throwingStorage = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("quota");
      },
    };
    expect(loadCustomAgents(throwingStorage)).toHaveLength(STARTER_AGENTS.length);
    expect(saveCustomAgents(STARTER_AGENTS, throwingStorage)).toBe(false);

    const corruptStorage = {
      getItem: () => "{broken-json",
    };
    expect(loadCustomAgents(corruptStorage)).toHaveLength(STARTER_AGENTS.length);
  });
});

describe("AgentStudio component", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders starter specialists for both Software and Capital Projects modes with honest draft notice", () => {
    render(<AgentStudio castingDraft={createDraftFromPreset("balanced")} />);

    expect(screen.getByRole("heading", { name: "Custom agent studio" })).toBeTruthy();
    expect(screen.getByText(/saved locally in this browser as a/i)).toBeTruthy();
    expect(screen.getByText(/never modifies CLI configs and stores no API keys or tokens/i)).toBeTruthy();

    // Software starters
    const secCard = screen.getByRole("article", { name: "Security Reviewer" });
    expect(within(secCard).getByText("Software")).toBeTruthy();
    expect(within(secCard).getByText("@checker")).toBeTruthy();
    expect(within(secCard).queryByRole("button", { name: /Delete/i })).toBeNull();

    const testCard = screen.getByRole("article", { name: "Test Hardener" });
    expect(within(testCard).getByText("Software")).toBeTruthy();
    expect(within(testCard).getByText("@author")).toBeTruthy();

    // Capital Projects starters
    const calcCard = screen.getByRole("article", { name: "Calculation Verifier" });
    expect(within(calcCard).getByText("Capital Projects")).toBeTruthy();
    expect(within(calcCard).getByText("@checker")).toBeTruthy();

    const sheetCard = screen.getByRole("article", { name: "Datasheet Extractor" });
    expect(within(sheetCard).getByText("Capital Projects")).toBeTruthy();
    expect(within(sheetCard).getByText("@planner")).toBeTruthy();
  });

  it("updates resolved model badges live when switching presets in CastingDesk", async () => {
    const user = userEvent.setup();
    render(<WiredCastingAndStudio />);

    const secCard = screen.getByRole("article", { name: "Security Reviewer" });
    const testCard = screen.getByRole("article", { name: "Test Hardener" });
    const sheetCard = screen.getByRole("article", { name: "Datasheet Extractor" });

    // Balanced preset initially
    expect(within(secCard).getByText("Codex GPT-6.2 Sol")).toBeTruthy();
    expect(within(testCard).getByText("Claude Sonnet 5.5")).toBeTruthy();
    expect(within(sheetCard).getByText("Claude Opus 4.6")).toBeTruthy();

    // Switch to Deep / High-Assurance preset on CastingDesk
    const presets = screen.getByRole("group", { name: "Casting presets" });
    await user.click(within(presets).getByRole("button", { name: "Deep / High-Assurance" }));

    expect(within(secCard).getByText("Codex GPT-6.2 Astra")).toBeTruthy();
    expect(within(testCard).getByText("Claude Opus 4.6")).toBeTruthy();
    expect(within(sheetCard).getByText("max")).toBeTruthy();

    // Switch to Local-Only preset
    await user.click(within(presets).getByRole("button", { name: "Local-Only (Restricted Lane)" }));
    expect(within(secCard).getByText("DeepSeek R1 32B (Ollama)")).toBeTruthy();
    expect(within(testCard).getByText("Qwen 2.5 Coder 32B (Ollama)")).toBeTruthy();
  });

  it("creates a custom specialist, toggles enabled state, persists to localStorage, and deletes it", async () => {
    const user = userEvent.setup();
    render(<AgentStudio castingDraft={createDraftFromPreset("balanced")} />);

    await user.click(screen.getByRole("button", { name: "+ New specialist" }));

    await user.type(screen.getByLabelText("Specialist name"), "HAZOP Scribe");
    await user.selectOptions(screen.getByLabelText("Mode"), "capital-projects");
    await user.selectOptions(screen.getByLabelText("Role binding"), "@quick");
    await user.type(screen.getByLabelText("Short description"), "Summarizes node deviations and safeguards.");
    await user.type(
      screen.getByLabelText("Instructions"),
      "Capture guide word, deviation, cause, consequence, and action owner.",
    );

    await user.click(screen.getByRole("button", { name: "Save specialist" }));

    const customCard = screen.getByRole("article", { name: "HAZOP Scribe" });
    expect(within(customCard).getByText("Capital Projects")).toBeTruthy();
    expect(within(customCard).getByText("@quick")).toBeTruthy();
    expect(within(customCard).getByText("Claude Haiku 4.5")).toBeTruthy();

    // Toggle disabled
    const toggleBtn = within(customCard).getByRole("switch", { name: "Disable HAZOP Scribe" });
    expect(toggleBtn.getAttribute("aria-checked")).toBe("true");
    await user.click(toggleBtn);
    expect(within(customCard).getByRole("switch", { name: "Enable HAZOP Scribe" }).getAttribute("aria-checked")).toBe(
      "false",
    );

    // Persisted in localStorage
    const raw = window.localStorage.getItem(AGENT_STUDIO_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    const stored = parsed.agents.find((a: { id: string }) => a.id === "hazop-scribe");
    expect(stored).toMatchObject({
      id: "hazop-scribe",
      name: "HAZOP Scribe",
      mode: "capital-projects",
      roleAlias: "@quick",
      enabled: false,
      builtIn: false,
    });

    // Delete user-created specialist
    await user.click(within(customCard).getByRole("button", { name: "Delete HAZOP Scribe" }));
    expect(screen.queryByRole("article", { name: "HAZOP Scribe" })).toBeNull();
  });

  it("expands Pack preview with YAML frontmatter role and instructions", async () => {
    const user = userEvent.setup();
    render(<AgentStudio castingDraft={createDraftFromPreset("balanced")} />);

    const calcCard = screen.getByRole("article", { name: "Calculation Verifier" });
    const previewBtn = within(calcCard).getByRole("button", { name: "Pack preview" });
    expect(previewBtn.getAttribute("aria-expanded")).toBe("false");

    await user.click(previewBtn);
    expect(previewBtn.getAttribute("aria-expanded")).toBe("true");

    const codeBlock = calcCard.querySelector("pre code");
    expect(codeBlock).toBeTruthy();
    expect(codeBlock?.textContent).toContain('role: "@checker"');
    expect(codeBlock?.textContent).toContain("mode: capital-projects");
    expect(codeBlock?.textContent).toContain("Verify every engineering number");
    expect(within(calcCard).getByRole("button", { name: "Copy Calculation Verifier pack markdown" })).toBeTruthy();
  });

  it("contains zero API-key or token inputs even when the new specialist form is open", async () => {
    const user = userEvent.setup();
    const { container } = render(<AgentStudio castingDraft={createDraftFromPreset("balanced")} />);

    // No inputs when collapsed
    expect(container.querySelectorAll("input")).toHaveLength(0);

    // Open form and verify zero password/secret/api-key/token inputs exist
    await user.click(screen.getByRole("button", { name: "+ New specialist" }));
    const inputs = [...container.querySelectorAll("input")];
    expect(inputs.length).toBe(2); // Specialist name + Short description only
    for (const input of inputs) {
      expect(input.type).not.toBe("password");
      expect(`${input.id} ${input.name} ${input.placeholder}`).not.toMatch(/api[_ -]?key|token|secret|password/i);
    }
  });
});
