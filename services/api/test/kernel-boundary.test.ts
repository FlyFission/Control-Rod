import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DaemonReply, sealDaemonPayload } from "./counted-check.js";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";
import { type KernelRequest, decide } from "../src/kernel.js";
import { RUNTIME_FAMILIES, distinctFamily } from "../src/runtimes.js";
import { familyOf, mayBeSameRuntime, vendorFamilies } from "../src/vendor-families.js";

/**
 * The kernel boundary (change record kernel-boundary): one vendor-family table, passed to the
 * kernel, and the claim holder checked by the kernel. These calls go through the compiled
 * WebAssembly the API runs.
 */

const preCheck = (author: string, checker: string, extra: Partial<KernelRequest> = {}): KernelRequest => ({
  status: "in-verification",
  action: "submit-pre-check",
  actor_kind: "agent",
  actor_id: "checker-x",
  author_baseline: "author-x",
  checker_baseline: "checker-x",
  author_runtime: { provider: author, model: "default" },
  checker_runtime: { provider: checker, model: "default" },
  vendor_families: vendorFamilies(),
  ...extra,
});

describe("the one vendor-family table", () => {
  it("comes from models.json and names no family for OpenCode or Ollama", () => {
    const families = vendorFamilies();
    expect(families).toMatchObject({ claude: "Anthropic", codex: "OpenAI", grok: "xAI", agy: "Google" });
    expect(families).not.toHaveProperty("opencode");
    expect(families).not.toHaveProperty("ollama");
    expect(RUNTIME_FAMILIES).toBe(families);
    expect(familyOf(" Claude ")).toBe("Anthropic");
    expect(familyOf("opencode")).toBeUndefined();
  });

  it("gives the API and the kernel the same answer for every pair of runtimes", () => {
    const providers = ["claude", " Codex", "grok", "agy", "fake", "opencode", "ollama", "anthropic", "", "unknown-cli"];
    for (const a of providers) {
      for (const b of providers) {
        if (!a.trim() || !b.trim()) continue;
        const out = decide(preCheck(a, b));
        const shared = mayBeSameRuntime(a, b);
        expect(out.allowed, `${a} / ${b}`).toBe(!shared);
        if (shared) expect(out.reason).toBe("not-independent");
        expect(distinctFamily(a, b)).toBe(!shared);
      }
    }
  });

  it("counts two providers of one family as the same runtime, and an unknown family too, until the owner overrides", () => {
    const families = { ...vendorFamilies(), "anthropic-api": "Anthropic" };
    expect(decide(preCheck("claude", "anthropic-api", { vendor_families: families })).reason).toBe("not-independent");
    expect(decide(preCheck("claude", "opencode")).reason).toBe("not-independent");
    expect(decide(preCheck("claude", "codex", { vendor_families: {} })).reason).toBe("not-independent");
    const { vendor_families: _omitted, ...withoutTable } = preCheck("claude", "codex");
    expect(decide(withoutTable).reason).toBe("not-independent");
    expect(decide(preCheck("claude", "opencode", { owner_override_verified: true })).allowed).toBe(true);
    expect(decide(preCheck("claude", "codex")).allowed).toBe(true);
  });

  it("refuses a pre-check submitted by an agent other than the checker it names", () => {
    expect(decide(preCheck("claude", "codex", { actor_id: "checker-y" })).reason).toBe("forbidden");
  });
});

describe("the claim holder", () => {
  const work = (action: "submit-output" | "revise", claimed_by?: string): KernelRequest => ({
    status: action === "submit-output" ? "in-work" : "in-verification",
    action,
    actor_kind: "agent",
    actor_id: "author-claude",
    ...(claimed_by === undefined ? {} : { claimed_by }),
    pre_check: "fail",
  });

  it("is the only agent that may submit output or revise", () => {
    for (const action of ["submit-output", "revise"] as const) {
      expect(decide(work(action, "author-claude")).allowed, action).toBe(true);
      for (const holder of [undefined, "", "author-codex", "Author-Claude"]) {
        const out = decide(work(action, holder));
        expect(out, `${action} held by ${String(holder)}`).toMatchObject({ allowed: false, reason: "forbidden", next: null });
      }
    }
  });
});

