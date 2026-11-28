import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import type { WorkspaceProject } from "../api/types.js";
import { type Passkeys, decide } from "../lib/decide.js";
import {
  ALL_SIGNED,
  cardFlowLine,
  DEFAULT_SIGNING_PRESET,
  noteSigned,
  passkeyHint,
  presetOf,
  projectSteps,
  signedToday,
  signingPreset,
  SIGNING_PRESETS,
} from "../lib/signing.js";
import { SigningSettings } from "./SigningSettings.js";
import { AutonomyOffer } from "../features/board/AutonomyOffer.js";

const project: WorkspaceProject = {
  id: "prj_test", name: "Project", mode: "software", status: "active", repo: "",
  repoStrategy: "worktree", workspaceRoot: "", lane: "internal",
  author: { ecosystem: "claude", model: "default", reasoning: "default" },
  checker: { ecosystem: "codex", model: "default", reasoning: "default" },
  createdAt: "2026-11-22T00:00:00Z",
};
const keys = (signed: unknown[]): Passkeys => ({
  async get(o) { signed.push(o); return { id: "cred-1", response: { signature: "sig" }, type: "public-key" }; },
  async create() { return {}; },
});

/** Records the admin command the page signs and sends. */
function adminCommand(name: string) {
  const sent: { options?: unknown; command?: unknown } = {};
  server.use(
    http.post(`*/admin/commands/${name}/options`, async ({ request }) => {
      sent.options = await request.json();
      return HttpResponse.json({ options: { challenge: "c" } });
    }),
    http.post(`*/admin/commands/${name}`, async ({ request }) => {
      sent.command = await request.json();
      return HttpResponse.json({ project_id: "prj_test", version: 1 });
    }),
  );
  return sent;
}

beforeEach(() => localStorage.clear());

describe("the default and the words for it", () => {
  it("makes Balanced the default: cards start on their own and every accept is signed", () => {
    expect(DEFAULT_SIGNING_PRESET).toBe("balanced");
    expect(signingPreset(DEFAULT_SIGNING_PRESET).steps).toEqual({ release: "auto", accept: "passkey", return: "click", reject: "click" });
  });

  it("says what each preset does in the words the board and New Work show", () => {
    expect(cardFlowLine(signingPreset("balanced").steps)).toBe(
      "It starts on its own once the plan is drafted, and you sign each accept with your passkey before the work is handed over.",
    );
    expect(cardFlowLine(signingPreset("light").steps)).toBe(
      "It starts on its own once the plan is drafted, and work that passes its check is accepted and handed over on its own.",
    );
    expect(cardFlowLine(ALL_SIGNED)).toBe(
      "Nothing starts until you sign its release with your passkey, and you sign each accept with your passkey before the work is handed over.",
    );
    expect(cardFlowLine({ ...ALL_SIGNED, release: "click", accept: "click" })).toBe(
      "It starts when you press Release, and you press Accept before the work is handed over.",
    );
  });

  it("matches each preset's own words to its steps", () => {
    for (const p of SIGNING_PRESETS) {
      expect(/start on their own/.test(p.detail)).toBe(p.steps.release === "auto");
      expect(/accepted and handed over on its own/.test(p.detail)).toBe(p.steps.accept === "auto");
      expect(/sign each accept|sign every release, accept/.test(p.detail)).toBe(p.steps.accept === "passkey");
    }
  });

  it("signs every step for a project with no settings, or a Nuclear-grade one", () => {
    expect(projectSteps(project)).toEqual(ALL_SIGNED);
    const light = { preset: "light" as const, steps: signingPreset("light").steps, version: 1, signed_by: "ben", signed_at: "2026-11-25T00:00:00Z" };
    expect(projectSteps({ ...project, signing: light })).toEqual(light.steps);
    expect(projectSteps({ ...project, mode: "nuclear-grade", signing: light })).toEqual(ALL_SIGNED);
  });
});

describe("signing helpers", () => {
  it("names a set of steps by its preset, or custom", () => {
    expect(presetOf(SIGNING_PRESETS[0]!.steps)).toBe("light");
    expect(presetOf({ ...SIGNING_PRESETS[0]!.steps, accept: "click" })).toBe("custom");
  });

  it("counts passkey steps per kind per day and offers to let them go after three", () => {
    const day = new Date("2026-11-25T10:00:00Z");
    expect(noteSigned("accept", day)).toBe(1);
    noteSigned("accept", day);
    expect(noteSigned("accept", day)).toBe(3);
    expect(signedToday("accept", new Date("2026-11-26T10:00:00Z"))).toBe(0);
    expect(passkeyHint("accept", "Accept", "balanced", 3)).toBe("You've signed 3 accepts today. Let these go without a passkey?");
    expect(passkeyHint("accept", "Accept", "balanced", 1)).toBe("Asks for your passkey because your settings sign accept.");
    expect(passkeyHint("accept", "Accept", undefined, 0)).toMatch(/no signing settings yet/);
  });
});

