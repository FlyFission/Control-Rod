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
    await user.type(screen.getByRole("textbox", { name: "What needs doing?" }), "Site a 50 MW data center on parcel 12");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(body).toEqual({ text: "Site a 50 MW data center on parcel 12", source: "web" }));
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
    await user.type(screen.getByRole("textbox", { name: "What needs doing?" }), "Site a 50 MW data center");
    const file = new File(["<kml/>"], "parcel.kml", { type: "application/vnd.google-earth.kml+xml" });
    const input = container.querySelector("#capture-file") as HTMLInputElement;
    await user.upload(input, file);
    expect(await screen.findByText("parcel.kml")).toBeTruthy();
    expect(container.textContent).not.toContain("PGttbC8+");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(body.text).toBe('Site a 50 MW data center\n\n```attachment name="parcel.kml" encoding="base64"\nPGttbC8+\n```'),
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
      ["options", { kind: "accept", package_revision: 3 }],
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
