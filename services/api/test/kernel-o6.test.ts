import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { decide } from "../src/kernel.js";
import { memberIdFor } from "../src/tenancy.js";
import { type DaemonReply, sealDaemonPayload } from "./counted-check.js";
import {
  type Harness,
  ORIGIN,
  VirtualAuthenticator,
  addOwnPasskey,
  b64,
  claims,
  daemonHeaders,
  signIn,
  startHarness,
  testAttestation,
  withClaim,
} from "./harness.js";

describe("WASM kernel O6 vendor/family, attestation, and Safety quorum", () => {
  it("fails closed when extra vendor or family attempts to mask provider", () => {
    const out = decide({
      status: "in-verification",
      action: "submit-pre-check",
      actor_kind: "agent",
      actor_id: "checker-1",
      author_baseline: "author-1",
      checker_baseline: "checker-1",
      author_runtime: { provider: "anthropic", model: "claude-opus-4-1" },
      checker_runtime: { provider: "anthropic", model: "gpt-5-codex", family: "openai" },
    });
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe("not-independent");
  });

  it("requires attestation_verified: true for Safety pre-check without override bypass", () => {
    const base = {
      status: "in-verification" as const,
      action: "submit-pre-check" as const,
      actor_kind: "agent" as const,
      actor_id: "checker-1",
      author_baseline: "author-1",
      checker_baseline: "checker-1",
      author_runtime: { provider: "claude", model: "claude-sonnet-4-5", vendor: "Anthropic", family: "Anthropic" },
      checker_runtime: { provider: "codex", model: "gpt-5-codex", vendor: "OpenAI", family: "OpenAI" },
      grade: "safety" as const,
    };
    expect(decide(base).allowed).toBe(false);
    expect(decide({ ...base, attestation_verified: false, owner_override_verified: true }).allowed).toBe(false);
    expect(decide({ ...base, attestation_verified: true })).toEqual({
      allowed: true,
      reason: "allowed",
      next: "in-verification",
    });
  });

  it("requires safety_quorum_met: true for Safety accept and accept-with-findings", () => {
    for (const action of ["accept", "accept-with-findings"] as const) {
      const base = {
        status: "in-verification" as const,
        action,
        actor_kind: "human" as const,
        actor_id: "ben",
        pre_check: "pass" as const,
        assertion_verified: true,
        digest_matches: true,
        reason_given: action === "accept-with-findings",
        grade: "safety" as const,
      };
      expect(decide(base).allowed).toBe(false);
      expect(decide({ ...base, safety_quorum_met: false }).allowed).toBe(false);
      expect(decide({ ...base, safety_quorum_met: true })).toEqual({
        allowed: true,
        reason: "allowed",
        next: "accepted",
      });
    }
  });
});

