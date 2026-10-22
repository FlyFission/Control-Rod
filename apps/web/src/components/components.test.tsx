import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { DIGEST, view } from "../test/fixtures.js";
import { CaptureBox, CAPTURE_LIMIT } from "./CaptureBox.js";
import { DecisionBar } from "./DecisionBar.js";
import { Office } from "../pages/Office.js";
import { RunCard, canRequeue, canStop, runStatusText } from "./RunLog.js";
import { independenceText } from "../lib/format.js";
import type { Run } from "../api/types.js";
import type { Passkeys } from "../lib/decide.js";

describe("capture", () => {
  it("sends the text as a web capture", async () => {
    let body: unknown;
    server.use(
      http.post("*/captures", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { schema_version: "0.1.0", id: "C-1", text: "x", source: "web", created_at: "2026-10-22T10:00:00Z", disposition: "pending" },
          { status: 201 },
        );
      }),
    );
    await renderPage(<CaptureBox />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "What needs doing?" }), "Site a facility on parcel 12");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(body).toEqual({ text: "Site a facility on parcel 12", source: "web" }));
    await waitFor(() => expect((screen.getByRole("textbox", { name: "What needs doing?" }) as HTMLTextAreaElement).value).toBe(""));
  });

  it("sends an attached parcel file as an attachment fence and shows its name, never the base64", async () => {
    let body: { text?: string } = {};
    server.use(
      http.post("*/captures", async ({ request }) => {
        body = (await request.json()) as { text: string };
        return HttpResponse.json(
          { schema_version: "0.1.0", id: "C-2", text: "x", source: "web", created_at: "2026-10-22T10:00:00Z" },
          { status: 201 },
        );
      }),
    );
    const { container } = await renderPage(<CaptureBox />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "What needs doing?" }), "Site a facility");
    const file = new File(["<kml/>"], "parcel.kml", { type: "application/vnd.google-earth.kml+xml" });
    const input = container.querySelector("#capture-file") as HTMLInputElement;
    await user.upload(input, file);
    expect(await screen.findByText("parcel.kml")).toBeTruthy();
    expect(container.textContent).not.toContain("PGttbC8+");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(body.text).toBe('Site a facility\n\n```attachment name="parcel.kml" encoding="base64"\nPGttbC8+\n```'),
    );
  });

  it("refuses a capture over the contract limit before sending", async () => {
    let called = false;
    server.use(
      http.post("*/captures", () => {
        called = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    await renderPage(<CaptureBox />);
    const user = userEvent.setup();
    const box = screen.getByRole("textbox", { name: "What needs doing?" });
    await user.click(box);
    await user.paste("y".repeat(CAPTURE_LIMIT + 1));
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Too long"));
    expect(called).toBe(false);
  });
});

describe("decision flow", () => {
  const passkeys = (calls: unknown[]): Passkeys => ({
    async get(options) {
      calls.push(options);
      return { id: "cred-1", response: { signature: "sig" }, type: "public-key" };
    },
    async create() {
      return {};
    },
  });

  it("asks for the digest, signs it with the passkey and sends the signed decision", async () => {
    const sent: unknown[] = [];
    const signed: unknown[] = [];
    server.use(
      http.post("*/packages/WP-0001/decisions/options", async ({ request }) => {
        sent.push(["options", await request.json()]);
        return HttpResponse.json({ subject_digest: DIGEST, options: { challenge: "abc", rpId: "localhost" } });
      }),
      http.post("*/packages/WP-0001/decisions", async ({ request }) => {
        sent.push(["decide", await request.json()]);
        return HttpResponse.json(
          {
            schema_version: "0.1.0",
            id: "D-1",
            package_id: "WP-0001",
            package_revision: 3,
            kind: "accept",
            actor: { kind: "human", id: "ben" },
            subject_digest: DIGEST,
            assertion: { credential_id: "cred-1", authenticator_data: "a", client_data_json: "c", signature: "s" },
            decided_at: "2026-10-22T10:00:00Z",
          },
          { status: 201 },
        );
      }),
    );
    const v = view(
      {
        pre_check: {
          schema_version: "0.1.0",
          package_id: "WP-0001",
          package_revision: 3,
          output: { path: "out/site-plan.pdf", digest: DIGEST },
          method: "agent-pre-check",
          verifier: "site-checker",
          evidence: [],
          findings: [],
          outcome: "pass",
        },
      },
      { status: "in-verification", revision: 3 },
    );
    await renderPage(<DecisionBar view={v} passkeys={passkeys(signed)} />);
    expect(screen.getByText("sha256:ab12cd34ef56")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Accept recorded.");
    expect(signed).toEqual([{ challenge: "abc", rpId: "localhost" }]);
    expect(sent).toEqual([
      ["options", { kind: "accept", package_revision: 3, expected_subject_digest: DIGEST }],
      [
        "decide",
        {
          kind: "accept",
          package_revision: 3,
          assertion: { id: "cred-1", response: { signature: "sig" }, type: "public-key" },
        },
      ],
    ]);
  });

  it("stops before signing when the package changed since the page loaded", async () => {
    const signed: unknown[] = [];
    let decided = false;
    server.use(
      http.post("*/packages/WP-0001/decisions/options", () =>
        HttpResponse.json({ subject_digest: { algorithm: "sha256", value: "ff".repeat(32) }, options: { challenge: "new" } }),
      ),
      http.post("*/packages/WP-0001/decisions", () => {
        decided = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    await renderPage(<DecisionBar view={view({}, { status: "draft", revision: 0 })} passkeys={passkeys(signed)} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Release" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("changed since you opened it"));
    expect(signed).toEqual([]);
    expect(decided).toBe(false);
  });

  it("asks why before signing a rejection", async () => {
    const signed: unknown[] = [];
    await renderPage(<DecisionBar view={view({}, { status: "draft", revision: 0 })} passkeys={passkeys(signed)} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("textbox", { name: "Why reject this package" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Sign: Reject" }) as HTMLButtonElement).disabled).toBe(true);
    expect(signed).toEqual([]);
  });

  it("labels acceptance of a parcel package Confirm boundary", async () => {
    const v = view(
      {
        pre_check: {
          schema_version: "0.1.0",
          package_id: "WP-0001",
          package_revision: 0,
          output: { path: "out/parcel.json", digest: DIGEST },
          method: "agent-pre-check",
          verifier: "site-checker",
          evidence: [],
          findings: [],
          outcome: "pass",
        },
      },
      {
        status: "in-verification",
        agent_assignment: [{ role: "site-parcel", agent_baseline: "site-parcel", baseline_revision: 1 }],
      },
    );
    await renderPage(<DecisionBar view={v} passkeys={passkeys([])} />);
    expect(screen.getByRole("button", { name: "Confirm boundary" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("requires direction before returning a package", async () => {
    const signed: unknown[] = [];
    let decided: unknown;
    server.use(
      http.post("*/packages/WP-0001/decisions/options", () =>
        HttpResponse.json({ subject_digest: DIGEST, options: { challenge: "xyz" } }),
      ),
      http.post("*/packages/WP-0001/decisions", async ({ request }) => {
        decided = await request.json();
        return HttpResponse.json(
          {
            schema_version: "0.1.0",
            id: "D-2",
            package_id: "WP-0001",
            package_revision: 0,
            kind: "return",
            actor: { kind: "human", id: "ben" },
            subject_digest: DIGEST,
            reason: "Use the 100 ft setback.",
            assertion: { credential_id: "cred-1", authenticator_data: "a", client_data_json: "c", signature: "s" },
            decided_at: "2026-10-22T10:00:00Z",
          },
          { status: 201 },
        );
      }),
    );
    await renderPage(<DecisionBar view={view({}, { status: "in-work" })} passkeys={passkeys(signed)} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Return with direction" }));
    const sign = screen.getByRole("button", { name: "Sign: Return with direction" });
    expect((sign as HTMLButtonElement).disabled).toBe(true);
    expect(signed).toEqual([]);
    await user.type(screen.getByLabelText("Direction for the next revision"), "Use the 100 ft setback.");
    await user.click(sign);
    await waitFor(() =>
      expect(decided).toMatchObject({ kind: "return", package_revision: 0, reason: "Use the 100 ft setback." }),
    );
  });

  it("shows the refusal when the kernel does not allow the decision", async () => {
    server.use(
      http.post("*/packages/WP-0001/decisions/options", () =>
        HttpResponse.json({ subject_digest: DIGEST, options: { challenge: "q" } }),
      ),
      http.post("*/packages/WP-0001/decisions", () =>
        HttpResponse.json({ code: "forbidden", message: "The digest you signed is not the current one." }, { status: 409 }),
      ),
    );
    await renderPage(<DecisionBar view={view()} passkeys={passkeys([])} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Release" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The digest you signed is not the current one.");
  });
});

describe("your office", () => {
  it("lists holds first and the oldest of a kind first", async () => {
    server.use(
      http.get("*/office", () =>
        HttpResponse.json([
          { kind: "release", package_id: "WP-3", package_revision: 0, title: "Release WP-3", detail: "", since: "2026-10-22T08:00:00Z" },
          { kind: "accept", package_id: "WP-2", package_revision: 1, title: "Accept WP-2", detail: "", since: "2026-10-22T11:00:00Z" },
          { kind: "accept", package_id: "WP-1", package_revision: 1, title: "Accept WP-1", detail: "", since: "2026-10-22T09:00:00Z" },
          { kind: "dispute", package_id: "WP-4", package_revision: 2, title: "Dispute WP-4", detail: "", since: "2026-10-22T12:00:00Z" },
        ]),
      ),
    );
    await renderPage(<Office />);
    await screen.findByText("Accept WP-1");
    const titles = screen.getAllByText(/^(Release|Accept|Dispute) WP-\d$/).map((n) => n.textContent);
    expect(titles).toEqual(["Dispute WP-4", "Accept WP-1", "Accept WP-2", "Release WP-3"]);
  });
});

describe("runs that need the owner", () => {
  const lostRun: Run = {
    schema_version: "0.1.0",
    id: "R-lost",
    package_id: "WP-9",
    package_revision: 0,
    role: "author",
    agent_baseline: "author-claude",
    runtime: { kind: "subscription", provider: "claude", model: "default" },
    round: 1,
    status: "lost",
    queued_at: "2026-10-22T10:00:00Z",
    error: "Runner lost: no heartbeat from the daemon.",
  };

  it("shows a lost run plainly and lets the owner requeue it once", async () => {
    let posted = "";
    server.use(
      http.get("*/packages/WP-9/runs/R-lost/log", () => HttpResponse.json({ lines: [] })),
      http.post("*/packages/WP-9/runs/R-lost/requeue", ({ request }) => {
        posted = new URL(request.url).pathname;
        return HttpResponse.json({ ...lostRun, id: "R-new", status: "queued", requeue_of: "R-lost" }, { status: 201 });
      }),
    );
    await renderPage(<RunCard packageId="WP-9" run={lostRun} />);
    expect(screen.getByText("Lost: the daemon stopped answering")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Requeue this run" }));
    await waitFor(() => expect(posted).toBe("/packages/WP-9/runs/R-lost/requeue"));
    expect(canRequeue({ ...lostRun, requeued_as: "R-new" })).toBe(false);
    expect(canRequeue({ ...lostRun, status: "running" })).toBe(false);
  });

  it("stops a running run and shows it as stopping until the daemon confirms", async () => {
    const running: Run = { ...lostRun, id: "R-run", status: "running", label: "Run: cr-example" };
    delete running.error;
    let posted = "";
    server.use(
      http.get("*/packages/WP-9/runs/R-run/log", () => HttpResponse.json({ lines: [] })),
      http.post("*/packages/WP-9/runs/R-run/stop", ({ request }) => {
        posted = new URL(request.url).pathname;
        return HttpResponse.json({ ...running, stop_requested_at: "2026-10-22T12:00:00Z" });
      }),
    );
    await renderPage(<RunCard packageId="WP-9" run={running} />);
    expect(screen.queryByRole("button", { name: "Requeue this run" })).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Stop this run" }));
    await waitFor(() => expect(posted).toBe("/packages/WP-9/runs/R-run/stop"));
    const stopping = { ...running, stop_requested_at: "2026-10-22T12:00:00Z" };
    expect(runStatusText(stopping)).toBe("Stopping: waiting for the daemon to confirm");
    expect(canStop(stopping)).toBe(false);
    expect(canStop({ ...running, status: "queued" })).toBe(true);
  });

  it("puts lost runs right after holds in the office", async () => {
    server.use(
      http.get("*/office", () =>
        HttpResponse.json([
          { kind: "dispute", package_id: "WP-4", package_revision: 2, title: "Dispute WP-4", detail: "", since: "2026-10-22T08:00:00Z" },
          { kind: "lost", package_id: "WP-9", package_revision: 0, title: "Lost WP-9", detail: "Author run lost", since: "2026-10-22T12:00:00Z" },
        ]),
      ),
    );
    await renderPage(<Office />);
    await screen.findByText("Lost WP-9");
    expect(screen.getAllByText(/^(Lost|Dispute) WP-\d$/).map((n) => n.textContent)).toEqual(["Lost WP-9", "Dispute WP-4"]);
    expect(screen.getByText("Lost run")).toBeTruthy();
  });
});

describe("pre-check independence", () => {
  const held: Run = {
    schema_version: "0.1.0",
    id: "R-chk",
    package_id: "WP-7",
    package_revision: 0,
    role: "pre-check",
    agent_baseline: "unassigned",
    runtime: { kind: "local", provider: "any", model: "any" },
    round: 1,
    status: "queued",
    queued_at: "2026-10-22T10:00:00Z",
    waiting_reason: "Waiting for an independent runtime: install Codex, or proceed with a recorded owner override.",
  };

  it("shows why a pre-check is held and signs the owner's override with the passkey", async () => {
    const sent: unknown[] = [];
    const signed: unknown[] = [];
    const passkeys: Passkeys = {
      async get(options) {
        signed.push(options);
        return { id: "cred-1", response: { signature: "sig" }, type: "public-key" };
      },
      async create() {
        return {};
      },
    };
    server.use(
      http.get("*/packages/WP-7/runs/R-chk/log", () => HttpResponse.json({ lines: [] })),
      http.post("*/packages/WP-7/runs/R-chk/override-independence/options", async ({ request }) => {
        sent.push(["options", await request.json()]);
        return HttpResponse.json({ subject_digest: DIGEST, options: { challenge: "xyz", rpId: "localhost" } });
      }),
      http.post("*/packages/WP-7/runs/R-chk/override-independence", async ({ request }) => {
        sent.push(["override", await request.json()]);
        return HttpResponse.json({ ...held, independence_override: { by: "ben", at: "2026-10-22T11:00:00Z", reason: "No Codex yet" } });
      }),
    );
    await renderPage(<RunCard packageId="WP-7" run={held} passkeys={passkeys} />);
    expect(screen.getByText(held.waiting_reason as string)).toBeTruthy();
    const button = screen.getByRole("button", { name: "Sign with passkey and proceed" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Why may this pre-check run on the author's runtime?"), "No Codex yet");
    await user.click(button);
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[0]).toEqual(["options", { reason: "No Codex yet" }]);
    expect(signed).toEqual([{ challenge: "xyz", rpId: "localhost" }]);
    expect(sent[1]).toEqual(["override", { reason: "No Codex yet", assertion: { id: "cred-1", response: { signature: "sig" }, type: "public-key" } }]);
  });

  it("says plainly when a pre-check shared the author's runtime under an override", () => {
    const base = {
      schema_version: "0.1.0" as const,
      package_id: "WP-7",
      package_revision: 0,
      output: { path: "r.md", digest: DIGEST },
      method: "agent-pre-check" as const,
      verifier: "checker-claude",
      evidence: [],
      findings: [],
      outcome: "pass" as const,
    };
    expect(
      independenceText({
        ...base,
        independence: {
          runtime: "shared",
          author_runtime: { kind: "subscription", provider: "claude", model: "default" },
          checker_runtime: { kind: "subscription", provider: "claude", model: "default" },
          owner_override: { by: "ben", at: "2026-10-22T11:00:00Z", reason: "No Codex yet", subject_digest: DIGEST, assertion: { credential_id: "c", authenticator_data: "a", client_data_json: "j", signature: "s" } },
        },
      }),
    ).toBe("Shared runtime: the author and the pre-check both ran on claude, in separate sessions. Owner override by ben: No Codex yet");
    expect(
      independenceText({
        ...base,
        independence: {
          runtime: "independent",
          author_runtime: { kind: "subscription", provider: "claude", model: "default" },
          checker_runtime: { kind: "subscription", provider: "codex", model: "gpt-5-codex" },
        },
      }),
    ).toBe("Independent runtime: the author ran on claude, the pre-check on codex gpt-5-codex.");
  });
});

describe("runtime readiness in the office", () => {
  it("shows a runtime the daemon found not ready, with its reason", async () => {
    server.use(
      http.get("*/office", () => HttpResponse.json([])),
      http.get("*/runtimes", () =>
        HttpResponse.json({
          reported_at: "2026-10-22T12:00:00Z",
          runtimes: [
            { runtime: "claude", ready: true, version: "2.1.0", login_checked: false },
            { runtime: "codex", ready: false, reason: "codex is installed but not signed in.", login_checked: true },
          ],
        }),
      ),
    );
    await renderPage(<Office />);
    expect(await screen.findByText("codex is not ready and is not offered for work.")).toBeTruthy();
    expect(screen.getByText(/not signed in/)).toBeTruthy();
    expect(screen.queryByText(/claude is not ready/)).toBeNull();
  });
});
