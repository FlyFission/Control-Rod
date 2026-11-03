import { requireAuthorOutputs } from "./artifacts.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db, Tx } from "../db/index.js";
import { appendEvent } from "../events.js";
import { digest, validateRawJson, type PreparationGuard } from "../kernel.js";
import { Refusal, type PackageRow, type WorkConfig } from "../work.js";
import { preparedExecutionGuard } from "./lifecycle.js";
import { rawSha256 } from "./basis.js";
import { preparationForSubject } from "./release.js";
import type {
  CriterionResultSubmission,
  CriterionResultSet,
  VerificationRecord,
  EvidenceItem,
  PreparationSnapshot,
} from "./types.js";
type Output = { name: string; bytes: Buffer };
type CheckerRun = {
  id: string;
  package_id: string;
  package_revision: number;
  round: number;
  body: {
    agent_baseline: string;
    preparation_manifest_digest?: { algorithm: string; value: string };
  };
};
function invalid(message: string): never {
  throw new Refusal(400, "invalid-criterion-results", message);
}
function parseResult(bytes: Buffer): unknown {
  try {
    const raw = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    validateRawJson(raw);
    return JSON.parse(raw);
  } catch {
    return invalid(
      "criterion-results.json must satisfy the canonical JSON profile",
    );
  }
}
function sameIds(actual: string[], expected: string[]) {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    actual.every((id) => expected.includes(id))
  );
}

