import pg from "pg";
import { validateInputCoverage } from "./inputs.js";
import { requireAuthorOutputs } from "./artifacts.js";
import type { Tx } from "../db/index.js";
import { appendEvent } from "../events.js";
import { digest, type PreparationGuard } from "../kernel.js";
import { Refusal, type PackageRow, type WorkConfig } from "../work.js";
import { rawSha256, resolveBasis } from "./basis.js";
import { preparationForSubject } from "./release.js";

export async function preparedExecutionGuard(
  c: Tx,
  cfg: WorkConfig,
  pkg: PackageRow,
  run?: {
    role?: string;
    preparation_manifest_digest?: { algorithm: string; value: string };
  },
  /** Writers lock what they check; a read only snapshot cannot and need not. */
  lock = true,
): Promise<PreparationGuard | undefined> {
  const prep = await preparationForSubject(c, pkg);
  if (!prep) {
    if (run?.preparation_manifest_digest)
      throw new Refusal(
        409,
        "preparation-stale",
        "An enrolled run cannot fall back to legacy execution",
      );
    return undefined;
  }
  try {
    if (!cfg.preparedRelease || prep.blockers.length || !prep.manifest)
      throw new Error("Preparation is not ready");
    const saved = (
      await c.query(
        "select digest,body from preparation_release_manifests where package_id=$1 and package_revision=$2",
        [pkg.id, pkg.revision],
      )
    ).rows[0];
    if (
      !saved ||
      saved.digest !== digest(saved.body) ||
      digest(prep.manifest) !== saved.digest ||
      (run &&
        (run.preparation_manifest_digest?.algorithm !== "sha256" ||
          run.preparation_manifest_digest.value !== saved.digest))
    )
      throw new Error("Release manifest changed or is missing");
    if (!["public", "internal"].includes(pkg.body.data_lane))
      throw new Error("This data lane needs an approved confined runtime");
    await validateInputCoverage(c, pkg, prep.snapshot);
    await resolveBasis(c, cfg, prep.manifest.basis_refs, lock);
    if (run?.role === "pre-check") {
      const author = (
        await c.query<{ id: string; status: string }>(
          `select id,status from runs where package_id=$1 and package_revision=$2 and role='author' order by round desc,created_at desc,id desc limit 1${lock ? " for share" : ""}`,
          [pkg.id, pkg.revision],
        )
      ).rows[0];
      if (!author || author.status !== "succeeded")
        throw new Refusal(
          409,
          "output-changed",
          "Current author deliverable is unavailable",
        );
      await requireAuthorOutputs(c, author.id, true);
    }
    return {
      requirements_confirmed: true,
      ready_for_release: true,
      basis_current: true,
      manifest_matches: true,
      results_complete: false,
      required_checks_complete: false,
      results_pass: false,
    };
  } catch (error) {
    throw staleUnlessDatabaseFault(error);
  }
}

/**
 * A changed or unavailable basis is a stale preparation, which the owner resolves by revising. A
 * database fault (lost connection, lock timeout, refused privilege) is not, and must surface as a
 * server error instead of being reported as staleness.
 */
export function staleUnlessDatabaseFault(error: unknown): unknown {
  if (error instanceof pg.DatabaseError) return error;
  return new Refusal(
    409,
    "preparation-stale",
    "The controlled preparation basis changed, is unavailable, or requires a confined runtime. Return the package for a controlled revision.",
  );
}

