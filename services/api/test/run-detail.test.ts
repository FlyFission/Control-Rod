import { afterAll, beforeAll, expect, it } from "vitest";
import { type Harness, signIn, startHarness, VirtualAuthenticator } from "./harness.js";

let harness: Harness;
let cookie: string;

beforeAll(async () => {
  harness = await startHarness();
  cookie = await signIn(harness.app, new VirtualAuthenticator());
}, 120_000);

afterAll(async () => harness?.stop());

it("loads a recorded attempt from an earlier package revision", async () => {
  const id = "WP-attempt-history";
  for (const revision of [0, 1]) {
    await harness.admin.query(
      "insert into packages (id, revision, status, body) values ($1, $2, 'released', $3)",
      [id, revision, { id, revision, title: "Attempt history" }],
    );
  }
  const run = {
    id: "R-attempt-history",
    package_id: id,
    package_revision: 0,
    role: "author",
    status: "succeeded",
    runtime: { kind: "local", provider: "fake", model: "any" },
  };
  await harness.admin.query(
    "insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 1, 'succeeded', $3)",
    [run.id, id, run],
  );
  const received = await harness.app.inject({ method: "GET", url: `/packages/${id}/runs/${run.id}`, headers: { cookie } });
  expect(received.statusCode, received.body).toBe(200);
  expect(received.json()).toMatchObject(run);
});
