import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { preparedHarness } from "./preparation-flow.js";
import { buildApp } from "../src/app.js";
import { hashToken } from "../src/auth.js";
import { migrate } from "../src/db/migrate.js";
import { verifyChain } from "../src/events.js";
import { digest } from "../src/kernel.js";
import { grantConfig, grantRun } from "./preparation-grant-fixture.js";
import {
  issuePreparationGrant,
  beginGrantUse,
  finishGrantUse,
} from "../src/preparation/grants.js";
import { SCHEMA } from "../src/db/schema.js";
import { ORIGIN, RP_ID, DAEMON_TOKEN } from "./harness.js";

// This release rehearsal requires a matching-major pg_dump/pg_restore. The ordinary suite
// keeps the SQL downgrade-floor and pilot tests active without installing host client tools.
const tools = process.env.CONTROLROD_TEST_PG_BIN;
let f: Awaited<ReturnType<typeof preparedHarness>>;
const TABLES = [
  "schema_migrations",
  "credentials",
  "sessions",
  "challenges",
  "settings",
  "captures",
  "attachments",
  "packages",
  "runs",
  "outputs",
  "verifications",
  "decisions",
  "events",
  "preparation_snapshots",
  "preparation_heads",
  "preparation_enrollments",
  "preparation_confirmations",
  "preparation_release_manifests",
  "preparation_basis_artifacts",
  "preparation_criterion_results",
  "preparation_dependency_artifacts",
  "preparation_quarantine_batches",
  "preparation_quarantined_outputs",
  "preparation_grants",
  "preparation_grant_inputs",
  "preparation_grant_state",
  "preparation_grant_uses",
  "preparation_grant_receipts",
  "preparation_grant_proposals",
  "preparation_grant_guards",
];
async function snapshot(db: pg.Pool) {
  const rows: Record<string, unknown> = {};
  for (const table of TABLES)
    rows[table] = (
      await db.query(
        `select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`,
      )
    ).rows;
  return digest(rows);
}

