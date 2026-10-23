import type { Db, Tx } from "../db/index.js";
import { digest, type PreparationGuard } from "../kernel.js";
import { Refusal, type PackageRow, type WorkConfig } from "../work.js";
import { preparationReadiness, preparationSubjects } from "./readiness.js";
import type {
  PreparationSnapshot,
  RequirementsConfirmation,
  PreparationReleaseManifest,
  WorkPackage,
} from "./types.js";

export async function preparationForSubject(q: Db | Tx, pkg: PackageRow) {
  const row = (
    await q.query<{ body: PreparationSnapshot; content_digest: string }>(
      "select s.body,s.content_digest from preparation_heads h join preparation_snapshots s on s.preparation_id=h.preparation_id and s.revision=h.revision where h.package_id=$1",
      [pkg.id],
    )
  ).rows[0];
  if (!row) return null;
  const snapshot = row.body,
    subjects = preparationSubjects(snapshot);
  if (subjects.content_digest.value !== row.content_digest)
    throw new Refusal(
      409,
      "preparation-corrupt",
      "Stored preparation does not match its recorded digest",
    );
  const confirmation = (
    await q.query<{ body: RequirementsConfirmation }>(
      "select body from preparation_confirmations where package_id=$1 and package_revision=$2 and requirements_digest=$3 order by decided_at desc,id desc limit 1",
      [pkg.id, pkg.revision, subjects.requirements_digest.value],
    )
  ).rows[0]?.body;
  const blockers = preparationReadiness(
    snapshot,
    { ...pkg.body, status: pkg.status } as WorkPackage,
    Boolean(confirmation),
  );
  const basis_refs = [...snapshot.basis].sort((a, b) => {
    const x = `${a.kind}\0${a.reference}\0${a.revision}`,
      y = `${b.kind}\0${b.reference}\0${b.revision}`;
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const manifest: PreparationReleaseManifest | null = confirmation
    ? {
        package_id: pkg.id,
        package_revision: pkg.revision,
        preparation_id: snapshot.id,
        preparation_revision: snapshot.revision,
        preparation_digest: subjects.content_digest,
        requirements_confirmation_id: confirmation.id,
        requirements_digest: subjects.requirements_digest,
        basis_refs,
        feature_version: "0.1.0",
      }
    : null;
  return {
    snapshot,
    subjects,
    confirmation,
    manifest,
    blockers,
    subject: manifest ?? {
      preparation_id: snapshot.id,
      preparation_revision: snapshot.revision,
      preparation_digest: subjects.content_digest,
      requirements_digest: subjects.requirements_digest,
      requirements_confirmation_id: null,
      basis_refs,
      feature_version: "0.1.0",
    },
  };
}
export type PreparedSubject = NonNullable<
  Awaited<ReturnType<typeof preparationForSubject>>
>;
/** First release slice supports owner-local package sources. Other source providers remain holds. */
async function releaseBasisCurrent(
  q: Db | Tx,
  p: PreparedSubject,
): Promise<boolean> {
  for (const b of p.snapshot.basis) {
    if (b.kind !== "package" || b.digest.algorithm !== "sha256") return false;
    const id = b.reference.startsWith("package:") ? b.reference.slice(8) : "";
    const row = (
      await q.query(
        "select revision,body from packages where id=$1 order by revision desc limit 1",
        [id],
      )
    ).rows[0];
    if (
      !row ||
      String(row.revision) !== b.revision ||
      digest(row.body) !== b.digest.value
    )
      return false;
  }
  return p.snapshot.basis.length > 0;
}
export async function preparedReleaseGuard(
  q: Db | Tx,
  cfg: WorkConfig,
  pkg: PackageRow,
  p: PreparedSubject,
) {
  if (!cfg.preparedRelease)
    throw new Refusal(
      409,
      "prepared-release-disabled",
      "The owner has not enabled prepared release",
    );
  if (pkg.status !== "draft")
    throw new Refusal(409, "wrong-state", "Only a draft can release");
  if (p.blockers.length || !p.manifest)
    throw new Refusal(
      409,
      "preparation-blocked",
      p.blockers.map((b) => `${b.owner}: ${b.message}`).join(" ") ||
        "Confirm the current requirements",
    );
  const basis_current = await releaseBasisCurrent(q, p);
  if (!basis_current)
    throw new Refusal(
      409,
      "basis-unverified",
      "A controlled source changed or needs a supported verification provider",
    );
  const guard: PreparationGuard = {
    requirements_confirmed: true,
    ready_for_release: true,
    basis_current,
    manifest_matches: true,
    results_complete: false,
    required_checks_complete: false,
    results_pass: false,
  };
  return guard;
}
export async function persistReleaseManifest(
  c: Tx,
  cfg: WorkConfig,
  p: PreparedSubject,
  decisionId: string,
) {
  if (
    !p.manifest ||
    !cfg.ajv.validate("PreparationReleaseManifest.json", p.manifest)
  )
    throw new Refusal(
      409,
      "invalid-manifest",
      "Preparation release manifest is incomplete",
    );
  const hash = digest(p.manifest);
  await c.query(
    "insert into preparation_release_manifests(package_id,package_revision,digest,body,decision_id) values($1,$2,$3,$4,$5)",
    [
      p.manifest.package_id,
      p.manifest.package_revision,
      hash,
      p.manifest,
      decisionId,
    ],
  );
  return hash;
}