describe("Safety-grade package lifecycle end-to-end with O6 quorum and attestation", () => {
  const vendor = testAttestation();
  const plain = new VirtualAuthenticator();
  const hardware = new VirtualAuthenticator({ attestation: vendor });
  const example = parse(
    readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"),
  );

  let h: Harness;
  let ben: string;

  const owner = (method: "GET" | "POST", url: string, payload?: unknown) =>
    h.app.inject({
      method,
      url,
      headers: { cookie: ben, ...(method === "GET" ? {} : { origin: ORIGIN }) },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });

  const asDaemon = async (url: string, payload: unknown): Promise<DaemonReply> => {
    const body = await sealDaemonPayload(h.admin, url, withClaim(url, payload as Record<string, unknown>));
    return (await h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: body })) as DaemonReply;
  };

  async function claim(runtimes: string[]) {
    const r = await asDaemon("/runner/claim", { runtimes });
    if (r.statusCode === 204) return null;
    const job = r.json();
    claims.set(job.run.id, job.claim.token);
    return job;
  }

  async function decidePkg(id: string, kind: string, revision: number, reason?: string) {
    const o = await owner("POST", `/packages/${id}/decisions/options`, { kind, package_revision: revision });
    expect(o.statusCode, o.body).toBe(200);
    return owner("POST", `/packages/${id}/decisions`, {
      kind,
      package_revision: revision,
      ...(reason ? { reason } : {}),
      assertion: hardware.assert(o.json().options),
    });
  }

  beforeAll(async () => {
    h = await startHarness({ trustAnchors: [vendor.anchorPem] });
    ben = await signIn(h.app, plain);
    expect((await addOwnPasskey(h.app, ben, plain, hardware)).statusCode).toBe(200);
    const qual = {
      member_id: memberIdFor("ben"),
      licenses: [{ jurisdiction: "US-SC", number: "PE-1", expires_on: "2030-01-01" }],
      disciplines: ["mechanical-hvac"],
      grades: ["general-service", "safety"],
      roles: ["originator", "checker", "approver"],
      authorities: ["administrator", "lane", "policy"],
      reason: "Safety approver",
    };
    const qo = await owner("POST", "/admin/commands/qualification.issue/options", { payload: qual });
    expect(qo.statusCode, qo.body).toBe(200);
    const qr = await owner("POST", "/admin/commands/qualification.issue", {
      payload: qual,
      assertion: plain.assert(qo.json().options),
    });
    expect(qr.statusCode, qr.body).toBe(200);
  }, 120_000);

  afterAll(async () => h?.stop());

  it("refuses unattested pre-checks and single-family acceptance, then accepts once 2 distinct attested families pass", async () => {
    const pkgId = "WP-SAFE-QUORUM";
    await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'draft', $2)", [
      pkgId,
      { ...example, id: pkgId, revision: 0, status: "draft", grade: "safety", data_lane: "internal", design_inputs: [] },
    ]);

    expect((await decidePkg(pkgId, "release", 0)).statusCode).toBe(201);

    const author = await claim(["fake"]);
    expect(author?.run.role).toBe("author");
    const authored = await asDaemon(`/runner/runs/${author.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "calc.md", content_base64: b64("# Calc") }],
    });
    expect(authored.statusCode, authored.body).toBeLessThan(300);

    // Even with an owner independence override, an unattested fake pre-check on Safety is refused by the kernel.
    expect(await claim(["fake"])).toBeNull();
    const viewAfterHold = (await owner("GET", `/packages/${pkgId}`)).json();
    const heldCheck = viewAfterHold.runs.find((r: { role: string }) => r.role === "pre-check");
    expect(heldCheck?.waiting_cause).toBe("independent-runtime");
    const ovOpt = await owner("POST", `/packages/${pkgId}/runs/${heldCheck.id}/override-independence/options`, {
      reason: "Testing that override never waives Safety attestation",
    });
    expect(ovOpt.statusCode, ovOpt.body).toBe(200);
    const ovRes = await owner("POST", `/packages/${pkgId}/runs/${heldCheck.id}/override-independence`, {
      reason: "Testing that override never waives Safety attestation",
      assertion: hardware.assert(ovOpt.json().options),
    });
    expect(ovRes.statusCode, ovRes.body).toBe(200);
    const unattested = await claim(["fake"]);
    expect(unattested?.run.role).toBe("pre-check");
    const refusedCheck = await asDaemon(`/runner/runs/${unattested.run.id}/complete`, {
      status: "succeeded",
      outputs: [],
      verification: { outcome: "pass", findings: [] },
    });
    expect(refusedCheck.statusCode, refusedCheck.body).toBe(200);
    expect(refusedCheck.json().status).toBe("failed");
    expect((await h.db.query("select 1 from verifications where package_id = $1", [pkgId])).rowCount).toBe(0);

    // Request and run first attested check on codex (OpenAI).
    expect((await owner("POST", `/packages/${pkgId}/checks`)).statusCode).toBe(201);
    const check1 = await claim(["codex", "claude"]);
    expect(check1?.run.runtime.provider).toBe("codex");
    const done1 = await asDaemon(`/runner/runs/${check1.run.id}/complete`, {
      status: "succeeded",
      outputs: [],
      verification: { outcome: "pass", findings: [] },
    });
    expect(done1.statusCode, done1.body).toBe(200);
    expect(done1.json().status).toBe("succeeded");

    // 1-of-2 checkers: accept and accept-with-findings are both refused.
    const actionsAfterOne = (await owner("GET", `/packages/${pkgId}/actions`)).json() as {
      command: string;
      allowed: boolean;
    }[];
    expect(actionsAfterOne.find((a) => a.command === "accept")?.allowed).toBe(false);
    expect(actionsAfterOne.find((a) => a.command === "accept-with-findings")?.allowed).toBe(false);
    expect((await decidePkg(pkgId, "accept", 0)).statusCode).toBe(403);
    expect((await decidePkg(pkgId, "accept-with-findings", 0, "Only one checker")).statusCode).toBe(403);

    // Requesting a second check on the same vendor family (codex) must NOT satisfy 2-of-2 quorum.
    expect((await owner("POST", `/packages/${pkgId}/checks`)).statusCode).toBe(201);
    const sameFam = await claim(["codex"]);
    expect(sameFam?.run.runtime.provider).toBe("codex");
    expect(
      (
        await asDaemon(`/runner/runs/${sameFam.run.id}/complete`, {
          status: "succeeded",
          outputs: [],
          verification: { outcome: "pass", findings: [] },
        })
      ).json().status,
    ).toBe("succeeded");
    expect((await decidePkg(pkgId, "accept", 0)).statusCode).toBe(403);

    // Request another check with both ["codex", "claude"] offered: pickChecker prefers unused family ("claude").
    expect((await owner("POST", `/packages/${pkgId}/checks`)).statusCode).toBe(201);
    const check2 = await claim(["codex", "claude"]);
    expect(check2?.run.runtime.provider).toBe("claude");
    const done2 = await asDaemon(`/runner/runs/${check2.run.id}/complete`, {
      status: "succeeded",
      outputs: [],
      verification: { outcome: "pass", findings: [] },
    });
    expect(done2.statusCode, done2.body).toBe(200);
    expect(done2.json().status).toBe("succeeded");

    // Now 2 distinct attested checker families passed -> actions allow accept and decision succeeds.
    const actionsAfterTwo = (await owner("GET", `/packages/${pkgId}/actions`)).json() as {
      command: string;
      allowed: boolean;
    }[];
    expect(actionsAfterTwo.find((a) => a.command === "accept")?.allowed).toBe(true);
    expect(actionsAfterTwo.find((a) => a.command === "accept-with-findings")?.allowed).toBe(true);
    const accepted = await decidePkg(pkgId, "accept", 0);
    expect(accepted.statusCode, accepted.body).toBe(201);
    expect((await owner("GET", `/packages/${pkgId}`)).json().package.status).toBe("accepted");
  });

  it("refuses Safety inconclusive second seat at MAX_ROUNDS and allows accept-with-findings once 2 distinct attested families have decisive checks", async () => {
    const pkgId = "WP-SAFE-FINDINGS";
    await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'draft', $2)", [
      pkgId,
      { ...example, id: pkgId, revision: 0, status: "draft", grade: "safety", data_lane: "internal", design_inputs: [] },
    ]);
    expect((await decidePkg(pkgId, "release", 0)).statusCode).toBe(201);

    // Advance to round 3 (MAX_ROUNDS) so non-pass second-seat verdicts keep the package in-verification.
    for (const round of [1, 2]) {
      const a = await claim(["fake"]);
      expect(a?.run.role).toBe("author");
      expect(a?.run.round).toBe(round);
      expect(
        (
          await asDaemon(`/runner/runs/${a.run.id}/complete`, {
            status: "succeeded",
            outputs: [{ name: "calc.md", content_base64: b64(`# Calc r${round}`) }],
          })
        ).statusCode,
      ).toBeLessThan(300);

      // Earlier round's attested fail on claude must not carry forward to round 3's deliverable.
      const prevCheck = await claim(["claude"]);
      expect(prevCheck?.run.role).toBe("pre-check");
      expect(prevCheck?.run.round).toBe(round);
      expect(
        (
          await asDaemon(`/runner/runs/${prevCheck.run.id}/complete`, {
            status: "succeeded",
            outputs: [],
            verification: { outcome: "fail", findings: [{ id: `F-R${round}`, severity: "minor", text: "Revise" }] },
          })
        ).json().status,
      ).toBe("succeeded");
    }

    const a3 = await claim(["fake"]);
    expect(a3?.run.role).toBe("author");
    expect(a3?.run.round).toBe(3);
    expect(
      (
        await asDaemon(`/runner/runs/${a3.run.id}/complete`, {
          status: "succeeded",
          outputs: [{ name: "calc.md", content_base64: b64("# Calc r3") }],
        })
      ).statusCode,
    ).toBeLessThan(300);

    // First attested round-3 check passes on codex.
    const c1 = await claim(["codex"]);
    expect(c1?.run.role).toBe("pre-check");
    expect(c1?.run.runtime.provider).toBe("codex");
    expect(
      (
        await asDaemon(`/runner/runs/${c1.run.id}/complete`, {
          status: "succeeded",
          outputs: [],
          verification: { outcome: "pass", findings: [] },
        })
      ).json().status,
    ).toBe("succeeded");

    // Inconclusive attested check on claude at MAX_ROUNDS keeps status in-verification, but does NOT satisfy quorum.
    expect((await owner("POST", `/packages/${pkgId}/checks`)).statusCode).toBe(201);
    const cInc = await claim(["codex", "claude"]);
    expect(cInc?.run.runtime.provider).toBe("claude");
    expect(
      (
        await asDaemon(`/runner/runs/${cInc.run.id}/complete`, {
          status: "succeeded",
          outputs: [],
          verification: { outcome: "inconclusive", findings: [] },
        })
      ).json().status,
    ).toBe("succeeded");
    expect((await decidePkg(pkgId, "accept-with-findings", 0, "Inconclusive second seat")).statusCode).toBe(403);

    // Second decisive attested check on claude reports fail with finding.
    expect((await owner("POST", `/packages/${pkgId}/checks`)).statusCode).toBe(201);
    const c2 = await claim(["codex", "claude"]);
    expect(c2?.run.runtime.provider).toBe("claude");
    expect(
      (
        await asDaemon(`/runner/runs/${c2.run.id}/complete`, {
          status: "succeeded",
          outputs: [],
          verification: {
            outcome: "fail",
            findings: [{ id: "F-001", severity: "minor", text: "Note unit rounding" }],
          },
        })
      ).json().status,
    ).toBe("succeeded");

    // Plain accept is refused because c2 failed, while accept-with-findings with a reason is allowed.
    expect((await decidePkg(pkgId, "accept", 0)).statusCode).toBe(403);
    const accepted = await decidePkg(pkgId, "accept-with-findings", 0, "Minor rounding note accepted by PE");
    expect(accepted.statusCode, accepted.body).toBe(201);
    expect((await owner("GET", `/packages/${pkgId}`)).json().package.status).toBe("accepted");
  });
});
