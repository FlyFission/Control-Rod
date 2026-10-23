import { randomUUID } from "node:crypto";
import type { Db } from "../db/index.js";
import { appendEvent } from "../events.js";
import { digest } from "../kernel.js";
import { Refusal } from "../work.js";
import {
  armGrant,
  currentGrant,
  grantTx,
  headForGrant,
  matchesSecret,
  newSecret,
  OPERATION_LIMIT,
  packageForGrant,
  PENDING_LIMIT,
  rawHash,
  requestInputs,
  runBinding,
  runForGrant,
  SOURCE_LIMIT,
  stale,
  unauthorized,
  validateGrantValue,
  wall,
  type GrantConfig,
  type GrantRow,
} from "./grant-state.js";
import type {
  PreparationGrant,
  PreparationGrantIntent,
  PreparationUseFinalize,
  PreparationUsePermit,
  PreparationUseReceipt,
} from "./types.js";
const SYSTEM = { kind: "system" as const, id: "preparation-controller" };
/** Internal approved-coordinator seam only. No route creates grants or runs. */
export async function issuePreparationGrant(
  db: Db,
  cfg: GrantConfig,
  runId: string,
  claimToken: unknown,
) {
  return grantTx(db, async (c) => {
    const meta = (
      await c.query<{ package_id: string }>(
        "select package_id from runs where id=$1",
        [runId],
      )
    ).rows[0];
    if (!meta) throw stale();
    const p = await packageForGrant(c, meta.package_id),
      s = await headForGrant(c, p.id, cfg),
      r = await runForGrant(c, cfg, runId, p);
    if (!matchesSecret(r.claim_token_hash, claimToken))
      throw new Refusal(
        403,
        "stale-claim",
        "The coordinator does not hold this run claim",
      );
    if (
      s.package_id !== p.id ||
      s.package_revision !== p.revision ||
      !cfg.ajv.validate("WorkPackage.json", p.body)
    )
      throw stale();
    if (
      (
        await c.query("select 1 from preparation_grants where run_id=$1", [
          runId,
        ])
      ).rowCount
    )
      throw new Refusal(
        409,
        "grant-exists",
        "This run already has an immutable grant; it cannot be reissued or revived",
      );
    const { blobs, capture } = await requestInputs(c, p, s),
      id = randomUUID(),
      token = newSecret(),
      expires = r.lease_expires_at!;
    const body: PreparationGrant = {
      schema_version: "0.1.0",
      id,
      run_id: r.id,
      package_id: p.id,
      package_revision: p.revision,
      preparation_id: s.id,
      preparation_revision: s.revision,
      base_digest: { algorithm: "sha256", value: digest(s) },
      package_digest: { algorithm: "sha256", value: digest(p.body) },
      assignment_digest: {
        algorithm: "sha256",
        value: digest(runBinding(r.body)),
      },
      role: "requirements-preparer",
      lane: p.body.data_lane,
      expires_at: expires.toISOString(),
      inputs: blobs.map((b) => ({
        id: b.id,
        path: b.path,
        reference: b.reference,
        digest: { algorithm: "sha256", value: rawHash(b.bytes) },
        bytes: b.bytes.length,
      })),
      proposal_path: "proposal.json",
      max_proposal_bytes: SOURCE_LIMIT,
      max_operations: OPERATION_LIMIT,
    };
    if (Buffer.byteLength(JSON.stringify(body)) > SOURCE_LIMIT)
      throw new Refusal(
        409,
        "grant-input-budget",
        "Grant metadata exceeds the supported resource budget",
      );
    validateGrantValue(cfg, "PreparationGrant.json", body);
    await c.query(
      "insert into preparation_grants(id,run_id,package_id,package_revision,preparation_id,preparation_revision,token_hash,claim_token_hash,expires_at,body,package_body,preparation_body,run_binding,capture_id,capture_input) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
      [
        id,
        r.id,
        p.id,
        p.revision,
        s.id,
        s.revision,
        rawHash(token),
        r.claim_token_hash,
        expires,
        body,
        p.body,
        s,
        runBinding(r.body),
        p.capture_id,
        capture,
      ],
    );
    await c.query("insert into preparation_grant_state(grant_id) values($1)", [
      id,
    ]);
    for (const b of blobs)
      await c.query(
        "insert into preparation_grant_inputs(grant_id,input_id,kind,source_key,fingerprint,body,bytes) values($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          b.id,
          b.kind,
          b.key,
          b.fingerprint,
          body.inputs.find((x) => x.id === b.id),
          b.bytes,
        ],
      );
    const g = (
      await c.query<GrantRow>("select * from preparation_grants where id=$1", [
        id,
      ])
    ).rows[0]!;
    await appendEvent(c, "preparation.grant-issued", id, SYSTEM, {
      run_id: r.id,
      package_id: p.id,
      base_digest: body.base_digest,
      inputs: body.inputs.map((x) => ({
        id: x.id,
        digest: x.digest,
        bytes: x.bytes,
      })),
    });
    await armGrant(c, g, null, expires);
    return {
      grant: body,
      token,
      inputs: blobs.map((b) => ({ id: b.id, path: b.path, bytes: b.bytes })),
    };
  });
}
export async function beginGrantUse(
  db: Db,
  cfg: GrantConfig,
  id: string,
  token: unknown,
  intent: PreparationGrantIntent,
): Promise<PreparationUsePermit> {
  validateGrantValue(cfg, "PreparationGrantIntent.json", intent);
  return grantTx(db, async (c) => {
    const g = await currentGrant(c, cfg, id, token);
    if (
      intent.kind === "read-input" &&
      !g.body.inputs.some((x) => x.id === intent.input_id)
    )
      throw new Refusal(409, "grant-input", "This input is not assigned");
    const pending = (
      await c.query<{ count: string }>(
        "select count(*) from preparation_grant_uses u where u.grant_id=$1 and u.expires_at>clock_timestamp() and not exists(select 1 from preparation_grant_receipts r where r.use_id=u.id)",
        [id],
      )
    ).rows[0]!;
    if (Number(pending.count) >= PENDING_LIMIT)
      throw new Refusal(
        409,
        "grant-pending",
        "The bounded pending-operation slots are occupied",
      );
    const useId = randomUUID(),
      useToken = newSecret();
    await c.query(
      "insert into preparation_grant_uses(id,grant_id,token_hash,intent,expires_at) values($1,$2,$3,$4,$5)",
      [useId, id, rawHash(useToken), intent, g.expires_at],
    );
    await armGrant(c, g, useId, g.expires_at);
    return {
      grant: g.body,
      use_id: useId,
      use_token: useToken,
      intent,
      expires_at: g.expires_at.toISOString(),
    };
  });
}
export async function finishGrantUse(
  db: Db,
  cfg: GrantConfig,
  id: string,
  token: unknown,
  request: PreparationUseFinalize,
): Promise<PreparationUseReceipt> {
  validateGrantValue(cfg, "PreparationUseFinalize.json", request);
  return grantTx(db, async (c) => {
    const g = await currentGrant(c, cfg, id, token);
    const use = (
      await c.query<{
        id: string;
        token_hash: string;
        intent: PreparationGrantIntent;
        expires_at: Date;
      }>(
        "select * from preparation_grant_uses where id=$1 and grant_id=$2 for update",
        [request.use_id, id],
      )
    ).rows[0];
    if (!use || !matchesSecret(use.token_hash, request.use_token))
      throw unauthorized();
    if (use.expires_at <= (await wall(c))) throw stale();
    const requestDigest = digest(request.result);
    const previous = (
      await c.query<{ request_digest: string; body: PreparationUseReceipt }>(
        "select request_digest,body from preparation_grant_receipts where use_id=$1",
        [use.id],
      )
    ).rows[0];
    if (previous) {
      if (previous.request_digest !== requestDigest)
        throw new Refusal(
          409,
          "grant-replay",
          "This permit already has a different result",
        );
      await armGrant(c, g, use.id, use.expires_at);
      return previous.body;
    }
    const result = request.result;
    if (result.kind !== use.intent.kind)
      throw new Refusal(
        409,
        "grant-intent",
        "The result does not match this permit's intent",
      );
    const receipt: PreparationUseReceipt = {
      schema_version: "0.1.0",
      grant_id: id,
      use_id: use.id,
      intent: use.intent,
      admitted_at: (await wall(c)).toISOString(),
      custody: "authorization-only",
    };
    if (result.kind === "read-input") {
      const pin = g.body.inputs.find((x) => x.id === result.input_id);
      if (
        use.intent.kind !== "read-input" ||
        use.intent.input_id !== result.input_id ||
        !pin ||
        result.digest.algorithm !== "sha256" ||
        pin.digest.value !== result.digest.value ||
        pin.bytes !== result.bytes
      )
        throw new Refusal(
          409,
          "grant-input",
          "Reported read does not match the assigned retained input",
        );
      receipt.custody = "broker-reported-read";
      receipt.artifact = { path: pin.path, digest: pin.digest };
      receipt.bytes = pin.bytes;
    }
    if (result.kind === "write-proposal") {
      const raw = result.content_base64;
      if (
        raw.length > Math.ceil(SOURCE_LIMIT / 3) * 4 ||
        raw.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)
      )
        throw new Refusal(
          400,
          "grant-content",
          "Proposal encoding is not canonical base64",
        );
      const bytes = Buffer.from(raw, "base64");
      if (
        bytes.length > g.body.max_proposal_bytes ||
        bytes.toString("base64") !== raw
      )
        throw new Refusal(
          400,
          "grant-content",
          "Proposal exceeds the assigned byte budget or encoding",
        );
      if (
        (
          await c.query(
            "select 1 from preparation_grant_proposals where grant_id=$1",
            [id],
          )
        ).rowCount
      )
        throw new Refusal(
          409,
          "grant-proposal-exists",
          "This grant already has its one admitted proposal",
        );
      const hash = rawHash(bytes);
      await c.query(
        "insert into preparation_grant_proposals(grant_id,use_id,sha256,bytes) values($1,$2,$3,$4)",
        [id, use.id, hash, bytes],
      );
      receipt.custody = "controller-retained-proposal";
      receipt.artifact = {
        path: g.body.proposal_path,
        digest: { algorithm: "sha256", value: hash },
      };
      receipt.bytes = bytes.length;
    }
    validateGrantValue(cfg, "PreparationUseReceipt.json", receipt);
    await c.query(
      "insert into preparation_grant_receipts(use_id,grant_id,request_digest,body) values($1,$2,$3,$4)",
      [use.id, id, requestDigest, receipt],
    );
    await appendEvent(c, "preparation.grant-operation", id, SYSTEM, {
      run_id: g.run_id,
      receipt,
    });
    await armGrant(c, g, use.id, use.expires_at);
    return receipt;
  });
}
export async function revokePreparationGrant(
  db: Db,
  id: string,
  packageId: string,
  user: string,
): Promise<{ revoked: boolean }> {
  return grantTx(db, async (c) => {
    const g = (
      await c.query<{ package_id: string }>(
        "select package_id from preparation_grants where id=$1",
        [id],
      )
    ).rows[0];
    if (!g || g.package_id !== packageId)
      throw new Refusal(404, "not-found", "No such preparation grant");
    // Match operation lock order; do not require a still-current run to revoke it.
    await c.query(
      "select id from packages where id=$1 order by revision desc limit 1 for update",
      [packageId],
    );
    await c.query("select id from preparation_grants where id=$1 for update", [
      id,
    ]);
    const changed = await c.query(
      "update preparation_grant_state set revoked_at=clock_timestamp() where grant_id=$1 and revoked_at is null returning grant_id",
      [id],
    );
    if (changed.rowCount)
      await appendEvent(
        c,
        "preparation.grant-revoked",
        id,
        { kind: "human", id: user },
        { package_id: packageId },
      );
    return { revoked: true };
  });
}