describe("a step the settings let go with a press", () => {
  it("sends the decision with the digest the person saw and asks for no passkey", async () => {
    let body: Record<string, unknown> | undefined;
    let optionsAsked = false;
    server.use(
      http.post("*/packages/WP-1/decisions/options", () => { optionsAsked = true; return HttpResponse.json({}); }),
      http.post("*/packages/WP-1/decisions", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ kind: "return" }, { status: 201 });
      }),
    );
    const signed: unknown[] = [];
    const digest = { algorithm: "sha256" as const, value: "a".repeat(64) };
    await decide({ packageId: "WP-1", revision: 0, kind: "return", reason: "Needs a plan", shownDigest: digest, noPasskey: true }, keys(signed));
    expect(optionsAsked).toBe(false);
    expect(signed).toEqual([]);
    expect(body).toEqual({ kind: "return", package_revision: 0, reason: "Needs a plan", expected_subject_digest: digest });
  });
});

describe("What needs your passkey", () => {
  it("starts at Balanced for a project that has not chosen, and signs the choice once", async () => {
    const sent = adminCommand("project.set-signing-policy");
    const signed: unknown[] = [];
    await renderPage(<SigningSettings project={project} passkeys={keys(signed)} />);
    expect((screen.getByRole("radio", { name: /Balanced/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: /Light/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole("radio", { name: /Balanced/ }).closest("label")!.textContent).toContain("Recommended");
    expect(screen.getByText(/Until you save, every step on this project asks for your passkey/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign and save" }));
    await waitFor(() => expect(sent.command).toBeDefined());
    expect(signed).toHaveLength(1);
    expect(sent.command).toMatchObject({ payload: { project_id: "prj_test", preset: "balanced" } });
  });

  it("says plainly that Light starts and accepts work on its own", async () => {
    await renderPage(<SigningSettings project={project} />);
    const light = screen.getByRole("radio", { name: /Light/ }).closest("label")!.textContent!;
    expect(light).toMatch(/Cards start on their own/);
    expect(light).toMatch(/accepted and handed over on its own/);
    expect(light).not.toContain("Recommended");
  });

  it("sends each step when they no longer match a preset", async () => {
    const sent = adminCommand("project.set-signing-policy");
    const user = userEvent.setup();
    await renderPage(<SigningSettings project={{ ...project, signing: { preset: "light", steps: SIGNING_PRESETS[0]!.steps, version: 1, signed_by: "ben", signed_at: "2026-11-25T00:00:00Z" } }} passkeys={keys([])} />);
    expect((screen.getByRole("button", { name: "Sign and save" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByText(/Advanced: choose each step/));
    await user.selectOptions(screen.getByLabelText("Accept work that passed its check"), "click");
    await user.click(screen.getByRole("button", { name: "Sign and save" }));
    await waitFor(() => expect(sent.command).toBeDefined());
    expect(sent.command).toMatchObject({ payload: { project_id: "prj_test", steps: { release: "auto", accept: "click", return: "click", reject: "click" } } });
  });

  it("offers no choice on a Nuclear-grade project", async () => {
    await renderPage(<SigningSettings project={{ ...project, mode: "nuclear-grade" }} />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText(/is Nuclear-grade, so every release, accept, return and reject is signed/)).toBeTruthy();
  });
});

describe("the board's one-time offer", () => {
  it("turns on the default, Balanced, with one passkey tap", async () => {
    const sent = adminCommand("project.set-signing-policy");
    const signed: unknown[] = [];
    await renderPage(<AutonomyOffer project={project} passkeys={keys(signed)} />);
    expect(screen.getByText(/You would still sign each accept with your passkey/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Turn on (one passkey tap)" }));
    await waitFor(() => expect(sent.command).toMatchObject({ payload: { project_id: "prj_test", preset: "balanced" } }));
    expect(signed).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Let cards start on their own" })).toBeNull());
  });

  it("is not shown once a project has chosen", async () => {
    await renderPage(<AutonomyOffer project={{ ...project, signing: { preset: "everything", steps: SIGNING_PRESETS[2]!.steps, version: 1, signed_by: "ben", signed_at: "2026-11-25T00:00:00Z" } }} />);
    expect(screen.queryByRole("region", { name: "Let cards start on their own" })).toBeNull();
  });
});