describe.skipIf(!tools)(
  "real PostgreSQL backup and restore rehearsal (CONTROLROD_TEST_PG_BIN)",
  () => {
    beforeAll(async () => {
      f = await preparedHarness();
    }, 120_000);
    afterAll(async () => f?.h.stop());
    it("restores controlled records, signatures, evidence and event chain and refuses unaware legacy writes", async () => {
      const p = await f.draft();
      await f.release(p.id);
      const author = (await f.claim()).json();
      expect((await f.complete(author)).json().status).toBe("succeeded");
      const checker = (await f.claim(["claude"])).json(),
        evidence = Buffer.from(
          "Fixture checker evidence retained for recovery rehearsal",
        );
      expect(
        (
          await f.complete(checker, {
            outputs: [
              {
                name: "checks.log",
                content_base64: evidence.toString("base64"),
              },
            ],
            verification: { outcome: "pass", findings: [] },
            criterion_results: {
              package_id: p.id,
              package_revision: 0,
              release_manifest_digest: checker.run.preparation_manifest_digest,
              results: [
                {
                  criterion_id: "AC-1",
                  outcome: "pass",
                  finding_refs: [],
                  check_results: [
                    {
                      check_id: "CHECK-1",
                      outcome: "pass",
                      evidence_refs: ["checker:checks.log"],
                    },
                  ],
                },
              ],
            },
          })
        ).json().status,
      ).toBe("succeeded");
      const options = await f.owner(
        "POST",
        `/packages/${p.id}/decisions/options`,
        { kind: "accept", package_revision: 0 },
      );
      expect(options.statusCode, options.body).toBe(200);
      expect(
        (
          await f.owner("POST", `/packages/${p.id}/decisions`, {
            kind: "accept",
            package_revision: 0,
            assertion: f.passkey.assert(options.json().options),
          })
        ).statusCode,
      ).toBe(201);
      const dependent = await f.draft(
        undefined,
        (d) => {
          d.package_contract.design_inputs = [
            { doc: p.id, revision: "0", use: "Recovery dependency fixture" },
          ];
        },
        false,
      );
      const refreshed = await f.owner(
        "POST",
        dependent.url + "/basis/refresh",
        undefined,
        { "if-match": `"${dependent.view.content_digest.value}"` },
      );
      expect(refreshed.statusCode, refreshed.body).toBe(200);
      const confirmationOptions = await f.owner(
        "POST",
        dependent.url + "/confirm/options",
        { expected_requirements_digest: refreshed.json().requirements_digest },
      );
      expect(confirmationOptions.statusCode, confirmationOptions.body).toBe(
        200,
      );
      expect(
        (
          await f.owner("POST", dependent.url + "/confirm", {
            assertion: f.passkey.assert(confirmationOptions.json().options),
          })
        ).statusCode,
      ).toBe(201);
      await f.release(dependent.id);
      expect(
        (await f.h.db.query("select * from preparation_dependency_artifacts"))
          .rowCount,
      ).toBeGreaterThan(0);
      const grantSeed = await grantRun(f);
      const grant = await issuePreparationGrant(
        f.h.db,
        grantConfig,
        grantSeed.run.id,
        grantSeed.token,
      );
      const permit = await beginGrantUse(
        f.h.db,
        grantConfig,
        grant.grant.id,
        grant.token,
        { kind: "write-proposal" },
      );
      const retainedProposal = Buffer.from(
        "Recovery fixture proposal: owner review required",
      );
      await finishGrantUse(f.h.db, grantConfig, grant.grant.id, grant.token, {
        use_id: permit.use_id,
        use_token: permit.use_token,
        result: {
          kind: "write-proposal",
          content_base64: retainedProposal.toString("base64"),
        },
      });
      const guardSequence = (
        await f.h.db.query(
          "select last_value from preparation_grant_guards_id_seq",
        )
      ).rows[0].last_value;
      const before = await snapshot(f.h.db),
        chain = await verifyChain(f.h.db);
      // Backup and restore are operator tasks: they run as the owner, not as the application's reader.
      const connection = new URL(String(f.h.admin.options.connectionString));
      const environment = {
        ...process.env,
        PGHOST: connection.hostname,
        PGPORT: connection.port,
        PGUSER: decodeURIComponent(connection.username),
        PGPASSWORD: decodeURIComponent(connection.password),
        PGDATABASE: connection.pathname.slice(1),
      };
      const directory = mkdtempSync(join(tmpdir(), "controlrod-restore-")),
        backup = join(directory, "fixture.dump");
      const restoredName = `cr_restore_${randomUUID().replaceAll("-", "")}`;
      await f.h.admin.query(`create database ${restoredName}`);
      const restoredURL = new URL(connection);
      restoredURL.pathname = `/${restoredName}`;
      const restored = new pg.Pool({
        connectionString: restoredURL.toString(),
      });
      let app: ReturnType<typeof buildApp> | undefined;
      try {
        execFileSync(
          join(tools!, "pg_dump"),
          [
            "--format=custom",
            "--no-owner",
            "--no-privileges",
            "--file",
            backup,
          ],
          { env: environment, timeout: 30000 },
        );
        execFileSync(
          join(tools!, "pg_restore"),
          [
            "--exit-on-error",
            "--no-owner",
            "--no-privileges",
            "--dbname",
            restoredName,
            backup,
          ],
          { env: { ...environment, PGDATABASE: restoredName }, timeout: 30000 },
        );
        await migrate(restored);
        expect(await snapshot(restored)).toBe(before);
        expect(
          (
            await restored.query(
              "select * from preparation_dependency_artifacts",
            )
          ).rowCount,
        ).toBeGreaterThan(0);
        expect(await verifyChain(restored)).toEqual(chain);
        expect(
          (
            await restored.query(
              "select bytes from preparation_grant_proposals where grant_id=$1",
              [grant.grant.id],
            )
          ).rows[0].bytes,
        ).toEqual(retainedProposal);
        expect(
          (
            await restored.query(
              "select last_value from preparation_grant_guards_id_seq",
            )
          ).rows[0].last_value,
        ).toBe(guardSequence);

        app = buildApp({
          db: restored,
          root: resolve(fileURLToPath(new URL("../../../", import.meta.url))),
          sweepSeconds: 0,
          guidedPreparation: true,
          preparedRelease: true,
          auth: {
            rpID: RP_ID,
            rpName: "Control Rod",
            origins: [ORIGIN],
            daemonTokenHash: hashToken(DAEMON_TOKEN),
          },
        });
        const v = await app.inject({
          method: "GET",
          url: `/packages/${p.id}`,
          headers: { cookie: f.cookie },
        });
        expect(v.statusCode, v.body).toBe(200);
        expect(v.json().package.status).toBe("accepted");
        expect(v.json().preparation_verification_complete).toBe(true);
        const bytes = await app.inject({
          method: "GET",
          url: `/packages/${p.id}/verification-evidence/${checker.run.id}/checks.log`,
          headers: { cookie: f.cookie },
        });
        expect(bytes.rawPayload).toEqual(evidence);
        // Simulate the pre-registry binary's actual boot SQL, then its unaware write.
        await restored.query(SCHEMA);
        await expect(
          restored.query("update packages set status='draft' where id=$1", [
            p.id,
          ]),
        ).rejects.toThrow(/protocol/);
        expect(await verifyChain(restored)).toEqual(chain);
        const report = {
          scope:
            "ephemeral fixture DB; virtual passkeys and simulated daemon, not an operational owner pilot",
          database_version: (await f.h.db.query("select version() as version"))
            .rows[0].version,
          pg_dump: execFileSync(join(tools!, "pg_dump"), ["--version"], {
            encoding: "utf8",
          }).trim(),
          backup_sha256: createHash("sha256")
            .update(readFileSync(backup))
            .digest("hex"),
          controlled_rows_digest: before,
          event_chain: chain,
          restored_package_state: v.json().package.status,
          evidence_bytes_equal: true,
          grant_proposal_bytes_equal: true,
          grant_guard_sequence_equal: true,
          legacy_writer_refused: true,
        };
        if (process.env.CONTROLROD_REHEARSAL_REPORT)
          writeFileSync(
            process.env.CONTROLROD_REHEARSAL_REPORT,
            JSON.stringify(report, null, 2),
          );
      } finally {
        await app?.close();
        await restored.end();
        await f.h.admin.query(`drop database if exists ${restoredName}`);
        rmSync(directory, { recursive: true, force: true });
      }
    }, 120_000);
  },
);
