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
        return HttpResponse.json({ id: "seal_3", payload: { head_seq: 41 } });
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
    // Once the seal records itself the chain head moves on; the refreshed head shows that.
    server.use(http.get("*/records/head", () => HttpResponse.json({ head: { head_seq: 43, head_digest: D("d"), at: new Date().toISOString() } })));
    await user.click(sign);
    await waitFor(() => expect(sent).toHaveLength(1));
    const payload = sent[0]!.body.payload;
    expect(payload).toMatchObject({ head_seq: 41, head_digest: "b".repeat(64), purpose: "Before the design review" });
    expect(Object.keys(payload).sort()).toEqual(["head_digest", "head_seq", "purpose", "sealed_at"]);
    expect(Math.abs(Date.parse(payload.sealed_at) - Date.now())).toBeLessThan(60_000);
    // The message keeps the seal's own head, not the head shown now.
    expect(await within(region).findByText("Sealed through entry 41.")).toBeTruthy();
    await waitFor(() => expect(region.textContent).toContain("entry 43"));
    expect(within(region).getByText("Sealed through entry 41.")).toBeTruthy();
  });

  it("proves a package's entries are in the record, says what the signature does and does not establish, and offers the bundle", async () => {
    server.use(http.get("*/packages/WP-1/proof", () => HttpResponse.json({
      ok: true, chain: { ok: true, count: 50 }, check: { ok: true, authenticated: true, events: [3, 9] },
      bundle: { package_id: "WP-1", segment: [], seal: { id: "seal_1", payload: { head_seq: 30, purpose: "End of day" } }, statement: "Local chain, not witnessed" },
    })));
    const user = userEvent.setup();
    await renderPage(<Records passkeys={passkeys} />);
    const region = screen.getByRole("region", { name: "Prove a package is in the record" });
    await user.type(within(region).getByRole("textbox", { name: "Package" }), "WP-1");
    await user.click(within(region).getByRole("button", { name: "Prove it" }));
    expect(await within(region).findByText("2 entries of WP-1 recompute and link through the chain from its first entry.")).toBeTruthy();
    expect(region.textContent).toContain("Covered by seal seal_1 through entry 30 (End of day), and its passkey signature checks against the key in the bundle.");
    expect(region.textContent).toContain("Whether that key is the signer's must be confirmed from outside the bundle.");
    // Asked again, it is proven again.
    let asked = 0;
    server.use(http.get("*/packages/WP-1/proof", () => {
      asked++;
      return HttpResponse.json({ ok: true, chain: { ok: true, count: 51 }, check: { ok: true, authenticated: true, events: [3, 9] },
        bundle: { package_id: "WP-1", segment: [], seal: { id: "seal_2", payload: { head_seq: 50, purpose: "Later" } }, statement: "Local chain, not witnessed" } });
    }));
    await user.click(within(region).getByRole("button", { name: "Prove it" }));
    await waitFor(() => expect(asked).toBe(1));
    expect(await within(region).findByText(/Covered by seal seal_2 through entry 50/)).toBeTruthy();
    const link = within(region).getByRole("link", { name: "Download the proof bundle" }) as HTMLAnchorElement;
    expect(link.getAttribute("download")).toBe("WP-1-inclusion-proof.json");
    expect(JSON.parse(decodeURIComponent(link.href.split(",")[1]!))).toMatchObject({ package_id: "WP-1" });
  });

  it("fails a proof when the chain is broken, however its own stretch looks", async () => {
    server.use(http.get("*/packages/WP-3/proof", () => HttpResponse.json({
      ok: false, chain: { ok: false, count: 50, broken_at: 44 }, check: { ok: true, authenticated: true, events: [3] },
      bundle: { package_id: "WP-3", segment: [], seal: { id: "seal_1", payload: { head_seq: 30, purpose: "End of day" } }, statement: "Local chain, not witnessed" },
    })));
    const user = userEvent.setup();
    await renderPage(<Records passkeys={passkeys} />);
    const region = screen.getByRole("region", { name: "Prove a package is in the record" });
    await user.type(within(region).getByRole("textbox", { name: "Package" }), "WP-3");
    await user.click(within(region).getByRole("button", { name: "Prove it" }));
    expect(await within(region).findByText("The chain is broken at entry 44, so this proof cannot be relied on, though WP-3's own stretch checks.")).toBeTruthy();
  });

  it("says when no seal covers a package yet, and when a proof does not hold", async () => {
    server.use(http.get("*/packages/WP-2/proof", () => HttpResponse.json({
      ok: false, chain: { ok: true, count: 50 }, check: { ok: false, authenticated: false, events: [], problem: "event 5 does not link to the one before it" },
      bundle: { package_id: "WP-2", segment: [], seal: null, statement: "Local chain, not witnessed" },
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