/** Admission validates bindings and retained checker artifacts, never a self-reported custody label. */
export async function prepareCriterionResults(
  c: Tx,
  cfg: WorkConfig,
  row: CheckerRun,
  record: VerificationRecord,
  body: { criterion_results?: unknown },
  outputs: Output[],
  sharedRuntime: boolean,
) {
  const manifest = row.body.preparation_manifest_digest;
  if (!manifest)
    throw new Refusal(
      409,
      "manifest-missing",
      "Prepared checker run needs its release manifest",
    );
  const file = outputs.find((o) => o.name === "criterion-results.json");
  const fromFile = file ? parseResult(file.bytes) : undefined;
  const raw = body.criterion_results ?? fromFile;
  if (raw === undefined)
    throw new Refusal(
      400,
      "criterion-results-required",
      "Prepared verification must record every controlled criterion and check",
    );
  if (
    body.criterion_results !== undefined &&
    fromFile !== undefined &&
    digest(body.criterion_results) !== digest(fromFile)
  )
    invalid("Body and artifact criterion results disagree");
  if (!cfg.ajv.validate("CriterionResultSubmission.json", raw))
    invalid(cfg.ajv.errorsText());
  const submission = raw as CriterionResultSubmission;
  if (
    submission.package_id !== row.package_id ||
    submission.package_revision !== row.package_revision ||
    submission.release_manifest_digest.algorithm !== "sha256" ||
    submission.release_manifest_digest.value !== manifest.value
  )
    throw new Refusal(
      409,
      "manifest-mismatch",
      "Criterion results name another released basis",
    );
  const released = (
    await c.query(
      "select body from preparation_release_manifests where digest=$1",
      [manifest.value],
    )
  ).rows[0]?.body;
  const snapshot: PreparationSnapshot | undefined = released
    ? (
        await c.query(
          "select body from preparation_snapshots where preparation_id=$1 and revision=$2",
          [released.preparation_id, released.preparation_revision],
        )
      ).rows[0]?.body
    : undefined;
  if (!snapshot || digest(snapshot) !== released.preparation_digest.value)
    throw new Refusal(
      409,
      "manifest-mismatch",
      "Controlled preparation snapshot changed",
    );
  if (
    !sameIds(
      submission.results.map((r) => r.criterion_id),
      snapshot.criteria.map((c) => c.id),
    )
  )
    invalid(
      "Record each current criterion exactly once; unknown or duplicate IDs are refused",
    );
  const evidence: EvidenceItem[] = [];
  for (const result of submission.results) {
    const criterion = snapshot.criteria.find(
      (c) => c.id === result.criterion_id,
    )!;
    if (
      !sameIds(
        result.check_results.map((c) => c.check_id),
        criterion.verification_check_ids,
      )
    )
      invalid(`${criterion.id}: record each mapped check exactly once`);
    if (
      result.finding_refs.some(
        (ref) => !record.findings.some((f) => f.id === ref),
      )
    )
      invalid(`${criterion.id}: unknown finding reference`);
    for (const check of result.check_results) {
      if (check.evidence_refs.length !== new Set(check.evidence_refs).size)
        invalid(`${check.check_id}: duplicate evidence references`);
      const executed = ["pass", "fail", "inconclusive"].includes(check.outcome);
      if (executed && !check.evidence_refs.length)
        invalid(
          `${check.check_id}: executed outcomes need retained checker evidence`,
        );
      for (const ref of check.evidence_refs) {
        const name = ref.startsWith("checker:") ? ref.slice(8) : "";
        const artifact = outputs.find((o) => o.name === name);
        if (
          !artifact ||
          !artifact.bytes.length ||
          ["verification.json", "criterion-results.json"].includes(name)
        )
          invalid(
            `${check.check_id}: decisive evidence must name a retained checker artifact, not its claim record`,
          );
        evidence.push({
          claim: `${criterion.id}: ${criterion.statement}; ${check.check_id} reported ${check.outcome}`,
          status:
            check.outcome === "pass"
              ? "pass"
              : check.outcome === "deferred"
                ? "deferred"
                : "open",
          artifact: {
            path: ref,
            digest: { algorithm: "sha256", value: rawSha256(artifact.bytes) },
          },
          custody: {
            generated_by: row.body.agent_baseline,
            selected_by: row.body.agent_baseline,
            presented_by: "control-plane",
            coupling: {
              actor: "independent",
              context: "independent",
              mechanism: sharedRuntime ? "shared" : "independent",
              authority: "independent",
              resource: "shared",
            },
          },
        });
      }
    }
    if (
      result.outcome === "pass" &&
      result.check_results.some((c) => blocksPass(snapshot, c))
    )
      invalid(
        `${criterion.id}: cannot report pass while a required check did not pass or any check failed`,
      );
  }
  if (
    record.outcome === "pass" &&
    submission.results.some((r) => r.outcome !== "pass")
  )
    invalid("A passing verification record requires every criterion to pass");
  return { submission, evidence };
}
export async function persistCriterionResults(
  c: Tx,
  cfg: WorkConfig,
  row: CheckerRun,
  submission: CriterionResultSubmission,
  record: VerificationRecord,
) {
  const result: CriterionResultSet = {
    ...submission,
    verification_record_digest: { algorithm: "sha256", value: digest(record) },
  };
  if (!cfg.ajv.validate("CriterionResultSet.json", result))
    invalid(cfg.ajv.errorsText());
  const hash = digest(result);
  await c.query(
    "insert into preparation_criterion_results(run_id,package_id,package_revision,manifest_digest,verification_digest,digest,body) values($1,$2,$3,$4,$5,$6,$7)",
    [
      row.id,
      row.package_id,
      row.package_revision,
      result.release_manifest_digest.value,
      result.verification_record_digest.value,
      hash,
      result,
    ],
  );
  await appendEvent(
    c,
    "preparation.results-recorded",
    row.package_id,
    { kind: "agent", id: row.body.agent_baseline },
    {
      run_id: row.id,
      results_digest: { algorithm: "sha256", value: hash },
      verification_digest: result.verification_record_digest,
    },
  );
  return result;
}
export async function currentCriterionResults(
  q: Db | Tx,
  pkg: PackageRow,
  round: number | undefined,
  verification: VerificationRecord | null,
  lockEvidence = false,
) {
  if (round === undefined || !verification) return null;
  const row = (
    await q.query<{ run_id: string; digest: string; body: CriterionResultSet }>(
      "select r.run_id,r.digest,r.body from preparation_criterion_results r join verifications v on v.run_id=r.run_id where r.package_id=$1 and r.package_revision=$2 and v.round=$3 order by v.created_at desc,r.run_id desc limit 1" +
        (lockEvidence ? " for share of r,v" : ""),
      [pkg.id, pkg.revision, round],
    )
  ).rows[0];
  if (!row) return null;
  if (
    digest(row.body) !== row.digest ||
    row.body.verification_record_digest.value !== digest(verification)
  )
    throw new Refusal(
      409,
      "criterion-results-corrupt",
      "Results no longer match their recorded verification",
    );
  const refs = [
    ...new Set(
      row.body.results.flatMap((r) =>
        r.check_results.flatMap((c) => c.evidence_refs),
      ),
    ),
  ];
  const outputs = (
    await q.query<{ name: string; bytes: Buffer; sha256: string }>(
      "select name,bytes,sha256 from outputs where run_id=$1 and name=any($2::text[])" +
        (lockEvidence ? " for share" : ""),
      [
        row.run_id,
        refs.map((r) => (r.startsWith("checker:") ? r.slice(8) : "")),
      ],
    )
  ).rows;
  const evidence_subject = refs.map((ref) => {
    const output = outputs.find((o) => ref === `checker:${o.name}`);
    return { ref, actual_sha256: output ? rawSha256(output.bytes) : null };
  });
  const evidence_valid = evidence_subject.every((item) => {
    const output = outputs.find((o) => item.ref === `checker:${o.name}`);
    const anchor = verification.evidence.find(
      (e) => e.artifact?.path === item.ref,
    )?.artifact?.digest;
    return Boolean(
      output &&
      anchor?.algorithm === "sha256" &&
      item.actual_sha256 === output.sha256 &&
      item.actual_sha256 === anchor.value,
    );
  });
  if (lockEvidence && !evidence_valid)
    throw new Refusal(
      409,
      "criterion-evidence-changed",
      "Retained checker evidence changed; acceptance is blocked",
    );
  return { ...row, evidence_valid, evidence_subject };
}
/**
 * Whether one check's outcome keeps its criterion from passing (guided preparation design: pass only
 * if every required check passes; fail if any fails). A required check must pass. An optional check
 * that ran and did not pass (fail or inconclusive) still blocks; an optional check never run (open or
 * deferred) does not. A check the snapshot does not know is treated as required.
 */
