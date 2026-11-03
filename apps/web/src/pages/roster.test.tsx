import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { RosterView } from "../api/types.js";
import type { Passkeys } from "../lib/decide.js";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { Roster } from "./Roster.js";

/** The Roster (plan task 5.1; specification 12 and 21, WB-12). */

const A = { algorithm: "sha256" as const, value: "a".repeat(64) };
const B = { algorithm: "sha256" as const, value: "b".repeat(64) };
const passkeys: Passkeys = { get: async () => ({ signed: true }), create: async () => ({}) };
const pin = (role: string, digest = A) => ({ id: `pin_${role}`, org_id: "org", role, runtime: "claude", artifact_version_id: "rav", artifact_digest: digest, status: "active" });

const view = (over: Partial<RosterView> = {}): RosterView => ({
  roles: [
    { role: "intake", what: "Reads a capture and drafts a work package", pinnable: true, baselines: [], runs: 0, pins: [], rollback: [] },
    { role: "requirements-preparer", what: "Prepares the requirements a package will be held to", pinnable: false, baselines: [], runs: 0, pins: [], rollback: [] },
    {
      role: "author", what: "Does the work of a released package", pinnable: true, baselines: [{ runtime: "claude", baseline: "author-claude" }], runs: 3,
      last_run_at: new Date().toISOString(), pins: [pin("author")] as never, rollback: [{ runtime: "claude", current: A, restore: B }],
    },
  ] as never,
  baselines: [{ id: "author-claude", roles: ["author"], runs: 3, last_run_at: new Date().toISOString(), statuses: { succeeded: 2, failed: 1 } }],
  baselines_recorded: false,
  versions: [
    { runtime: "claude", version: "2.1.0", digest: A, last_passed_at: new Date().toISOString(), pinned_for: ["author"] },
    { runtime: "claude", version: "2.2.0", digest: B, last_passed_at: new Date().toISOString(), pinned_for: [] },
  ],
  sandbox: { policies: [], launched: [{ runtime: "claude", sandbox: "none", run_id: "R-1", at: new Date().toISOString() }, { runtime: "codex", sandbox: "workspace-write", run_id: "R-2", at: new Date().toISOString() }] },
  ...over,
});
const allowed = (command: string, ok = true) => ({ command, label: command, allowed: ok, signature: "direct", ...(ok ? {} : { reason: "This needs administrator authority" }) });

describe("Roster", () => {
  const sent: { name: string; body: any }[] = [];
  beforeEach(() => {
    sent.length = 0;
    server.use(
      http.get("*/runtimes", () => HttpResponse.json({ runtimes: [], pins: [pin("author")] })),
      http.get("*/roster", () => HttpResponse.json(view())),
      http.get("*/admin", () => HttpResponse.json({ actions: [allowed("runtime.pin"), allowed("runtime.rollback")], commands: [], projects: [] })),
      http.post("*/admin/commands/:name/options", () => HttpResponse.json({ subject_digest: { algorithm: "sha256", value: "c".repeat(64) }, options: {} })),
      http.post("*/admin/commands/:name", async ({ params, request }) => {
        sent.push({ name: String(params["name"]), body: await request.json() });
        return HttpResponse.json({ pins: [] });
      }),
    );
  });

  it("states each role's recorded baselines and pins, and that a role nothing has run names none", async () => {
    await renderPage(<Roster passkeys={passkeys} />);
    const roles = await screen.findByRole("region", { name: "Roles" });
    const author = within(roles).getByRole("row", { name: /Author/ });
    expect(author.textContent).toContain("author-claude on claude");
    expect(author.textContent).toContain(`claude sha256:${"a".repeat(12)}`);
    expect(within(roles).getByRole("row", { name: /^Intake/ }).textContent).toContain("Nothing has run it yet");
    expect(within(roles).getByRole("row", { name: /Requirements preparer/ }).textContent).toContain("Not pinnable");
  });

  it("pins a version for exactly the roles chosen, stating what changes, signed", async () => {
    const user = userEvent.setup();
    await renderPage(<Roster passkeys={passkeys} />);
    const versions = await screen.findByRole("region", { name: "Versions a pin may name" });
    const row = within(versions).getByRole("row", { name: /2\.2\.0/ });
    expect(row.textContent).toContain("Intake, author and pre-check runs on claude must then launch exactly this file");
    await user.selectOptions(within(row).getByRole("combobox", { name: "Roles" }), "author");
    // Scoped to the runtime it pins: other runtimes are untouched.
    expect(row.textContent).toContain("Author runs on claude must then launch exactly this file, and wait while the installed claude is a different one. Runs on other runtimes are unaffected.");
    await user.click(within(row).getByRole("button", { name: "Sign and pin claude 2.2.0" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ name: "runtime.pin", body: { payload: { runtime: "claude", artifact_digest: "b".repeat(64), role: "author" }, assertion: { signed: true } } });
  });

  it("shows what a rollback restores, signs both artifacts, and shows the control plane's refusal as given", async () => {
    let body: any;
    server.use(http.post("*/admin/commands/:name", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ code: "pin-changed", message: "The claude author pins changed since you looked; review them again before rolling back" }, { status: 409 });
    }));
    const user = userEvent.setup();
    await renderPage(<Roster passkeys={passkeys} />);
    const author = within(await screen.findByRole("region", { name: "Roles" })).getByRole("row", { name: /Author/ });
    expect(author.textContent).toContain(`A rollback restores sha256:${"b".repeat(12)} in place of sha256:${"a".repeat(12)}.`);
    await user.click(within(author).getByRole("button", { name: "Sign and roll back claude for author" }));
    expect(await screen.findByText("The claude author pins changed since you looked; review them again before rolling back")).toBeTruthy();
    expect(body.payload).toEqual({ runtime: "claude", roles: [{ role: "author", current: "a".repeat(64), restore: "b".repeat(64) }] });
  });

  it("offers pinning only to someone who may, saying why not", async () => {
    server.use(http.get("*/admin", () => HttpResponse.json({ actions: [allowed("runtime.pin", false), allowed("runtime.rollback", false)], commands: [], projects: [] })));
    await renderPage(<Roster passkeys={passkeys} />);
    const versions = await screen.findByRole("region", { name: "Versions a pin may name" });
    await waitFor(() => expect((within(versions).getAllByRole("button")[0] as HTMLButtonElement).disabled).toBe(true));
    expect(within(versions).getByText("This needs administrator authority")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Sign and roll back claude for author" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says baselines are not yet controlled items, and states a requested sandbox as a request, never as confinement", async () => {
    await renderPage(<Roster passkeys={passkeys} />);
    const baselines = await screen.findByRole("region", { name: "Baselines" });
    expect(baselines.textContent).toContain("baselines are not yet controlled items with their own approved revisions");
    expect(within(baselines).getByRole("row", { name: /author-claude/ }).textContent).toContain("1 failed, 2 succeeded");
    const sandbox = screen.getByRole("region", { name: "Sandbox policies" });
    expect(sandbox.textContent).toContain("No sandbox policy is recorded yet");
    expect(within(sandbox).getByRole("row", { name: /^claude/ }).textContent).toContain("None requested: tier none, the interim state; agent actions are not confined");
    expect(within(sandbox).getByRole("row", { name: /^codex/ }).textContent).toContain('Requested "workspace-write" from the runtime\'s own sandbox. Whether that isolation was achieved is not verified');
    expect(sandbox.textContent).not.toContain("was confined");
  });
});
