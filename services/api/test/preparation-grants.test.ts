import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { preparedHarness } from "./preparation-flow.js";
import {
  grantConfig,
  grantRun,
  grantHeaders,
} from "./preparation-grant-fixture.js";
import { issuePreparationGrant } from "../src/preparation/grants.js";
import { daemonHeaders } from "./harness.js";
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
let f: Awaited<ReturnType<typeof preparedHarness>>;
beforeAll(async () => {
  f = await preparedHarness();
}, 120_000);
afterAll(async () => f?.h.stop());
async function issued(options: Parameters<typeof grantRun>[1] = {}) {
  const seed = await grantRun(f, options);
  const issued = await issuePreparationGrant(
    f.h.db,
    grantConfig,
    seed.run.id,
    seed.token,
  );
  return { ...seed, ...issued, claimToken: seed.token };
}
const begin = (id: string, token: string, intent: unknown) =>
  f.h.app.inject({
    method: "POST",
    url: `/runner/preparation-grants/${id}/begin`,
    headers: grantHeaders(token),
    payload: intent as object,
  });
const finish = (id: string, token: string, permit: any, result: unknown) =>
  f.h.app.inject({
    method: "POST",
    url: `/runner/preparation-grants/${id}/finalize`,
    headers: grantHeaders(token),
    payload: { use_id: permit.use_id, use_token: permit.use_token, result },
  });
