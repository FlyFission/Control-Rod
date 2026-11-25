import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import type { Run } from "../api/types.js";
import { PRESSED_RECONCILE_REASON, RunCard, unknownOutcomeText } from "./RunLog.js";

const unproven = (reason: string): Run =>
  ({
    id: "R-1", package_id: "WP-1", role: "pre-check", status: "failed", round: 1, runtime: { kind: "subscription", provider: "codex", model: "default" }, queued_at: "2026-11-25T01:11:04Z",
    error: "the login directory could not be hashed", outcome_unknown: { since: "2026-11-25T01:11:05Z", reason },
  }) as unknown as Run;

/** The package's offered actions, with send-back taking the given mode, and a record of what the page sent. */
function serve(returnMode: "click" | "passkey") {
  const sent: { path: string; body: unknown }[] = [];
  server.use(
    http.get("*/packages/WP-1/actions", () =>
      HttpResponse.json([{ command: "return", label: "Return for revision", allowed: true, signature: returnMode === "click" ? "none" : "direct", step_mode: returnMode }]),
    ),
    http.get("*/packages/WP-1/runs/R-1/log", () => HttpResponse.json({ lines: [] })),
    http.post("*/packages/WP-1/runs/R-1/reconcile", async ({ request }) => {
      sent.push({ path: "reconcile", body: await request.json() });
      return HttpResponse.json({});
    }),
    http.post("*/packages/WP-1/runs/R-1/requeue", async () => {
      sent.push({ path: "requeue", body: null });
      return HttpResponse.json({}, { status: 201 });
    }),
  );
  return sent;
}

describe("a run whose outcome is unknown", () => {
  it("says the run ended without proof, not that the daemon stopped answering, unless its lease lapsed", () => {
    expect(unknownOutcomeText(unproven("process group containment cannot prove every process of the run stopped"))).not.toMatch(/stopped answering/);
    expect(unknownOutcomeText(unproven("the daemon sent no proof that every process of the run stopped"))).not.toMatch(/stopped answering/);
    expect(unknownOutcomeText(unproven("the lease lapsed before the completion arrived"))).toMatch(/stopped answering/);
    expect(unknownOutcomeText(unproven("the daemon restarted before the run's completion was reported"))).toMatch(/stopped answering/);
  });

  it("settles it and runs it again with one press where the signing settings send cards back with a press", async () => {
    const sent = serve("click");
    await renderPage(<RunCard packageId="WP-1" run={unproven("process group containment cannot prove every process of the run stopped")} />);
    const press = await screen.findByRole("button", { name: "It has stopped. Run it again" });
    expect(screen.queryByRole("button", { name: /Sign with passkey/ })).toBeNull();
    await userEvent.click(press);
    await waitFor(() => expect(sent.map((s) => s.path)).toEqual(["reconcile", "requeue"]));
    expect(sent[0]!.body).toEqual({ reason: PRESSED_RECONCILE_REASON });
  });

  it("keeps the signed reconcile where the signing settings sign send-backs", async () => {
    serve("passkey");
    await renderPage(<RunCard packageId="WP-1" run={unproven("process group containment cannot prove every process of the run stopped")} />);
    expect(await screen.findByRole("button", { name: "Sign with passkey and reconcile" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Run it again/ })).toBeNull();
  });
});
