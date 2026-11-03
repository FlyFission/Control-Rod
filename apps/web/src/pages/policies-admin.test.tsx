import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { AdminView } from "../api/types.js";
import type { Passkeys } from "../lib/decide.js";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { BudgetsSection, MembersSection, PolicySection, QualificationsSection, parseLicenses } from "../features/admin/AdminSections.js";
import { Policies } from "./Policies.js";
import { SignIn } from "./SignIn.js";

/** Policies and Administration screens over the administrative commands (plan task 5.4; WB-05). */

const passkeys: Passkeys = { get: async () => ({ signed: true }), create: async () => ({ created: true }) };
const allow = (command: string, label: string, signature: "direct" | "none" = "direct") => ({ command, label, allowed: true, signature });
const refuse = (command: string, label: string) => ({ command, label, allowed: false, signature: "direct", reason: "This needs administrator authority", change: "Ask an administrator to issue it." });

function view(over: Partial<AdminView> = {}): AdminView {
  return {
    me: { userName: "ben", memberId: "mem_ben", orgId: "org_local" },
    bootstrap: false,
    qualification: null,
    members: [
      { id: "mem_ben", org_id: "org_local", user_name: "ben", display_name: "Ben", status: "active" },
      { id: "mem_dora", org_id: "org_local", user_name: "dora", display_name: "Dora", status: "active" },
    ],
    projects: [{ id: "prj_1", org_id: "org_local", name: "Plant A", mode: "capital-projects", default_rigor: "standard", lanes: ["internal"], qa_overlays: [], autonomy_level: 0, status: "active" }],
    policy: { settings: { autonomy_ceiling: "2" }, hardware_attestation_formats: [] } as never,
    themes: [],
    commands: [],
    actions: [
      allow("member.enroll", "Enroll a member"), allow("member.invite", "Invite a member"), allow("member.suspend", "Suspend a member"),
      allow("member.reactivate", "Reactivate a member"), allow("member.remove", "Remove a member"), allow("credential.revoke", "Revoke a passkey"),
      allow("qualification.issue", "Issue a qualification"), refuse("qualification.revoke", "Revoke a qualification"),
      allow("policy.propose", "Propose a policy change", "none"), allow("policy.approve", "Approve a policy change"),
      allow("marking.propose-declassification", "Propose a declassification", "none"), allow("marking.approve-declassification", "Approve a declassification"),
      allow("budget.set", "Set a budget"),
    ] as never,
    floors: [],
    registry: {
      qualifications: [], delegations: [], bindings: [], budgets: [],
      credentials: [{ id: "cred_rec", credential_id: "cred-dora", member_id: "mem_dora", revoked: false, registered_at: new Date("2026-10-01T09:00:00Z").toISOString(), hardware_floor: { eligible: true } }],
      change_requests: [
        { id: "cr_1", org_id: "org_local", kind: "policy-change", status: "proposed", reason: "Alert budgets at 80", subject_digest: { algorithm: "sha256", value: "a".repeat(64) }, impact: [],
          proposed_by: { kind: "human", id: "ben" }, proposal: { settings: { budget_near_percent: "80" }, hardware_attestation_formats: [] } },
        { id: "cr_2", org_id: "org_local", kind: "declassification", status: "proposed", reason: "Public spec", subject_digest: { algorithm: "sha256", value: "b".repeat(64) }, impact: ["package/WP-2"],
          proposed_by: { kind: "human", id: "ben" }, proposal: { object_kind: "package", object_id: "WP-1", version: 2, from: "proprietary", lane: "internal" } },
      ],
    } as never,
    ...over,
  };
}

const sent: { name: string; body: any }[] = [];
beforeEach(() => {
  sent.length = 0;
  server.use(
    http.post("*/admin/commands/:name/options", () => HttpResponse.json({ subject_digest: { algorithm: "sha256", value: "c".repeat(64) }, options: {} })),
    http.post("*/admin/commands/:name", async ({ params, request }) => {
      const body = await request.json();
      sent.push({ name: String(params["name"]), body });
      if (params["name"] === "member.invite") return HttpResponse.json({ member_id: "mem_dora", invitation: { token: "tok_abc", expires_at: new Date("2026-11-10T00:00:00Z").toISOString() } });
      return HttpResponse.json({ ok: true });
    }),
  );
});
const form = (name: string) => screen.getByRole("form", { name });

