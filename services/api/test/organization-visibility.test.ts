import { readFileSync } from "node:fs";
import { request, type ClientRequest, type IncomingMessage } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { appendEvent, bus, type Actor, type EventRecord } from "../src/events.js";
import { addMember, createOrganization, memberIdFor, setStatus } from "../src/tenancy.js";
import { type Harness, ORIGIN, VirtualAuthenticator, signIn, startHarness } from "./harness.js";

const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
const local: Actor = { kind: "human", id: memberIdFor("ben") };
const second: Actor = { kind: "human", id: memberIdFor("other") };
const system: Actor = { kind: "system", id: "control-plane" };
let h: Harness;
let cookie: string;
let cursor: number;
let localHead: number;

async function seed(tx: Parameters<typeof appendEvent>[0], id: string) {
  const now = new Date().toISOString();
  const pending = { schema_version: "0.1.0", id: `C-${id}`, text: `${id} capture`, source: "web", created_at: now, disposition: "pending" };
  await tx.query("insert into captures(id, body, created_at) values ($1, $2, $3), ($4, $5, $3)",
    [pending.id, pending, now, `C-${id}-answered`, { ...pending, id: `C-${id}-answered`, disposition: "answered" }]);
  const pkg = { ...example, id: `WP-${id}`, revision: 0, status: "in-verification", data_lane: "internal", design_inputs: [] };
  await tx.query("insert into packages(id, revision, status, body) values ($1, 0, 'in-verification', $2), ($3, 0, 'accepted', $4)",
    [pkg.id, pkg, `WP-${id}-accepted`, { ...pkg, id: `WP-${id}-accepted`, status: "accepted" }]);
  await tx.query("insert into decisions(id, package_id, package_revision, kind, body) values ($1, $2, 0, 'accept', '{}')",
    [`D-${id}`, `WP-${id}-accepted`]);
  for (const [role, parent] of [["intake", pending.id], ["author", pkg.id]]) {
    const run = { schema_version: "0.1.0", id: `R-${id}-${role}`, package_id: parent, package_revision: 0,
      role, agent_baseline: `${role}-claude`, runtime: { kind: "local", provider: "claude", model: "any" },
      round: 1, status: "queued", queued_at: now, generation: 1, waiting_reason: `${id} run waiting` };
    await tx.query("insert into runs(id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, $3, 1, 'queued', $4)",
      [run.id, run.package_id, run.role, run]);
  }
}

beforeAll(async () => {
  h = await startHarness({ streamReplayMax: 4 });
  cookie = await signIn(h.app, new VirtualAuthenticator());
  const tx = await h.admin.connect();
  try {
    await tx.query("begin");
    await seed(tx, "local");
    // This package moved out of verification. Its old revision contributes no open criteria.
    await tx.query(`insert into packages(id, revision, status, body)
      values ('WP-local-old', 0, 'in-verification', $1), ('WP-local-old', 1, 'draft', $2)`,
      [{ ...example, id: "WP-local-old", revision: 0, status: "in-verification" },
        { ...example, id: "WP-local-old", revision: 1, status: "draft" }]);
    await createOrganization(tx, { id: "org_second", name: "Second organization", status: "active" }, system);
    await addMember(tx, { id: second.id, org_id: "org_second", user_name: "other", display_name: "Other", status: "active" }, system);
    // The legacy writer's ownership trigger requires one active organization when inserting fixtures.
    await setStatus(tx, "organization", "org_local", "suspended", system, "Fixture switch");
    await seed(tx, "second");
    await setStatus(tx, "organization", "org_local", "active", system, "Fixture switch complete");
    cursor = (await appendEvent(tx, "package.drafted", "WP-local", local)).seq;
    await appendEvent(tx, "package.drafted", "WP-second", local);
    await appendEvent(tx, "package.edited", "WP-local", second);
    await appendEvent(tx, "package.edited", "WP-second", second);
    await appendEvent(tx, "decision.release", "WP-second", second);
    await appendEvent(tx, "run.reconciled", "R-second-author", second);
    await appendEvent(tx, "run.breaker", "R-second-author", system);
    await appendEvent(tx, "admin.command", "qualification.issue", second, { signature: "direct" });
    localHead = (await appendEvent(tx, "admin.command", "qualification.issue", local, { signature: "direct" })).seq;
    await appendEvent(tx, "capture.created", "C-second", second);
    await tx.query("commit");
  } finally {
    tx.release();
  }
}, 120_000);
afterAll(async () => h?.stop());

const get = (url: string) => h.app.inject({ method: "GET", url, headers: { cookie } });
const post = (url: string, payload: Record<string, unknown> = {}) =>
  h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload });

