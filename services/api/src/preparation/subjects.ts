import { randomUUID, createHash, randomBytes } from "node:crypto";
import type { Db, Tx } from "../db/index.js";
import { tx } from "../db/index.js";
import { appendEvent } from "../events.js";
import { decidePreparation } from "../kernel.js";
import { Refusal, type WorkConfig } from "../work.js";
import { head, lockedPackage } from "./store.js";
import { preparationReadiness, preparationSubjects } from "./readiness.js";
import type { RequirementsConfirmation, WorkPackage } from "./types.js";

/** Internal proof populated only after the authentication module verifies and consumes a challenge. */
export interface VerifiedPreparationAssertion {
  user: string;
  package_id: string;
  package_revision: number;
  requirements_digest: string;
  assertion: Record<string, unknown>;
}
async function requirementsSubject(c: Tx, id: string) {
  const pkg = await lockedPackage(c, id),
    snapshot = await head(c, id);
  if (!snapshot)
    throw new Refusal(404, "not-enrolled", "Enroll preparation first");
  if (pkg.status !== "draft")
    throw new Refusal(
      409,
      "wrong-state",
      "Only draft requirements can be confirmed",
    );
  const blockers = preparationReadiness(
    snapshot,
    { ...pkg.body, status: pkg.status } as WorkPackage,
    true,
    "requirements",
  );
  if (blockers.length)
    throw new Refusal(
      409,
      "requirements-blocked",
      blockers.map((b) => `${b.owner}: ${b.message}`).join(" "),
    );
  return { pkg, snapshot, ...preparationSubjects(snapshot) };
}
export async function confirmationSubject(
  db: Db,
  id: string,
  expected: { algorithm: string; value: string },
) {
  return tx(db, async (c) => {
    const s = await requirementsSubject(c, id);
    if (
      expected.algorithm !== "sha256" ||
      expected.value !== s.requirements_digest.value
    )
      throw new Refusal(
        409,
        "stale",
        "Requirements changed since you reviewed them",
      );
    return {
      package_id: id,
      package_revision: s.pkg.revision,
      requirements_digest: s.requirements_digest.value,
    };
  });
}
export function confirmationChallenge(subject: {
  package_id: string;
  package_revision: number;
  requirements_digest: string;
}) {
  return new Uint8Array(
    createHash("sha256")
      .update(
        JSON.stringify({
          purpose: "preparation-confirmation",
          ...subject,
          nonce: randomBytes(32).toString("hex"),
        }),
      )
      .digest(),
  );
}
export async function confirmRequirements(
  db: Db,
  cfg: WorkConfig,
  user: string,
  id: string,
  verified: VerifiedPreparationAssertion,
) {
  return tx(db, async (c) => {
    const s = await requirementsSubject(c, id);
    if (
      verified.package_id !== id ||
      verified.package_revision !== s.pkg.revision ||
      verified.requirements_digest !== s.requirements_digest.value
    )
      throw new Refusal(
        409,
        "stale",
        "The signed requirements are no longer current",
      );
    const outcome = decidePreparation({
      status: s.pkg.status,
      actor_kind: "human",
      actor_id: user,
      assertion_verified: verified.user === user,
      current_digest: s.requirements_digest.value,
      expected_digest: verified.requirements_digest,
      requirements_clear: true,
    });
    if (!outcome.allowed)
      throw new Refusal(
        403,
        outcome.reason,
        `Kernel refused requirements confirmation: ${outcome.reason}`,
      );
    const response = verified.assertion.response as
      Record<string, unknown> | undefined;
    const confirmation: RequirementsConfirmation = {
      id: `CONF-${randomUUID()}`,
      package_id: id,
      package_revision: s.pkg.revision,
      requirements_digest: s.requirements_digest,
      actor: { kind: "human", id: user },
      decided_at: new Date().toISOString(),
      assertion: {
        credential_id: String(verified.assertion.id ?? ""),
        authenticator_data: String(response?.authenticatorData ?? ""),
        client_data_json: String(response?.clientDataJSON ?? ""),
        signature: String(response?.signature ?? ""),
      },
    };
    if (!cfg.ajv.validate("RequirementsConfirmation.json", confirmation))
      throw new Refusal(400, "invalid", cfg.ajv.errorsText());
    await c.query(
      "insert into preparation_confirmations(id,package_id,package_revision,requirements_digest,body,decided_at) values($1,$2,$3,$4,$5,$6)",
      [
        confirmation.id,
        id,
        s.pkg.revision,
        s.requirements_digest.value,
        confirmation,
        confirmation.decided_at,
      ],
    );
    await appendEvent(c, "preparation.confirmed", id, confirmation.actor, {
      confirmation_id: confirmation.id,
      requirements_digest: confirmation.requirements_digest,
    });
    return confirmation;
  });
}