describe("controller-owned preparation grant authority", () => {
  it("derives immutable input custody and grants only the existing running scoped attempt", async () => {
    const v = await issued();
    expect(v.grant.role).toBe("requirements-preparer");
    expect(v.grant.run_id).toBe(v.run.id);
    expect(v.inputs.length).toBeGreaterThan(0);
    for (const source of v.inputs) {
      const pin = v.grant.inputs.find((x) => x.id === source.id)!;
      expect(pin.digest.value).toBe(sha(source.bytes));
      expect(pin.bytes).toBe(source.bytes.length);
    }
    await expect(
      issuePreparationGrant(f.h.db, grantConfig, v.run.id, v.claimToken),
    ).rejects.toMatchObject({ status: 409 });
    const wrong = await grantRun(f);
    await expect(
      issuePreparationGrant(f.h.db, grantConfig, wrong.run.id, "wrong-claim"),
    ).rejects.toMatchObject({ status: 403 });
    const technical = await grantRun(f, { role: "technical-preparer" });
    await expect(
      issuePreparationGrant(
        f.h.db,
        grantConfig,
        technical.run.id,
        technical.token,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("requires the narrow grant token rather than browser or daemon authority", async () => {
    const v = await issued();
    const url = `/runner/preparation-grants/${v.grant.id}/begin`;
    for (const headers of [
      { cookie: f.cookie },
      daemonHeaders,
      grantHeaders("wrong"),
    ]) {
      const r = await f.h.app.inject({
        method: "POST",
        url,
        headers,
        payload: { kind: "inspect" },
      });
      expect(r.statusCode, r.body).toBe(401);
    }
    const r = await begin(v.grant.id, v.token, { kind: "inspect" });
    expect(r.statusCode, r.body).toBe(200);
    const done = await finish(v.grant.id, v.token, r.json(), {
      kind: "inspect",
    });
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json().custody).toBe("authorization-only");
  });
  it.each(["stop", "revoke", "edit", "claim-turnover", "assignment-turnover"])(
    "refuses a pending operation after %s",
    async (kind) => {
      const v = await issued();
      const r = await begin(v.grant.id, v.token, { kind: "inspect" });
      expect(r.statusCode, r.body).toBe(200);
      if (kind === "stop")
        expect(
          (
            await f.owner(
              "POST",
              `/packages/${v.p.id}/runs/${v.run.id}/stop`,
              {},
            )
          ).statusCode,
        ).toBe(200);
      if (kind === "revoke")
        expect(
          (
            await f.owner(
              "POST",
              `/packages/${v.p.id}/preparation-grants/${v.grant.id}/revoke`,
              {},
            )
          ).statusCode,
        ).toBe(200);
      if (kind === "edit") {
        const view = (await f.owner("GET", v.p.url)).json();
        const { preparationContent } =
          await import("../src/preparation/store.js");
        const content = preparationContent(view.snapshot);
        content.context.implementation_notes =
          "Nonbinding notes still change full content";
        expect(
          (
            await f.owner("PUT", v.p.url, content, {
              "if-match": `"${view.content_digest.value}"`,
            })
          ).statusCode,
        ).toBe(200);
      }
      if (kind === "claim-turnover")
        await f.adminQuery("update runs set claim_token_hash=$2 where id=$1", [
          v.run.id,
          sha(Buffer.from("new claim")),
        ]);
      if (kind === "assignment-turnover")
        await f.adminQuery(
          "update runs set body=jsonb_set(body,'{runtime,provider}',to_jsonb('changed-provider'::text)) where id=$1",
          [v.run.id],
        );
      const done = await finish(v.grant.id, v.token, r.json(), {
        kind: "inspect",
      });
      expect(done.statusCode, done.body).toBe(409);
      expect(
        (
          await f.h.db.query(
            "select 1 from preparation_grant_receipts where use_id=$1",
            [r.json().use_id],
          )
        ).rowCount,
      ).toBe(0);
    },
  );
  it("admits a read only for its exact assigned pin and retains a proposal exactly once", async () => {
    const v = await issued(),
      pin = v.grant.inputs[0]!;
    const read = await begin(v.grant.id, v.token, {
      kind: "read-input",
      input_id: pin.id,
    });
    expect(read.statusCode, read.body).toBe(200);
    const wrong = await finish(v.grant.id, v.token, read.json(), {
      kind: "read-input",
      input_id: pin.id,
      digest: { algorithm: "sha256", value: "0".repeat(64) },
      bytes: pin.bytes,
    });
    expect(wrong.statusCode, wrong.body).toBe(409);
    const correct = await finish(v.grant.id, v.token, read.json(), {
      kind: "read-input",
      input_id: pin.id,
      digest: pin.digest,
      bytes: pin.bytes,
    });
    expect(correct.statusCode, correct.body).toBe(200);
    expect(correct.json().custody).toBe("broker-reported-read");
    const write = await begin(v.grant.id, v.token, { kind: "write-proposal" });
    expect(write.statusCode, write.body).toBe(200);
    const result = {
      kind: "write-proposal",
      content_base64: Buffer.from(
        "Owner reviews this untrusted proposal",
      ).toString("base64"),
    };
    const first = await finish(v.grant.id, v.token, write.json(), result);
    expect(first.statusCode, first.body).toBe(200);
    const replay = await finish(v.grant.id, v.token, write.json(), result);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toEqual(first.json());
    const changed = await finish(v.grant.id, v.token, write.json(), {
      ...result,
      content_base64: Buffer.from("changed").toString("base64"),
    });
    expect(changed.statusCode).toBe(409);
    expect(
      (await f.h.db.query("select status from packages where id=$1", [v.p.id]))
        .rows[0].status,
    ).toBe("draft");
    expect(
      (
        await f.h.db.query("select 1 from outputs where package_id=$1", [
          v.p.id,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await f.h.db.query("select 1 from verifications where package_id=$1", [
          v.p.id,
        ])
      ).rowCount,
    ).toBe(0);
    expect((await f.owner("GET", v.p.url)).json().snapshot.revision).toBe(
      v.grant.preparation_revision,
    );
    const stored = (
      await f.h.db.query(
        "select bytes,sha256 from preparation_grant_proposals where grant_id=$1",
        [v.grant.id],
      )
    ).rows;
    expect(stored).toHaveLength(1);
    expect(stored[0].sha256).toBe(sha(stored[0].bytes));
    const events = JSON.stringify(
      (await f.h.db.query("select body from events")).rows,
    );
    expect(events).not.toContain(v.token);
    expect(events).not.toContain(write.json().use_token);
    expect(events).not.toContain(result.content_base64);
    await f.owner(
      "POST",
      `/packages/${v.p.id}/preparation-grants/${v.grant.id}/revoke`,
      {},
    );
    expect(
      (await finish(v.grant.id, v.token, write.json(), result)).statusCode,
    ).toBe(409);
  });
  it("bounds pending permits and rejects operation and secret substitution", async () => {
    const a = await issued(),
      b = await issued();
    const p = await begin(a.grant.id, a.token, { kind: "inspect" });
    expect(p.statusCode).toBe(200);
    const second = await begin(a.grant.id, a.token, { kind: "inspect" });
    expect(second.statusCode).toBe(200);
    expect(
      (await begin(a.grant.id, a.token, { kind: "inspect" })).statusCode,
    ).toBe(409);
    expect(
      (await finish(b.grant.id, b.token, p.json(), { kind: "inspect" }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await finish(
          a.grant.id,
          a.token,
          { ...p.json(), use_token: "wrong" },
          { kind: "inspect" },
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await finish(a.grant.id, a.token, p.json(), {
          kind: "write-proposal",
          content_base64: "",
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await begin(b.grant.id, b.token, { kind: "release" })).statusCode,
    ).toBe(400);
    expect(
      (
        await begin(b.grant.id, b.token, {
          kind: "read-input",
          input_id: "/etc/passwd",
        })
      ).statusCode,
    ).toBe(409);
  });
});

describe("grant input and payload integrity", () => {
  it("refuses a mismatched stored package identity before issuing authority", async () => {
    const v = await grantRun(f);
    await f.adminQuery(
      "update packages set body=jsonb_set(body,'{id}',to_jsonb('different-package'::text)) where id=$1",
      [v.p.id],
    );
    await expect(
      issuePreparationGrant(f.h.db, grantConfig, v.run.id, v.token),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("accepts the actual byte ceiling and rejects ambiguous encodings", async () => {
    const v = await issued(),
      p = await begin(v.grant.id, v.token, { kind: "write-proposal" });
    expect(p.statusCode, p.body).toBe(200);
    for (const raw of ["YQ", "YQ=", "YR==", "Y Q=="]) {
      const r = await finish(v.grant.id, v.token, p.json(), {
        kind: "write-proposal",
        content_base64: raw,
      });
      expect(r.statusCode, r.body).toBe(400);
    }
    const bytes = Buffer.alloc(v.grant.max_proposal_bytes, 65);
    const r = await finish(v.grant.id, v.token, p.json(), {
      kind: "write-proposal",
      content_base64: bytes.toString("base64"),
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().bytes).toBe(bytes.length);
  });
});

it("requires a controlled origin pin and rechecks captured bytes rather than mutable routing", async () => {
  const { randomUUID } = await import("node:crypto");
  const { digest } = await import("../src/kernel.js");
  const { preparationContent } = await import("../src/preparation/store.js");
  const seed = await grantRun(f),
    capture = {
      schema_version: "0.1.0",
      id: `CAP-${randomUUID()}`,
      text: "Original requester words",
      source: "web",
      created_at: new Date().toISOString(),
    },
    attachment = Buffer.from("Original attachment bytes");
  await f.adminQuery(
    "insert into captures(id,body,created_at) values($1,$2,$3)",
    [capture.id, capture, capture.created_at],
  );
  await f.adminQuery(
    "insert into attachments(capture_id,name,sha256,bytes) values($1,'original.txt',$2,$3)",
    [capture.id, sha(attachment), attachment],
  );
  await f.adminQuery("update packages set capture_id=$2 where id=$1", [
    seed.p.id,
    capture.id,
  ]);
  const refused = await issuePreparationGrant(
    f.h.db,
    grantConfig,
    seed.run.id,
    seed.token,
  ).then(
    () => ({ status: 0 }),
    (error) => error,
  );
  expect(refused.status).toBe(409);
  const view = (await f.owner("GET", seed.p.url)).json(),
    content = preparationContent(view.snapshot);
  content.basis.push(
    {
      kind: "capture",
      reference: `capture:${capture.id}`,
      revision: "0",
      digest: { algorithm: "sha256", value: digest(capture) },
    },
    {
      kind: "attachment",
      reference: `attachment:${capture.id}/original.txt`,
      revision: "0",
      digest: { algorithm: "sha256", value: sha(attachment) },
    },
  );
  expect(
    (
      await f.owner("PUT", seed.p.url, content, {
        "if-match": `"${view.content_digest.value}"`,
      })
    ).statusCode,
  ).toBe(200);
  const v = await issuePreparationGrant(
    f.h.db,
    grantConfig,
    seed.run.id,
    seed.token,
  );
  expect(v.grant.inputs).toHaveLength(3);
  expect(v.inputs.find((x) => x.id === "attachment-0")!.bytes).toEqual(
    attachment,
  );
  await f.adminQuery(
    'update captures set body=body||\'{"disposition":"answered","answer":"routing only"}\'::jsonb where id=$1',
    [capture.id],
  );
  const p = await begin(v.grant.id, v.token, { kind: "inspect" });
  expect(p.statusCode, p.body).toBe(200);
  expect(
    (await finish(v.grant.id, v.token, p.json(), { kind: "inspect" }))
      .statusCode,
  ).toBe(200);
  const pending = await begin(v.grant.id, v.token, { kind: "inspect" });
  expect(pending.statusCode).toBe(200);
  await f.adminQuery(
    "update attachments set bytes=$2,sha256=$3 where capture_id=$1",
    [
      capture.id,
      Buffer.from("changed coherently"),
      sha(Buffer.from("changed coherently")),
    ],
  );
  expect(
    (await finish(v.grant.id, v.token, pending.json(), { kind: "inspect" }))
      .statusCode,
  ).toBe(409);
});

it("rejects duplicate-key and extra-authority messages before executing a grant operation", async () => {
  const v = await issued();
  const url = `/runner/preparation-grants/${v.grant.id}/begin`;
  for (const payload of [
    '{"kind":"inspect","kind":"write-proposal"}',
    '{"kind":"inspect","approved":true}',
    '{"kind":"read-input","input_id":"preparation","path":"/etc/passwd"}',
  ]) {
    const r = await f.h.app.inject({
      method: "POST",
      url,
      headers: { ...grantHeaders(v.token), "content-type": "application/json" },
      payload,
    });
    expect(r.statusCode, r.body).toBe(400);
  }
  expect(
    (
      await f.h.db.query(
        "select 1 from preparation_grant_uses where grant_id=$1",
        [v.grant.id],
      )
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await f.h.app.inject({
        method: "POST",
        url: "/runner/preparation-grants",
        headers: daemonHeaders,
        payload: { run_id: v.run.id },
      })
    ).statusCode,
  ).toBe(404);
});

it("requires grant credentials before parsing an untrusted RPC body", async () => {
  const v = await issued();
  const r = await f.h.app.inject({
    method: "POST",
    url: `/runner/preparation-grants/${v.grant.id}/begin`,
    headers: { "content-type": "application/json" },
    payload: '{"unfinished":',
  });
  expect(r.statusCode, r.body).toBe(401);
});

it("refuses issuance when a pinned original attachment is missing", async () => {
  const { randomUUID } = await import("node:crypto");
  const { digest } = await import("../src/kernel.js");
  const { preparationContent } = await import("../src/preparation/store.js");
  const seed = await grantRun(f);
  const capture = {
    schema_version: "0.1.0",
    id: `CAP-${randomUUID()}`,
    text: "Original request",
    source: "web",
    created_at: new Date().toISOString(),
  };
  const bytes = Buffer.from("Original attachment");
  await f.adminQuery(
    "insert into captures(id,body,created_at) values($1,$2,$3)",
    [capture.id, capture, capture.created_at],
  );
  await f.adminQuery(
    "insert into attachments(capture_id,name,sha256,bytes) values($1,'original.txt',$2,$3)",
    [capture.id, sha(bytes), bytes],
  );
  await f.adminQuery("update packages set capture_id=$2 where id=$1", [
    seed.p.id,
    capture.id,
  ]);
  const view = (await f.owner("GET", seed.p.url)).json(),
    content = preparationContent(view.snapshot);
  content.basis.push(
    {
      kind: "capture",
      reference: `capture:${capture.id}`,
      revision: "0",
      digest: { algorithm: "sha256", value: digest(capture) },
    },
    {
      kind: "attachment",
      reference: `attachment:${capture.id}/original.txt`,
      revision: "0",
      digest: { algorithm: "sha256", value: sha(bytes) },
    },
  );
  expect(
    (
      await f.owner("PUT", seed.p.url, content, {
        "if-match": `"${view.content_digest.value}"`,
      })
    ).statusCode,
  ).toBe(200);
  await f.adminQuery(
    "delete from attachments where capture_id=$1 and name='original.txt'",
    [capture.id],
  );
  const outcome = await issuePreparationGrant(
    f.h.db,
    grantConfig,
    seed.run.id,
    seed.token,
  ).then(
    () => ({ status: 0 }),
    (e) => ({ status: e.status }),
  );
  expect(outcome.status).toBe(409);
  expect(
    (
      await f.h.db.query("select 1 from preparation_grants where run_id=$1", [
        seed.run.id,
      ])
    ).rowCount,
  ).toBe(0);
});

it("preserves retained proposal custody and accurate recovery guidance after lease retirement", async () => {
  const { sweepLost } = await import("../src/work.js");
  const v = await issued(),
    permit = await begin(v.grant.id, v.token, { kind: "write-proposal" });
  expect(permit.statusCode, permit.body).toBe(200);
  const response = await finish(v.grant.id, v.token, permit.json(), {
    kind: "write-proposal",
    content_base64: Buffer.from("Retained evidence").toString("base64"),
  });
  expect(response.statusCode, response.body).toBe(200);
  await f.adminQuery(
    "update runs set lease_expires_at=clock_timestamp()-interval '1 second',body=jsonb_set(body,'{lease_expires_at}',to_jsonb((clock_timestamp()-interval '1 second')::text)) where id=$1",
    [v.run.id],
  );
  await sweepLost(f.h.db, { ...grantConfig, root: process.cwd() });
  const run = (
    await f.h.db.query("select body from runs where id=$1", [v.run.id])
  ).rows[0].body;
  expect(run.status).toBe("lost");
  expect(run.error).not.toContain("Nothing was recorded");
  expect(run.error).not.toContain("the owner can requeue");
  expect(run.error).toContain("retained proposals or receipts");
  expect(
    (
      await f.h.db.query(
        "select bytes from preparation_grant_proposals where grant_id=$1",
        [v.grant.id],
      )
    ).rows[0].bytes,
  ).toEqual(Buffer.from("Retained evidence"));
  expect(
    (
      await f.h.db.query(
        "select 1 from preparation_grant_receipts where grant_id=$1",
        [v.grant.id],
      )
    ).rowCount,
  ).toBe(1);
  expect(
    (await f.owner("POST", `/packages/${v.p.id}/runs/${v.run.id}/requeue`))
      .statusCode,
  ).toBe(409);
});
it("caps each new permit and its commit guard at the currently shortened run lease", async () => {
  const v = await issued();
  const shorter = new Date(Date.now() + 15_000).toISOString();
  await f.adminQuery(
    "update runs set lease_expires_at=$2::timestamptz,body=jsonb_set(body,'{lease_expires_at}',to_jsonb($2::text)) where id=$1",
    [v.run.id, shorter],
  );
  const permit = await begin(v.grant.id, v.token, { kind: "inspect" });
  expect(permit.statusCode, permit.body).toBe(200);
  const lease = new Date(shorter).getTime();
  expect(new Date(permit.json().expires_at).getTime()).toBe(lease);
  const stored = (
    await f.h.db.query(
      "select u.expires_at,g.deadline from preparation_grant_uses u join preparation_grant_guards g on g.use_id=u.id where u.id=$1",
      [permit.json().use_id],
    )
  ).rows;
  expect(stored).toHaveLength(1);
  expect(stored[0].expires_at.getTime()).toBe(lease);
  expect(stored[0].deadline.getTime()).toBe(lease);
});