describe("a submit from a run that does not hold the claim", () => {
  let h: Harness;
  let cookie: string;
  const passkey = new VirtualAuthenticator();

  beforeAll(async () => {
    h = await startHarness();
    cookie = await signIn(h.app, passkey);
  }, 120_000);
  afterAll(async () => h?.stop());

  const asOwner = (method: "GET" | "POST", url: string, payload?: unknown) =>
    h.app.inject({ method, url, headers: { cookie, ...(method === "GET" ? {} : { origin: ORIGIN }) }, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const asDaemon = async (url: string, payload: unknown): Promise<DaemonReply> => {
    const body = await sealDaemonPayload(h.admin, url, withClaim(url, payload as Record<string, unknown>));
    return (await h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: body })) as DaemonReply;
  };
  const claim = async () => {
    const r = await asDaemon("/runner/claim", { runtimes: ["fake"] });
    expect(r.statusCode, r.body).toBe(200);
    const job = r.json() as { run: { id: string; role: string; package_id: string }; claim: { token: string } };
    claims.set(job.run.id, job.claim.token);
    return job;
  };

  it("is refused by the kernel and leaves the card in work", async () => {
    const c = await asOwner("POST", "/captures", { lane: "internal", text: "Make CLAIMS" });
    expect(c.statusCode, c.body).toBe(201);
    const intake = await claim();
    const draft = {
      schema_version: "0.1.0", id: "CLAIMS", revision: 0, title: "Package CLAIMS", project: "PRJ-TEST",
      mode: "capital-projects", status: "draft", rigor_mode: "standard", data_lane: "internal", objective: "Produce CLAIMS",
      deliverables: [{ id: "CLAIMS-D1", type: "report", format: ["md"] }], design_inputs: [],
      agent_assignment: [{ role: "general-author", agent_baseline: "author", baseline_revision: 0 }],
      acceptance_criteria: ["The report exists"],
      verification: {
        method: "agent-pre-check", verifier: "checker", verifier_receives: ["deliverables"],
        required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false },
      },
    };
    const drafted = await asDaemon(`/runner/runs/${intake.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "package.json", content_base64: b64(JSON.stringify(draft)) }],
    });
    expect(drafted.statusCode, drafted.body).toBeLessThan(300);
    const id = ((await asOwner("GET", "/packages")).json() as { id: string }[]).find((p) => p.id.endsWith("-CLAIMS"))!.id;
    const options = await asOwner("POST", `/packages/${id}/decisions/options`, { kind: "release", package_revision: 0 });
    expect(options.statusCode, options.body).toBe(200);
    const released = await asOwner("POST", `/packages/${id}/decisions`, { kind: "release", package_revision: 0, assertion: passkey.assert(options.json().options) });
    expect(released.statusCode, released.body).toBe(201);

    const author = await claim();
    expect(author.run).toMatchObject({ role: "author", package_id: id });
    // A later author run for the same revision now holds the claim on the work.
    await h.admin.query(
      `insert into runs (id, package_id, package_revision, role, round, status, body)
       select 'R-claim-holder', package_id, package_revision, role, round + 1, 'queued', body || '{"id":"R-claim-holder"}'::jsonb
       from runs where id = $1`,
      [author.run.id],
    );
    const late = await asDaemon(`/runner/runs/${author.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "report.md", content_base64: b64("# Report") }],
    });
    // The completion is kept on the record as failed, with the kernel's refusal.
    expect(late.statusCode, late.body).toBe(200);
    expect(late.json()).toMatchObject({ status: "failed", refusal: { code: "forbidden" } });
    const pkg = (await h.db.query<{ status: string }>("select status from packages where id = $1", [id])).rows[0];
    expect(pkg?.status).toBe("in-work");
  });
});