describe("administration forms", () => {
  it("states exactly what a command changes before it is signed, and signs exactly that", async () => {
    const user = userEvent.setup();
    await renderPage(<MembersSection view={view()} passkeys={passkeys} />);
    const f = form("Suspend a member");
    const sign = within(f).getByRole("button", { name: "Sign with your passkey and suspend" }) as HTMLButtonElement;
    expect(sign.disabled).toBe(true);
    expect(within(f).getByText("Fill in the required fields to see exactly what this changes.")).toBeTruthy();
    await user.selectOptions(within(f).getByRole("combobox", { name: "Member (required)" }), "mem_dora");
    await user.type(within(f).getByRole("textbox", { name: "Why (required)" }), "Left the project");
    expect(within(f).getByText(/^Suspends Dora: their sessions end/)).toBeTruthy();
    await user.click(sign);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ name: "member.suspend", body: { payload: { member_id: "mem_dora", reason: "Left the project" }, assertion: { signed: true } } });
  });

  it("gives an invitation link carrying the token in the fragment, shown once", async () => {
    const user = userEvent.setup();
    await renderPage(<MembersSection view={view()} passkeys={passkeys} />);
    const f = form("Invite a member");
    await user.selectOptions(within(f).getByRole("combobox", { name: "Member (required)" }), "mem_dora");
    await user.click(within(f).getByRole("button", { name: "Sign with your passkey and invite" }));
    expect(await within(f).findByText(`${window.location.origin}/#invitation=tok_abc`)).toBeTruthy();
  });

  it("revokes a passkey named by its owner and registration, never a raw id", async () => {
    const user = userEvent.setup();
    await renderPage(<MembersSection view={view()} passkeys={passkeys} />);
    const f = form("Revoke a passkey");
    const pick = within(f).getByRole("combobox", { name: "Passkey (required)" });
    expect(within(pick).getAllByRole("option").map((o) => o.textContent)).toContain(`Dora, registered ${new Date("2026-10-01T09:00:00Z").toLocaleString()}, hardware`);
    await user.selectOptions(pick, "cred-dora");
    await user.type(within(f).getByRole("textbox", { name: "Why (required)" }), "Lost laptop");
    expect(within(f).getByText(/^Revokes Dora's passkey registered .*: it can no longer sign in or sign\. Seals and signatures it made before stay checkable\.$/)).toBeTruthy();
  });

  it("shows a command the viewer may not run with the reason, and nothing to sign", async () => {
    await renderPage(<QualificationsSection view={view()} passkeys={passkeys} />);
    const f = form("Revoke a qualification");
    expect(within(f).getByText(/This needs administrator authority/)).toBeTruthy();
    expect(within(f).getByText("Ask an administrator to issue it.")).toBeTruthy();
    expect((within(f).getByRole("button", { name: /Sign with your passkey/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("issues a qualification with roles, authorities and parsed licenses, refusing a malformed license", async () => {
    expect(parseLicenses(["US-SC, 12345, 2027-06-30, mechanical"])).toEqual([{ jurisdiction: "US-SC", number: "12345", expires_on: "2027-06-30", discipline: "mechanical" }]);
    expect(parseLicenses(["US-SC, 12345"])).toBeNull();
    const user = userEvent.setup();
    await renderPage(<QualificationsSection view={view()} passkeys={passkeys} />);
    const f = form("Issue a qualification");
    await user.selectOptions(within(f).getByRole("combobox", { name: "Member (required)" }), "mem_dora");
    await user.click(within(f).getByRole("checkbox", { name: "checker" }));
    await user.click(within(f).getByRole("checkbox", { name: "material" }));
    await user.type(within(f).getByRole("textbox", { name: "Licenses" }), "US-SC, 12345");
    await user.type(within(f).getByRole("textbox", { name: "Why (required)" }), "Checker for Plant A");
    // A malformed license line: nothing to sign until it is right.
    expect(within(f).getByText("Fill in the required fields to see exactly what this changes.")).toBeTruthy();
    await user.type(within(f).getByRole("textbox", { name: "Licenses" }), ", 2027-06-30");
    expect(within(f).getByText(/^Replaces Dora's qualification with: roles checker; no authority; grades material; no discipline; 1 license\./)).toBeTruthy();
    await user.click(within(f).getByRole("button", { name: "Sign with your passkey and issue" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body.payload).toEqual({ member_id: "mem_dora", roles: ["checker"], authorities: [], grades: ["material"], disciplines: [],
      licenses: [{ jurisdiction: "US-SC", number: "12345", expires_on: "2027-06-30" }], reason: "Checker for Plant A" });
  });

  it("proposes policy unsigned, and approves a proposal showing exactly what it puts in force, signed", async () => {
    const user = userEvent.setup();
    await renderPage(<PolicySection view={view()} passkeys={passkeys} />);
    const p = form("Propose a policy change");
    // The form starts from the policy in force.
    expect((within(p).getByRole("combobox", { name: "Autonomy ceiling" }) as HTMLSelectElement).value).toBe("2");
    await user.type(within(p).getByRole("textbox", { name: "Budget near line, in whole percent" }), "80");
    await user.type(within(p).getByRole("textbox", { name: "Why (required)" }), "Alert budgets at 80");
    await user.click(within(p).getByRole("button", { name: "Propose" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ name: "policy.propose", body: { payload: { policy: { hardware_attestation_formats: [], settings: { autonomy_ceiling: "2", budget_near_percent: "80" } }, reason: "Alert budgets at 80" } } });
    const a = form("Approve a policy change");
    await user.selectOptions(within(a).getByRole("combobox", { name: "Proposal (required)" }), "cr_1");
    expect(within(a).getByText('Puts in force the proposed policy set: settings {"budget_near_percent":"80"}, hardware attestation formats []. Proposed because: Alert budgets at 80')).toBeTruthy();
    const d = form("Approve a declassification");
    await user.selectOptions(within(d).getByRole("combobox", { name: "Proposal (required)" }), "cr_2");
    expect(within(d).getByText("Lowers package WP-1 from proprietary to internal. Affected downstream: package/WP-2. Proposed because: Public spec")).toBeTruthy();
  });

  it("sets a hard cap on run time, saying it holds work before it starts", async () => {
    const user = userEvent.setup();
    await renderPage(<BudgetsSection view={view()} passkeys={passkeys} />);
    const f = form("Set a budget");
    await user.selectOptions(within(f).getByRole("combobox", { name: "Applies to (required)" }), "organization");
    await user.selectOptions(within(f).getByRole("combobox", { name: "Mode (required)" }), "hard-cap");
    await user.selectOptions(within(f).getByRole("combobox", { name: "Unit (required)" }), "minute");
    await user.type(within(f).getByRole("textbox", { name: "Limit (required)" }), "600");
    await user.selectOptions(within(f).getByRole("combobox", { name: "Period (required)" }), "P1W");
    expect(within(f).getByText("Sets a hard-cap budget of 600 minutes of run time per week (rolling) on the organization. Work that would pass it is held before it starts.")).toBeTruthy();
    await user.click(within(f).getByRole("button", { name: "Sign with your passkey and set" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body.payload).toEqual({ scope: "organization", scope_id: "org_local", mode: "hard-cap", limit: { value: "600", unit: "minute" }, period: "P1W" });
  });

  it("offers the first Member their own first qualification while no administrator exists", async () => {
    server.use(http.get("*/admin", () => HttpResponse.json(view({ bootstrap: true }))));
    const user = userEvent.setup();
    await renderPage(<Policies passkeys={passkeys} />);
    const f = await screen.findByRole("form", { name: "Issue your own first qualification" });
    await user.click(within(f).getByRole("checkbox", { name: "administrator" }));
    await user.type(within(f).getByRole("textbox", { name: "Why (required)" }), "First administrator");
    await user.click(within(f).getByRole("button", { name: "Sign with your passkey and issue it" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body.payload).toMatchObject({ member_id: "mem_ben", authorities: ["administrator"], reason: "First administrator" });
  });
});

describe("accepting an invitation", () => {
  it("registers the invited person's passkey from the link, then clears the token from the address", async () => {
    window.history.replaceState(null, "", "/#invitation=tok_abc");
    let asked: unknown;
    server.use(
      http.post("*/auth/register/options", async ({ request }) => {
        asked = await request.json();
        return HttpResponse.json({ options: { challenge: "c" } });
      }),
      http.post("*/auth/register/verify", () => HttpResponse.json({ registered: true, signed_in: true, user: "dora" })),
    );
    const user = userEvent.setup();
    await renderPage(<SignIn session={{ registered: true, signed_in: false } as never} passkeys={passkeys} />);
    expect(screen.getByRole("heading", { name: "Accept your invitation" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Register my passkey" }));
    await waitFor(() => expect(asked).toEqual({ invitation: "tok_abc" }));
    await waitFor(() => expect(window.location.hash).toBe(""));
  });
});
