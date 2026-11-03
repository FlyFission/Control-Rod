import { randomUUID, createHash } from "node:crypto";
import { preparedHarness } from "./preparation-flow.js";
import { loadValidator } from "../src/schemas.js";
export const grantConfig = { ajv: loadValidator() };
export type GrantHarness = Awaited<ReturnType<typeof preparedHarness>>;
export async function grantRun(
  f: GrantHarness,
  options: { role?: string; leaseMs?: number } = {},
) {
  const p = await f.draft(undefined, undefined, false);
  const token = `claim-${randomUUID()}`;
  const lease = new Date(
    Date.now() + (options.leaseMs ?? 60_000),
  ).toISOString();
  const run = {
    schema_version: "0.1.0",
    id: `RUN-${randomUUID()}`,
    package_id: p.id,
    package_revision: 0,
    role: options.role ?? "requirements-preparer",
    agent_baseline: "fixture-preparer",
    runtime: { kind: "local", provider: "fixture", model: "scripted" },
    round: 1,
    status: "running",
    queued_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    lease_expires_at: lease,
  };
  await f.adminQuery(
    "insert into runs(id,package_id,package_revision,role,round,status,body,claim_token_hash,lease_expires_at) values($1,$2,0,$3,1,'running',$4,$5,$6)",
    [
      run.id,
      p.id,
      run.role,
      run,
      createHash("sha256").update(token).digest("hex"),
      lease,
    ],
  );
  return { p, run, token };
}
export const grantHeaders = (token: string) => ({
  authorization: `Bearer ${token}`,
});
