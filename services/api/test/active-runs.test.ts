import { afterAll, beforeAll, expect, it } from "vitest";
import { tx } from "../src/db/index.js";
import { createOrganization, LOCAL_ORG } from "../src/tenancy.js";
import { signIn, startHarness, VirtualAuthenticator, type Harness } from "./harness.js";

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
}, 120_000);
afterAll(async () => harness?.stop());

it("lists only active package and intake runs owned by the caller's organization", async () => {
  const cookie = await signIn(harness.app, new VirtualAuthenticator());
  await tx(harness.admin, (connection) =>
    createOrganization(connection, { id: "org_other", name: "Other", status: "suspended" }, { kind: "human", id: "owner" }),
  );
  await harness.admin.query(
    `insert into object_owners (object_kind, object_id, org_id) values
      ('package', 'pkg-local', $1), ('capture', 'cap-local', $1),
      ('package', 'pkg-other', 'org_other'), ('capture', 'cap-other', 'org_other'),
      ('package', 'cap-wrong-kind', $1)`,
    [LOCAL_ORG],
  );
  await harness.admin.query(
    `insert into runs (id, package_id, package_revision, role, round, status, body)
     select id, subject, 0, role, 1, status, jsonb_build_object('id', id) from (values
       ('r-local', 'pkg-local', 'author', 'running'),
       ('r-intake', 'cap-local', 'intake', 'queued'),
       ('r-finished', 'pkg-local', 'author', 'succeeded'),
       ('r-wrong-kind', 'cap-wrong-kind', 'intake', 'queued'),
       ('r-unowned', 'pkg-unowned', 'author', 'running')
     ) as fixture(id, subject, role, status)`,
  );

  // Legacy fixture inserts take the sole active organization. Switch it while recording the other
  // organization's runs, then restore the caller's organization before exercising the route.
  const setActiveOrg = (org: string) => harness.admin.query(
    `update organizations
        set body = jsonb_set(body, '{status}', to_jsonb(case when id = $1 then 'active' else 'suspended' end))
      where id in ($2, 'org_other')`,
    [org, LOCAL_ORG],
  );
  await setActiveOrg("org_other");
  await harness.admin.query(
    `insert into runs (id, package_id, package_revision, role, round, status, body)
     select id, subject, 0, role, 1, status, jsonb_build_object('id', id) from (values
       ('r-other', 'pkg-other', 'author', 'running'),
       ('r-other-intake', 'cap-other', 'intake', 'queued'),
       ('r-mismatched', 'pkg-local', 'pre-check', 'running')
     ) as fixture(id, subject, role, status)`,
  );
  await harness.admin.query(
    `update organizations set body = jsonb_set(body, '{status}', '"active"') where id = $1`,
    [LOCAL_ORG],
  );

  const result = await harness.app.inject({ method: "GET", url: "/runs", headers: { cookie } });
  expect(result.statusCode).toBe(200);
  expect(result.json()).toHaveLength(2);
  expect(result.json()).toEqual(expect.arrayContaining([
    { id: "r-local", status: "running" },
    { id: "r-intake", status: "queued" },
  ]));
});