/** Only immutable controlled contract/checks go to a checker; private preparation context is excluded. */
export async function preparedJobInputs(
  c: Tx,
  run: {
    package_id: string;
    package_revision: number;
    role: string;
    preparation_manifest_digest?: { value: string };
  },
) {
  if (!run.preparation_manifest_digest) return [];
  const manifest = (
    await c.query(
      "select body from preparation_release_manifests where package_id=$1 and package_revision=$2 and digest=$3",
      [
        run.package_id,
        run.package_revision,
        run.preparation_manifest_digest.value,
      ],
    )
  ).rows[0]?.body;
  if (!manifest)
    throw new Refusal(409, "preparation-stale", "Run manifest is missing");
  const snapshot = (
    await c.query(
      "select body from preparation_snapshots where preparation_id=$1 and revision=$2",
      [manifest.preparation_id, manifest.preparation_revision],
    )
  ).rows[0]?.body;
  if (!snapshot || digest(snapshot) !== manifest.preparation_digest.value)
    throw new Refusal(
      409,
      "preparation-stale",
      "Run preparation snapshot changed",
    );
  const controlled =
    run.role === "pre-check"
      ? {
          manifest,
          package_contract: snapshot.package_contract,
          requirements: snapshot.requirements,
          criteria: snapshot.criteria,
          verification_checks: snapshot.technical_plan.checks,
        }
      : { manifest, snapshot };
  const inputs = [
    {
      name: "PREPARATION.json",
      content_base64: Buffer.from(JSON.stringify(controlled)).toString(
        "base64",
      ),
    },
  ];
  const sources = (
    await c.query(
      "select * from preparation_basis_artifacts where manifest_digest=$1 order by reference",
      [run.preparation_manifest_digest.value],
    )
  ).rows;
  if (sources.length !== manifest.basis_refs.length)
    throw new Refusal(
      409,
      "preparation-stale",
      "Retained controlled input set is incomplete",
    );
  for (const [i, source] of sources.entries()) {
    if (
      rawSha256(source.bytes) !== source.bytes_sha256 ||
      !manifest.basis_refs.some(
        (b: { reference: string; digest: { value: string } }) =>
          b.reference === source.reference &&
          b.digest.value === source.source_digest,
      )
    )
      throw new Refusal(
        409,
        "preparation-stale",
        "Retained controlled input changed",
      );
    inputs.push({
      name: `basis/${String(i + 1).padStart(3, "0")}-${source.kind}${["package", "capture"].includes(source.kind) ? ".json" : ".source"}`,
      content_base64: source.bytes.toString("base64"),
    });
  }
  const dependencies = (
    await c.query<{
      reference: string;
      path: string;
      sha256: string;
      bytes: Buffer;
    }>(
      "select reference,path,sha256,bytes from preparation_dependency_artifacts where manifest_digest=$1 order by reference,path",
      [run.preparation_manifest_digest.value],
    )
  ).rows;
  for (const b of manifest.basis_refs)
    if (b.kind === "package" && b.artifacts !== undefined) {
      const artifacts = dependencies.filter((d) => d.reference === b.reference);
      if (artifacts.length !== b.artifacts.length)
        throw new Refusal(
          409,
          "preparation-stale",
          "Retained dependency outputs are incomplete",
        );
      const id = b.reference.slice(8);
      if (!id || /[\\/]/.test(id) || id === "." || id === "..")
        throw new Refusal(
          409,
          "preparation-stale",
          "Unsafe dependency identity",
        );
      for (const artifact of artifacts) {
        const expected = b.artifacts.find(
          (a: { path: string; digest: { algorithm: string; value: string } }) =>
            a.path === artifact.path,
        );
        if (
          !expected ||
          expected.digest.algorithm !== "sha256" ||
          expected.digest.value !== artifact.sha256 ||
          rawSha256(artifact.bytes) !== artifact.sha256
        )
          throw new Refusal(
            409,
            "preparation-stale",
            "Retained dependency output changed",
          );
        inputs.push({
          name: `deps/${id}/${artifact.path}`,
          content_base64: artifact.bytes.toString("base64"),
        });
      }
    }
  const packageRow = (
    await c.query<{ capture_id: string | null }>(
      "select capture_id from packages where id=$1 and revision=$2",
      [run.package_id, run.package_revision],
    )
  ).rows[0];
  for (const source of sources) {
    if (
      source.kind === "capture" &&
      source.reference === `capture:${packageRow?.capture_id}`
    ) {
      const capture = JSON.parse(source.bytes.toString("utf8"));
      inputs.push({
        name: "CAPTURE.md",
        content_base64: Buffer.from(String(capture.text)).toString("base64"),
      });
    }
    if (
      source.kind === "attachment" &&
      packageRow?.capture_id &&
      source.reference.startsWith(`attachment:${packageRow.capture_id}/`)
    ) {
      const name = source.reference.slice(source.reference.indexOf("/") + 1);
      inputs.push({
        name: `attachments/${name}`,
        content_base64: source.bytes.toString("base64"),
      });
    }
  }
  return inputs;
}

/** Private retention only: quarantined bytes never enter deliverables or checker admission. */
export async function quarantineCompletion(
  c: Tx,
  runId: string,
  key: string,
  body: Record<string, any>,
  reason: string,
) {
  const row = (
    await c.query("select package_id from runs where id=$1", [runId])
  ).rows[0];
  if (
    !row ||
    !(
      await c.query("select 1 from preparation_heads where package_id=$1", [
        row.package_id,
      ])
    ).rowCount
  )
    return false;
  const inserted = await c.query(
    "insert into preparation_quarantine_batches(run_id,idempotency_key,reason) values($1,$2,$3) on conflict do nothing returning run_id",
    [runId, key, reason],
  );
  if (!inserted.rowCount) return false;
  const outputs = Array.isArray(body.outputs) ? body.outputs.slice(0, 200) : [];
  for (const [i, o] of outputs.entries()) {
    const bytes = Buffer.from(String(o?.content_base64 ?? ""), "base64");
    await c.query(
      "insert into preparation_quarantined_outputs(run_id,idempotency_key,ordinal,name,sha256,bytes) values($1,$2,$3,$4,$5,$6)",
      [
        runId,
        key,
        i,
        String(o?.name ?? "").slice(0, 300),
        rawSha256(bytes),
        bytes,
      ],
    );
  }
  await appendEvent(
    c,
    "preparation.output-quarantined",
    runId,
    { kind: "system", id: "control-plane" },
    { reason, count: outputs.length },
  );
  return true;
}
