import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import type { Passkeys } from "../lib/decide.js";
import { server } from "../test/server.js";
import { renderPage } from "../test/render.js";
import { Records } from "./Records.js";

/** Records: verification, seals and inclusion proofs (plan task 5.3; specification 11.6, WB-20). */

const passkeys: Passkeys = { get: async () => ({ signed: true }), create: async () => ({}) };
const D = (c: string) => ({ algorithm: "sha256" as const, value: c.repeat(64) });
const seal = (id: string, head: number, result: string) => ({ id, head_seq: head, head_digest: D("a"), sealed_at: new Date().toISOString(), signer_id: "mem_1", purpose: "End of day", result });

describe("Records", () => {
  const sent: { name: string; body: any }[] = [];
  beforeEach(() => {
    sent.length = 0;
    server.use(
      http.get("*/events", () => HttpResponse.json([])),
      http.get("*/records/head", () => HttpResponse.json({ head: { head_seq: 41, head_digest: D("b"), at: new Date().toISOString() } })),
      http.get("*/records/verify", () => HttpResponse.json({
        chain: { ok: true, count: 50 }, seals: [seal("seal_1", 30, "valid"), seal("seal_2", 41, "signature-invalid")],
        last_sealed_seq: 30, unsealed: 20, witnessed: false, statement: "Local chain, not witnessed",
      })),
      http.post("*/admin/commands/:name/options", () => HttpResponse.json({ subject_digest: D("c"), options: {} })),
      http.post("*/admin/commands/:name", async ({ params, request }) => {
        sent.push({ name: String(params["name"]), body: await request.json() });
        return HttpResponse.json({ id: "seal_3" });
      }),
    );
  });

  it("says, everywhere, that the chain is local and not witnessed", async () => {
    await renderPage(<Records passkeys={passkeys} />);
    expect(screen.getByRole("note").textContent).toContain("Local chain, not witnessed.");
    expect(screen.getByRole("note").textContent).toContain("cannot prove that a sealed stretch was not cut short");
  });

  it("verifies the chain and every seal, and states how much no valid seal covers", async () => {
    const user = userEvent.setup();
    await renderPage(<Records passkeys={passkeys} />);
    await user.click(screen.getByRole("button", { name: "Verify the record" }));
    const region = screen.getByRole("region", { name: "Verification" });
    expect(await within(region).findByText("Chain intact: all 50 entries recomputed and linked.")).toBeTruthy();
    expect(within(region).getByText("Sealed through entry 30. 20 entries after it are not sealed yet.")).toBeTruthy();
    expect(within(region).getByRole("row", { name: /seal_1/ }).textContent).toContain("Valid");
    expect(within(region).getByRole("row", { name: /seal_2/ }).textContent).toContain("Not valid: the signature does not check");
  });

  it("reports a broken chain plainly", async () => {
    server.use(http.get("*/records/verify", () => HttpResponse.json({ chain: { ok: false, count: 50, broken_at: 7 }, seals: [], last_sealed_seq: 0, unsealed: 50, witnessed: false, statement: "Local chain, not witnessed" })));
    const user = userEvent.setup();
    await renderPage(<Records passkeys={passkeys} />);
    await user.click(screen.getByRole("button", { name: "Verify the record" }));
    expect(await screen.findByText("Chain broken at entry 7 of 50: from there on, nothing can be relied on.")).toBeTruthy();
    expect(screen.getByText("No valid seal covers any entry yet: all 50 are unsealed.")).toBeTruthy();
  });

  it("seals exactly the head it shows, with a purpose, signed", async () => {
    const user = userEvent.setup();
    await renderPage(<Records passkeys={passkeys} />);
    const region = screen.getByRole("region", { name: "Seal the record" });
    expect(await within(region).findByText(/This seals the chain through entry/)).toBeTruthy();
    expect(region.textContent).toContain(`entry 41, digest ${"b".repeat(64)}`);
    const sign = within(region).getByRole("button", { name: "Sign with your passkey and seal" }) as HTMLButtonElement;
    expect(sign.disabled).toBe(true);
    await user.type(within(region).getByRole("textbox", { name: "Purpose (required)" }), " Before the design review ");
    await user.click(sign);
    await waitFor(() => expect(sent).toHaveLength(1));
    const payload = sent[0]!.body.payload;
    expect(payload).toMatchObject({ head_seq: 41, head_digest: "b".repeat(64), purpose: "Before the design review" });
    expect(Object.keys(payload).sort()).toEqual(["head_digest", "head_seq", "purpose", "sealed_at"]);
    expect(Math.abs(Date.parse(payload.sealed_at) - Date.now())).toBeLessThan(60_000);
    expect(await within(region).findByText("Sealed through entry 41.")).toBeTruthy();
  });

  it("proves a package's entries are in the record, and offers the bundle to keep", async () => {
    server.use(http.get("*/packages/WP-1/proof", () => HttpResponse.json({
      bundle: { package_id: "WP-1", events: [3, 9], segment: [], seal: { id: "seal_1", payload: { head_seq: 30, purpose: "End of day" } }, statement: "Local chain, not witnessed" },
      check: { ok: true },
    })));
    const user = userEvent.setup();
    await renderPage(<Records passkeys={passkeys} />);
    const region = screen.getByRole("region", { name: "Prove a package is in the record" });
    await user.type(within(region).getByRole("textbox", { name: "Package" }), "WP-1");
    await user.click(within(region).getByRole("button", { name: "Prove it" }));
    expect(await within(region).findByText("2 entries of WP-1 recompute and link through the chain.")).toBeTruthy();
    expect(within(region).getByText("Covered by seal seal_1 through entry 30 (End of day).")).toBeTruthy();
    const link = within(region).getByRole("link", { name: "Download the proof bundle" }) as HTMLAnchorElement;
    expect(link.getAttribute("download")).toBe("WP-1-inclusion-proof.json");
    expect(JSON.parse(decodeURIComponent(link.href.split(",")[1]!))).toMatchObject({ package_id: "WP-1", events: [3, 9] });
  });

  it("says when no seal covers a package yet, and when a proof does not hold", async () => {
    server.use(http.get("*/packages/WP-2/proof", () => HttpResponse.json({
      bundle: { package_id: "WP-2", events: [4], segment: [], seal: null, statement: "Local chain, not witnessed" },
      check: { ok: false, problem: "event 5 does not link to the one before it" },
    })));
    const user = userEvent.setup();
    await renderPage(<Records passkeys={passkeys} />);
    const region = screen.getByRole("region", { name: "Prove a package is in the record" });
    await user.type(within(region).getByRole("textbox", { name: "Package" }), "WP-2");
    await user.click(within(region).getByRole("button", { name: "Prove it" }));
    expect(await within(region).findByText("The proof does not hold: event 5 does not link to the one before it.")).toBeTruthy();
    expect(within(region).getByText("No seal covers these entries yet: the proof runs to the chain's current head, unsealed.")).toBeTruthy();
  });
});
