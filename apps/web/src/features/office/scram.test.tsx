import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../../test/server.js";
import { renderPage } from "../../test/render.js";
import type { Passkeys } from "../../lib/decide.js";
import { ScramBanner, ScramControl } from "./Scram.js";

/** SCRAM from the office (plan task 4.10; OV-12). */

const passkeys: Passkeys = { get: async () => ({ signed: true }), create: async () => ({}) };
const preview = (scope: string, running: string[], queued: string[], project_id?: string) =>
  ({ scope, ...(project_id ? { project_id } : {}), running_count: running.length, queued_count: queued.length, running, queued, counted_at: new Date().toISOString() });
const digest = (c: string) => c.repeat(64);
const scram = { id: "scr_1", org_id: "org", scope: "organization", pulled_by: "m", reason: "Bad prompt shipped", assertion: {}, quarantine: ["R-1", "R-2"] };

describe("SCRAM", () => {
  it("states the scope and what it stops, counted by the pull's own selection, then signs exactly that (OV-12)", async () => {
    const sent: { name: string; body: unknown }[] = [];
    const asked: string[] = [];
    server.use(
      // The control plane counts with the selection the pull makes: this organization's runs only,
      // restricted work included, and runs the office floor does not draw (an older attempt) too.
      http.get("*/scrams/preview", ({ request }) => {
        const q = new URL(request.url).searchParams;
        asked.push(q.toString());
        return HttpResponse.json(q.get("scope") === "project" ? preview("project", ["R-a"], ["R-c"], "p1") : preview("organization", ["R-a", "R-b", "R-old"], ["R-c"]));
      }),
      http.get("*/admin", () => HttpResponse.json({ projects: [{ id: "p1", name: "Plant A" }] })),
      http.post("*/admin/commands/:name/options", async ({ params, request }) => {
        sent.push({ name: `${String(params["name"])}/options`, body: await request.json() });
        return HttpResponse.json({ subject_digest: { algorithm: "sha256", value: "a".repeat(64) }, options: { challenge: "c" } });
      }),
      http.post("*/admin/commands/:name", async ({ params, request }) => {
        sent.push({ name: String(params["name"]), body: await request.json() });
        return HttpResponse.json({ ...scram, scope: "project", project_id: "p1" });
      }),
    );
    await renderPage(<ScramControl passkeys={passkeys} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "SCRAM" }));
    const dialog = screen.getByRole("dialog", { name: "Pull SCRAM" });
    expect(await within(dialog).findByText(/This stops every running agent in the whole organization where it stands\. Counted at .+: 3 runs running now stop, and 1 queued run is held\./)).toBeTruthy();
    expect(within(dialog).getByText("SCRAM selects again at the moment it fires, so a run that starts before you sign is stopped too.")).toBeTruthy();
    await user.click(within(dialog).getByText("Which runs"));
    expect(within(dialog).getByText("R-old (running)")).toBeTruthy();
    const sign = within(dialog).getByRole("button", { name: "Sign with your passkey and stop" }) as HTMLButtonElement;
    // No reason, no stop.
    expect(sign.disabled).toBe(true);
    await user.click(within(dialog).getByRole("radio", { name: "One project" }));
    expect(within(dialog).getByText("Choose the project to see what this stops.")).toBeTruthy();
    await user.selectOptions(within(dialog).getByRole("combobox"), "p1");
    expect(await within(dialog).findByText(/in the project Plant A where it stands\. Counted at .+: 1 run running now stops, and 1 queued run is held\./)).toBeTruthy();
    expect(asked).toContain("scope=project&project_id=p1");
    await user.type(within(dialog).getByRole("textbox", { name: "Why (required)" }), "Bad prompt shipped");
    await user.click(sign);
    await waitFor(() => expect(sent.map((s) => s.name)).toEqual(["scram.pull/options", "scram.pull"]));
    const payload = { scope: "project", project_id: "p1", reason: "Bad prompt shipped" };
    expect(sent[0]!.body).toEqual({ payload });
    expect(sent[1]!.body).toEqual({ payload, assertion: { signed: true } });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("takes focus when it opens, keeps Tab inside, closes on Escape, and gives focus back", async () => {
    server.use(
      http.get("*/scrams/preview", () => HttpResponse.json(preview("organization", [], []))),
      http.get("*/admin", () => HttpResponse.json({ projects: [] })),
    );
    await renderPage(
      <>
        <button type="button">Behind the dialog</button>
        <ScramControl passkeys={passkeys} />
      </>,
    );
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "SCRAM" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Pull SCRAM" });
    const first = within(dialog).getByRole("radio", { name: "The whole organization" });
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(first);
    // Backwards from the first control lands on the last, never on the page behind.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(cancel);
    // Forwards from the last control lands on the first.
    await user.tab();
    expect(document.activeElement).toBe(first);
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("cannot be cancelled while the signed stop is in flight", async () => {
    let release: (v: Record<string, unknown>) => void = () => {};
    const slow: Passkeys = { get: () => new Promise((r) => (release = r)), create: async () => ({}) };
    server.use(
      http.get("*/scrams/preview", () => HttpResponse.json(preview("organization", ["R-a"], []))),
      http.get("*/admin", () => HttpResponse.json({ projects: [] })),
      http.post("*/admin/commands/:name/options", () => HttpResponse.json({ subject_digest: { algorithm: "sha256", value: "a".repeat(64) }, options: {} })),
      http.post("*/admin/commands/:name", () => HttpResponse.json(scram)),
    );
    await renderPage(<ScramControl passkeys={slow} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "SCRAM" }));
    const dialog = screen.getByRole("dialog", { name: "Pull SCRAM" });
    await user.type(within(dialog).getByRole("textbox", { name: "Why (required)" }), "Bad prompt shipped");
    await user.click(within(dialog).getByRole("button", { name: "Sign with your passkey and stop" }));
    const cancel = (await within(dialog).findByRole("button", { name: "Cancel" })) as HTMLButtonElement;
    await waitFor(() => expect(cancel.disabled).toBe(true));
    // The payload is fixed once it is in flight, so the form that states it cannot change either.
    for (const radio of within(dialog).getAllByRole("radio")) expect(radio.matches(":disabled")).toBe(true);
    expect((within(dialog).getByRole("textbox", { name: "Why (required)" }) as HTMLTextAreaElement).disabled).toBe(true);
    expect(within(dialog).getByRole("button", { name: "Signing and stopping…" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Pull SCRAM" })).toBeTruthy();
    release({ signed: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("fires only once the count is stated; a failed count can be waived explicitly", async () => {
    server.use(
      http.get("*/scrams/preview", () => HttpResponse.json({ code: "unavailable", message: "Down" }, { status: 503 })),
      http.get("*/admin", () => HttpResponse.json({ projects: [] })),
    );
    await renderPage(<ScramControl passkeys={passkeys} patienceMs={60_000} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "SCRAM" }));
    const dialog = screen.getByRole("dialog", { name: "Pull SCRAM" });
    await user.type(within(dialog).getByRole("textbox", { name: "Why (required)" }), "Bad prompt shipped");
    const sign = within(dialog).getByRole("button", { name: "Sign with your passkey and stop" }) as HTMLButtonElement;
    expect(await within(dialog).findByText(/How many could not be counted just now\./, {}, { timeout: 5000 })).toBeTruthy();
    expect(sign.disabled).toBe(true);
    await user.click(within(dialog).getByRole("checkbox", { name: "Stop without a count" }));
    expect(sign.disabled).toBe(false);
  });

  it("never lets a count that does not arrive block the stop: after a while it can be waived, and the stop fires", async () => {
    const sent: string[] = [];
    server.use(
      // The count never answers.
      http.get("*/scrams/preview", () => new Promise<never>(() => {})),
      http.get("*/admin", () => HttpResponse.json({ projects: [] })),
      http.post("*/admin/commands/:name/options", () => HttpResponse.json({ subject_digest: { algorithm: "sha256", value: "a".repeat(64) }, options: {} })),
      http.post("*/admin/commands/:name", ({ params }) => {
        sent.push(String(params["name"]));
        return HttpResponse.json(scram);
      }),
    );
    await renderPage(<ScramControl passkeys={passkeys} patienceMs={300} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "SCRAM" }));
    const dialog = screen.getByRole("dialog", { name: "Pull SCRAM" });
    await user.type(within(dialog).getByRole("textbox", { name: "Why (required)" }), "Bad prompt shipped");
    const sign = within(dialog).getByRole("button", { name: "Sign with your passkey and stop" }) as HTMLButtonElement;
    // While it is still counting, nothing fires.
    expect(within(dialog).getByText("Counting what this stops…")).toBeTruthy();
    expect(sign.disabled).toBe(true);
    expect(await within(dialog).findByText(/Counting what it stops is taking too long\./)).toBeTruthy();
    expect(sign.disabled).toBe(true);
    await user.click(within(dialog).getByRole("checkbox", { name: "Stop without a count" }));
    await user.click(sign);
    await waitFor(() => expect(sent).toEqual(["scram.pull"]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says pulled, not stopped, until the stop is recorded, then its latency", async () => {
    let stopped = false;
    const at = new Date().toISOString();
    server.use(http.get("*/scrams", () => HttpResponse.json({ scrams: [{ scram, run_count: 2, pulled_at: at, ...(stopped ? { stopped: { ms_to_stop: 1840, runs: 2, at } } : {}) }] })));
    const { qc } = await renderPage(<ScramBanner passkeys={passkeys} />);
    expect(await screen.findByText("Stopping 2 runs; each stops at its next heartbeat.")).toBeTruthy();
    expect(screen.getByText(/pulled on the whole organization at .+: Bad prompt shipped/)).toBeTruthy();
    expect(screen.queryByText(/stopped the whole organization/)).toBeNull();
    stopped = true;
    await qc.invalidateQueries({ queryKey: ["scrams"] });
    expect(await screen.findByText(/^Stopped at .+, 1\.8 s after the pull: 2 runs stopped where they stood\.$/)).toBeTruthy();
  });

  it("presenting, shows only that a SCRAM holds and over what: no reason, no runs, no review or restart", async () => {
    let query = "";
    server.use(
      http.get("*/scrams", ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({ presenting: true, scrams: [{ scram: { id: "scr_1", org_id: "org", scope: "project", project_id: "p1" }, run_count: 2 }] });
      }),
    );
    await renderPage(<ScramBanner passkeys={passkeys} presenting />);
    expect(await screen.findByText(/SCRAM scr_1/)).toBeTruthy();
    expect(query).toBe("?presenting=true");
    expect(screen.getByText("Its reason, the runs it stopped and the way back are not shown while presenting.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review and restart" })).toBeNull();
    expect(screen.queryByText(/Bad prompt shipped/)).toBeNull();
  });

  const run1 = (batches: unknown[], reviews: unknown[] = []) => ({ run_id: "R-1", role: "author", subject: "package", subject_id: "WP-1", discipline: "process", status: "stopped", outcome_unknown: false, batches, reviews });
  const batch = (id: number, outputs: { name: string; sha256: string }[]) => ({ id, reported: "succeeded", output_count: outputs.length, recorded_at: new Date().toISOString(), outputs });
  const packages = [
    { id: "WP-1", title: "Line sizing", discipline: "process", lifted: false },
    { id: "WP-2", title: "Pump curve", discipline: "process", lifted: false },
    { id: "WP-3", title: "Cable tray", discipline: "electrical", lifted: false },
    { id: "WP-4", title: "Old work", discipline: "civil", lifted: true },
  ];

  it("lists each report's outputs and digests before a disposition, and never widens a draft review to a report that lands mid-draft", async () => {
    const sent: { name: string; body: any }[] = [];
    let batches = [batch(1, [{ name: "calc.md", sha256: digest("a") }])];
    server.use(
      http.get("*/scrams", () => HttpResponse.json({ scrams: [{ scram, run_count: 1, stopped: { ms_to_stop: 900, runs: 1, at: new Date().toISOString() } }] })),
      http.get("*/scrams/:id", () => HttpResponse.json({ scram, restarts: [], packages, runs: [run1(batches)] })),
      http.post("*/admin/commands/:name/options", () => HttpResponse.json({ subject_digest: { algorithm: "sha256", value: "a".repeat(64) }, options: {} })),
      http.post("*/admin/commands/:name", async ({ params, request }) => {
        sent.push({ name: String(params["name"]), body: await request.json() });
        return HttpResponse.json({});
      }),
    );
    const { qc } = await renderPage(<ScramBanner passkeys={passkeys} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Review and restart" }));
    const reported = await screen.findByRole("list", { name: "What R-1 reported" });
    expect(within(reported).getByText(/Report 1, succeeded/)).toBeTruthy();
    expect(within(reported).getByText(`sha256:${digest("a")}`)).toBeTruthy();
    expect(within(reported).getByText(/calc\.md/)).toBeTruthy();
    // The reviewer starts writing; then a second report lands.
    await user.click(screen.getByRole("radio", { name: "Keep it as reference only, never applied" }));
    await user.type(screen.getByRole("textbox", { name: "What the review found (required)" }), "Calc is reference only");
    batches = [...batches, batch(2, [{ name: "patch.diff", sha256: digest("b") }])];
    await qc.invalidateQueries({ queryKey: ["scram"] });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/1 new report arrived while you were writing\. Your review covers only what you saw, through report 1/);
    expect(within(alert).getByText(`sha256:${digest("b")}`)).toBeTruthy();
    // The draft cannot be signed over material it never showed.
    expect((screen.getByRole("button", { name: "Sign the review of reports 1 to 1" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Start over with every report" }));
    expect((screen.getByRole("textbox", { name: "What the review found (required)" }) as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByRole("radio", { name: "Discard the partial work" }) as HTMLInputElement).checked).toBe(true);
    expect(within(screen.getByRole("list", { name: "What R-1 reported" })).getByText(`sha256:${digest("b")}`)).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "What the review found (required)" }), "Both reports discarded");
    await user.click(screen.getByRole("button", { name: "Sign the review of reports 1 to 2" }));
    await waitFor(() => expect(sent.find((s) => s.name === "scram.review")?.body.payload).toEqual({ scram_id: "scr_1", run_id: "R-1", disposition: "discard", reason: "Both reports discarded", covers_batch: 2 }));
  });

  it("restarts only something the SCRAM holds, states the exact scope, writes the reason afresh on a new scope, and shows the refusal", async () => {
    const sent: { name: string; body: any }[] = [];
    const held: Passkeys = { ...passkeys };
    server.use(
      http.get("*/scrams", () => HttpResponse.json({ scrams: [{ scram, run_count: 2, stopped: { ms_to_stop: 900, runs: 2, at: new Date().toISOString() } }] })),
      http.get("*/scrams/:id", () => HttpResponse.json({
        scram, restarts: [], packages,
        runs: [run1([], [{ disposition: "discard" }]), { run_id: "R-2", role: "author", subject: "package", subject_id: "WP-3", discipline: "electrical", status: "lost", outcome_unknown: true, batches: [], reviews: [] }],
      })),
      http.post("*/admin/commands/:name/options", () => HttpResponse.json({ subject_digest: { algorithm: "sha256", value: "a".repeat(64) }, options: {} })),
      http.post("*/admin/commands/:name", async ({ params, request }) => {
        sent.push({ name: String(params["name"]), body: await request.json() });
        return HttpResponse.json({ code: "restart-blocked", message: "Not yet: R-2 has an unknown outcome" }, { status: 409 });
      }),
    );
    await renderPage(<ScramBanner passkeys={held} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Review and restart" }));
    expect(await screen.findByText(/its outcome is unknown and must be reconciled before it can restart/)).toBeTruthy();
    // Only packages it still holds are offered; a lifted one is not, and nothing is typed free.
    const pkg = screen.getByRole("combobox", { name: "Package" });
    expect(within(pkg).queryByRole("option", { name: /WP-4/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Package" })).toBeNull();
    await user.selectOptions(pkg, "WP-1");
    expect(screen.getByText("This restarts package Line sizing (WP-1) only, and the 1 run the SCRAM stopped on it.")).toBeTruthy();
    const why = () => screen.getByRole("textbox", { name: "Why it is safe to restart (required)" }) as HTMLTextAreaElement;
    await user.type(why(), "Prompt reverted");
    // A broader scope is a different restart: the target and the reason are cleared.
    await user.click(screen.getByRole("radio", { name: "One discipline" }));
    expect(why().value).toBe("");
    const discipline = screen.getByRole("combobox", { name: "Discipline" }) as HTMLSelectElement;
    expect(discipline.value).toBe("");
    expect(within(discipline).getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose a discipline", "electrical", "process"]);
    const restart = screen.getByRole("button", { name: "Sign and restart" }) as HTMLButtonElement;
    await user.selectOptions(discipline, "process");
    expect(screen.getByText("This restarts the process discipline: WP-1, WP-2, and the 1 run the SCRAM stopped on them.")).toBeTruthy();
    expect(restart.disabled).toBe(true);
    await user.type(why(), "Prompt reverted for process");
    await user.click(restart);
    expect(await screen.findByText("Not yet: R-2 has an unknown outcome")).toBeTruthy();
    expect(sent.find((s) => s.name === "scram.restart")?.body.payload).toEqual({ scram_id: "scr_1", scope: "discipline", discipline: "process", reason: "Prompt reverted for process" });
    await user.click(screen.getByRole("radio", { name: "Everything it stopped" }));
    // While a restart is being signed, its scope cannot change under it.
    await user.type(why(), "Everything verified");
    let release: (v: Record<string, unknown>) => void = () => {};
    held.get = () => new Promise((r) => (release = r));
    await user.click(screen.getByRole("button", { name: "Sign and restart" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "One package" }).matches(":disabled")).toBe(true));
    expect(why().matches(":disabled")).toBe(true);
    release({ signed: true });
    await waitFor(() => expect(screen.getByRole("radio", { name: "One package" }).matches(":disabled")).toBe(false));
    expect(screen.getByText("This lifts SCRAM scr_1 for everything it holds: 3 packages and any intake work on captures in its scope, and the 2 runs it stopped.")).toBeTruthy();
  });
});
