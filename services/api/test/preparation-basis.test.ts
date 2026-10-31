import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { preparationContent } from "../src/preparation/store.js";
import { packageFixture } from "./preparation-fixtures.js";
import { preparedHarness } from "./preparation-flow.js";
let f: Awaited<ReturnType<typeof preparedHarness>>;
const dir = mkdtempSync(join(tmpdir(), "cr-basis-"));
const file = join(dir, "basis.md");
const repository = join(dir, "repo");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
beforeAll(async () => {
  execFileSync("git", ["init", "-q", repository]);
  writeFileSync(join(repository, "source.md"), "Pinned source");
  execFileSync("git", ["-C", repository, "add", "source.md"]);
  execFileSync("git", [
    "-C",
    repository,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--no-gpg-sign",
    "-qm",
    "Fixture",
  ]);
  writeFileSync(file, "Controlled source");
  f = await preparedHarness({
    preparationSources: {
      "document:test": { kind: "document", revision: "A", path: file },
      "document:plain": { kind: "document", revision: "A", path: file },
    },
    preparationRepositories: { "repository:test": repository },
    preparationLanes: { "document:test": "internal", "repository:test": "internal" },
  });
}, 120_000);
afterAll(async () => {
  await f?.h.stop();
  rmSync(dir, { recursive: true, force: true });
});
describe("prepared execution basis barriers", () => {
  it("claims a released run with immutable basis bytes and denies a changed package basis before claim", async () => {
    const p = await f.draft();
    await f.release(p.id);
    const r = await f.claim();
    expect(r.statusCode, r.body).toBe(200);
    expect(
      r
        .json()
        .inputs.some((v: { name: string }) => v.name.startsWith("basis/")),
    ).toBe(true);
    expect((await f.complete(r.json())).json().status).toBe("succeeded");
    const changed = await f.draft();
    await f.release(changed.id);
    await f.adminQuery(
      "update packages set body=jsonb_set(body,'{objective}','\"Changed basis\"') where id=$1",
      [changed.id],
    );
    expect((await f.claim()).statusCode).toBe(204);
    expect(
      (await f.owner("GET", `/packages/${changed.id}`)).json().runs[0]
        .waiting_reason,
    ).toMatch(/basis|preparation/i);
  });
  it("quarantines stale completion bytes and replays the refusal without advancing or duplicating history", async () => {
    const p = await f.draft();
    await f.release(p.id);
    const r = await f.claim();
    expect(r.statusCode, r.body).toBe(200);
    const job = r.json();
    await f.adminQuery(
      "update packages set body=jsonb_set(body,'{objective}','\"Changed basis\"') where id=$1",
      [p.id],
    );
    const a = await f.complete(job),
      b = await f.complete(job);
    expect(a.json().refusal.code).toBe("preparation-stale");
    expect(b.json()).toEqual(a.json());
    expect(
      (
        await f.h.db.query("select * from outputs where run_id=$1", [
          job.run.id,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await f.h.db.query(
          "select * from preparation_quarantined_outputs where run_id=$1",
          [job.run.id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (await f.owner("GET", `/packages/${p.id}`)).json().package.status,
    ).toBe("in-work");
  });
  it("refuses to pin a configured source the owner gave no data lane", async () => {
    const p = { ...packageFixture(), id: `WP-${randomUUID()}` };
    await f.h.admin.query("insert into packages(id,revision,status,body) values($1,0,'draft',$2)", [p.id, p]);
    const url = `/packages/${p.id}/preparation`;
    const enrolled = await f.owner("POST", url, { package_revision: 0, idempotency_key: "plain-source-1" });
    expect(enrolled.statusCode, enrolled.body).toBeLessThan(300);
    const v = enrolled.json();
    const content = preparationContent(v.snapshot);
    content.basis.push({ kind: "document", reference: "document:plain", revision: "A", digest: { algorithm: "sha256", value: sha("Controlled source") } });
    const r = await f.owner("PUT", url, content, { "if-match": `"${v.content_digest.value}"` });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ code: "unclassified-source", message: "document:plain has no data lane in the preparation config; the owner must classify it before it can be a source" });
  });

  it("pins document bytes at release, holds changed revisions and never publishes stopped successful output", async () => {
    writeFileSync(file, "Controlled source");
    const p = await f.draft([
      {
        kind: "document",
        reference: "document:test",
        revision: "A",
        digest: { algorithm: "sha256", value: sha("Controlled source") },
      },
    ]);
    await f.release(p.id);
    writeFileSync(file, "Changed document");
    expect((await f.claim()).statusCode).toBe(204);
    writeFileSync(file, "Controlled source");
    const r = await f.claim();
    expect(r.statusCode, r.body).toBe(200);
    const job = r.json();
    await f.owner("POST", `/packages/${p.id}/runs/${job.run.id}/stop`);
    const comp = await f.complete(job);
    expect(comp.json().status).toBe("stopped");
    expect(
      (
        await f.h.db.query("select * from outputs where run_id=$1", [
          job.run.id,
        ])
      ).rowCount,
    ).toBe(0);
  });
  it("refuses a changed repository HEAD or blob, even when a previous release was valid", async () => {
    const commit = execFileSync(
      "git",
      ["-C", repository, "rev-parse", "HEAD"],
      { encoding: "utf8" },
    ).trim();
    const p = await f.draft([
      {
        kind: "repository",
        reference: "repository:test",
        revision: commit,
        commit,
        path: "source.md",
        digest: { algorithm: "sha256", value: sha("Pinned source") },
      },
    ]);
    await f.release(p.id);
    writeFileSync(join(repository, "source.md"), "Uncommitted change");
    expect((await f.claim()).statusCode).toBe(204);
    writeFileSync(join(repository, "source.md"), "Pinned source");
    execFileSync("git", [
      "-C",
      repository,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "--allow-empty",
      "--no-gpg-sign",
      "-qm",
      "New basis",
    ]);
    expect((await f.claim()).statusCode).toBe(204);
  });
  it("retains late output once and advances preparation on a signed return without reusing confirmation", async () => {
    const p = await f.draft();
    await f.release(p.id);
    const r = await f.claim();
    expect(r.statusCode, r.body).toBe(200);
    const job = r.json();
    await f.adminQuery(
      "update runs set lease_expires_at=now()-interval '1 second' where id=$1",
      [job.run.id],
    );
    expect((await f.complete(job)).statusCode).toBe(409);
    expect((await f.complete(job)).statusCode).toBe(409);
    expect(
      (
        await f.h.db.query(
          "select * from preparation_quarantined_outputs where run_id=$1",
          [job.run.id],
        )
      ).rowCount,
    ).toBe(1);
    const o = await f.owner("POST", `/packages/${p.id}/decisions/options`, {
      kind: "return",
      package_revision: 0,
    });
    expect(o.statusCode, o.body).toBe(200);
    const returned = await f.owner("POST", `/packages/${p.id}/decisions`, {
      kind: "return",
      package_revision: 0,
      reason: "Refresh controlled basis",
      assertion: f.passkey.assert(o.json().options),
    });
    expect(returned.statusCode, returned.body).toBe(201);
    const v = (await f.owner("GET", p.url)).json();
    expect(v.snapshot.package_revision).toBe(1);
    expect(v.confirmed).toBe(false);
    expect(v.snapshot.id).toBe(p.view.snapshot.id);
  });
  it("linearizes a signed return racing with completion without publishing into the new revision", async () => {
    const p = await f.draft();
    await f.release(p.id);
    const job = (await f.claim()).json();
    const o = await f.owner("POST", `/packages/${p.id}/decisions/options`, {
      kind: "return",
      package_revision: 0,
    });
    expect(o.statusCode, o.body).toBe(200);
    const [returned, completed] = await Promise.all([
      f.owner("POST", `/packages/${p.id}/decisions`, {
        kind: "return",
        package_revision: 0,
        reason: "Revise the controlled request",
        assertion: f.passkey.assert(o.json().options),
      }),
      f.complete(job),
    ]);
    expect(returned.statusCode, returned.body).toBeLessThan(500);
    expect(completed.statusCode, completed.body).toBeLessThan(500);
    if (returned.statusCode === 201) {
      const v = (await f.owner("GET", p.url)).json();
      expect(v.snapshot.package_revision).toBe(1);
      expect(v.confirmed).toBe(false);
      expect(
        (await f.owner("GET", `/packages/${p.id}`)).json().outputs,
      ).toEqual([]);
    } else expect(completed.json().status).toBe("succeeded");
  });
});