export function blocksPass(
  snapshot: PreparationSnapshot,
  c: { check_id: string; outcome: string },
): boolean {
  const required = snapshot.technical_plan.checks.find((k) => k.id === c.check_id)?.required ?? true;
  if (required) return c.outcome !== "pass";
  return c.outcome === "fail" || c.outcome === "inconclusive";
}
export function criterionResultFlags(
  snapshot: PreparationSnapshot,
  results: CriterionResultSet | null,
) {
  const complete = Boolean(
    results &&
    sameIds(
      results.results.map((r) => r.criterion_id),
      snapshot.criteria.map((c) => c.id),
    ),
  );
  const required =
    complete &&
    snapshot.criteria.every((criterion) =>
      criterion.verification_check_ids.every((id) => {
        const check = snapshot.technical_plan.checks.find((c) => c.id === id);
        const r = results!.results
          .find((r) => r.criterion_id === criterion.id)
          ?.check_results.find((c) => c.check_id === id);
        return Boolean(
          check &&
          (!check.required ||
            (r &&
              ["pass", "fail"].includes(r.outcome) &&
              r.evidence_refs.length > 0)),
        );
      }),
    );
  return {
    results_complete: complete,
    required_checks_complete: required,
    results_pass:
      complete &&
      results!.results.every(
        (r) =>
          r.outcome === "pass" &&
          !r.check_results.some((c) => blocksPass(snapshot, c)),
      ),
  };
}
export async function preparedAcceptanceGuard(
  c: Tx,
  cfg: WorkConfig,
  pkg: PackageRow,
  author: { id: string; body: Record<string, any>; round: number } | null,
  verification: VerificationRecord | null,
  /** Writers lock the author outputs; a read only snapshot cannot and need not. */
  lock = true,
): Promise<PreparationGuard | undefined> {
  const guard = await preparedExecutionGuard(c, cfg, pkg, author?.body, lock);
  if (!guard) return undefined;
  if (!author)
    throw new Refusal(
      409,
      "output-required",
      "No author deliverable is available for acceptance",
    );
  await requireAuthorOutputs(c, author.id, lock);
  const p = await preparationForSubject(c, pkg);
  if (!p)
    throw new Refusal(
      409,
      "preparation-stale",
      "Preparation enrollment disappeared",
    );
  const results = await currentCriterionResults(
    c,
    pkg,
    author?.round,
    verification,
    lock,
  );
  if (
    results &&
    results.body.release_manifest_digest.value !== digest(p.manifest)
  )
    throw new Refusal(
      409,
      "manifest-mismatch",
      "Results name another release manifest",
    );
  return {
    ...guard,
    ...criterionResultFlags(p.snapshot, results?.body ?? null),
  };
}
export async function verificationEvidence(
  db: Db,
  id: string,
  runId: string,
  name: string,
): Promise<Buffer> {
  const row = (
    await db.query<{
      body: CriterionResultSet;
      digest: string;
      verification: VerificationRecord;
    }>(
      "select r.body,r.digest,v.body as verification from preparation_criterion_results r join runs s on s.id=r.run_id join verifications v on v.run_id=r.run_id where r.run_id=$1 and r.package_id=$2 and s.role='pre-check'",
      [runId, id],
    )
  ).rows[0];
  if (
    !row ||
    row.digest !== digest(row.body) ||
    digest(row.verification) !== row.body.verification_record_digest.value ||
    !row.body.results.some((r) =>
      r.check_results.some((c) => c.evidence_refs.includes(`checker:${name}`)),
    )
  )
    throw new Refusal(
      404,
      "not-found",
      "No admitted checker evidence at this path",
    );
  const output = (
    await db.query<{ bytes: Buffer; sha256: string }>(
      "select bytes,sha256 from outputs where run_id=$1 and name=$2",
      [runId, name],
    )
  ).rows[0];
  if (!output)
    throw new Refusal(404, "not-found", "Checker evidence is unavailable");
  const anchor = row.verification.evidence.find(
    (e) => e.artifact?.path === `checker:${name}`,
  )?.artifact?.digest;
  if (
    !anchor ||
    anchor.algorithm !== "sha256" ||
    rawSha256(output.bytes) !== anchor.value ||
    anchor.value !== output.sha256
  )
    throw new Refusal(
      409,
      "evidence-changed",
      "Checker evidence no longer matches its retained digest",
    );
  return output.bytes;
}
export function criterionResultSchemaInputs(root: string) {
  return [
    "CriterionResultSubmission",
    "CriterionResult",
    "CheckResult",
    "Digest",
  ].map((name) => ({
    name: `schemas/${name}.json`,
    content_base64: readFileSync(
      join(root, "spec", "generated", "json-schema", `${name}.json`),
    ).toString("base64"),
  }));
}