describe("organization visibility", () => {
  it("scopes captures, active work and both metrics to the caller", async () => {
    expect((await get("/captures")).json().map((c: { id: string }) => c.id).sort())
      .toEqual(["C-local", "C-local-answered"]);
    expect((await get("/runs")).json().map((r: { id: string }) => r.id).sort())
      .toEqual(["R-local-author", "R-local-intake"]);
    expect((await get("/metrics")).json()).toMatchObject({ packages_accepted: 1, quick_answers: 1 });
  });

  it("omits foreign held captures, digest entries and gate counts", async () => {
    const box = (await get(`/inbox?since=${cursor}`)).json();
    expect(JSON.stringify([box.items, box.waiting_on_others])).toContain("Intake: local capture");
    expect(JSON.stringify([box.items, box.waiting_on_others])).not.toContain("second capture");
    expect(box.digest.head).toBe(localHead);
    const lines = Object.fromEntries(box.digest.lines.map((line: { topic: string }) => [line.topic, line]));
    expect(lines.changes).toMatchObject({ count: 1, text: "1 package changed: 1 edited." });
    expect(lines.signatures).toMatchObject({ count: 1, text: "1 signature: 1 administrative act." });
    expect(lines.disputes.text).not.toContain("breaker");
    expect(lines.gates.count).toBe(example.acceptance_criteria.length);
  });

  it("lists and replays only visible events, preserving sequence order across the other organization's events", async () => {
    const rows = (await get(`/events?after=${cursor}`)).json() as EventRecord[];
    expect(rows.map((event) => event.type)).toEqual(["package.edited", "admin.command"]);
    expect(rows.map((event) => event.subject)).toEqual(["WP-local", "qualification.issue"]);
    expect((await get("/events/verify")).json()).toMatchObject({ ok: true, count: (await get("/events")).json().length });
    await h.app.listen({ port: 0, host: "127.0.0.1" });
    const port = (h.app.server.address() as { port: number }).port;
    const [client, response] = await new Promise<[ClientRequest, IncomingMessage]>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path: "/events/stream", headers: { cookie, "last-event-id": String(cursor) } },
        (res) => resolve([req, res]));
      req.on("error", reject);
      req.setTimeout(10_000, () => req.destroy(new Error("Event stream inactive")));
      req.end();
    });
    response.setEncoding("utf8");
    const chunks = response[Symbol.asyncIterator]();
    try {
      let buffer = "";
      const readThrough = async (seq: number) => {
        while (!buffer.includes(`id: ${seq}\nevent: event`) && !buffer.includes("event: loss")) {
          const chunk = await chunks.next();
          if (chunk.done) break;
          buffer += chunk.value;
        }
      };
      await readThrough(rows.at(-1)!.seq);
      const tx = await h.admin.connect();
      let live: EventRecord;
      try {
        await tx.query("begin");
        await appendEvent(tx, "package.edited", "WP-second", second);
        live = await appendEvent(tx, "package.edited", "WP-local", local);
        await tx.query("commit");
      } finally {
        tx.release();
      }
      bus.emit("event", live);
      await readThrough(live.seq);
      const ids = Array.from(buffer.matchAll(/^id: (\d+)$/gm), (match) => Number(match[1]));
      expect(ids).toEqual([...rows.map((event) => event.seq), live.seq]);
    } finally {
      client.destroy();
    }
  }, 15_000);

  it("requires the matching owner for run reads and mutations and capture classification", async () => {
    const path = "/packages/WP-second/runs/R-second-author";
    const conflicts = [
      await post(`${path}/stop`),
      await post(`${path}/requeue`),
      await post(`${path}/reconcile/options`, { reason: "A reconciliation reason" }),
      await post(`${path}/override-independence/options`, { reason: "An override reason" }),
      await get(`${path}/events`),
      await get(`${path}/log`),
      await get("/packages/WP-second/preparation/history"),
      await post("/packages/WP-second/preparation-grants/G-private/revoke"),
      await post("/packages/C-second/runs/R-second-intake/stop"),
      await post("/captures/C-second/classify", { lane: "internal" }),
    ];
    expect(conflicts.map((r) => r.statusCode)).toEqual(conflicts.map(() => 404));
    const ownPath = "/packages/C-local/runs/R-local-intake";
    expect((await get(`${ownPath}/log`)).statusCode).toBe(200);
    const stopped = await post(`${ownPath}/stop`);
    expect(stopped.statusCode, stopped.body).toBe(200);
    expect(stopped.json().status).toBe("stopped");
    expect((await h.db.query("select status from runs where id = 'R-second-author'")).rows[0]?.status).toBe("queued");
    expect((await h.db.query("select body->>'lane' as lane from captures where id = 'C-second'")).rows[0]?.lane).toBeNull();
  });
});
