import type { Db, Tx } from "../db/index.js";
import { digest } from "../kernel.js";
import {
  currentPackage,
  subjectOf,
  Refusal,
  type PackageRow,
  type WorkConfig,
} from "../work.js";
import { requireAuthorOutputs } from "./artifacts.js";
import { rawSha256, captureInput, readBasisFile } from "./basis.js";
import type { PreparationContent } from "./types.js";
type Basis = PreparationContent["basis"][number];
export function matchingInputSources(doc: string, basis: Basis[]) {
  return basis.filter(
    (b) =>
      b.reference === doc ||
      b.reference === `${b.kind}:${doc}` ||
      (b.kind === "attachment" &&
        doc.startsWith("attachment:") &&
        b.reference.endsWith(`/${doc.slice(11)}`)),
  );
}
export async function acceptedPackageOutputs(
  q: Db | Tx,
  p: PackageRow,
  lock = false,
) {
  if (p.status !== "accepted")
    throw new Refusal(
      409,
      "design-input-unaccepted",
      `${p.id}: package input is not accepted`,
    );
  const run = (
    await q.query<{ id: string; status: string }>(
      "select id,status from runs where package_id=$1 and package_revision=$2 and role='author' order by round desc,created_at desc,id desc limit 1" +
        (lock ? " for share" : ""),
      [p.id, p.revision],
    )
  ).rows[0];
  if (!run || run.status !== "succeeded")
    throw new Refusal(
      409,
      "design-input-unverified",
      `${p.id}: accepted author output is missing`,
    );
  const outputs = await requireAuthorOutputs(q, run.id, lock);
  const decision = (
    await q.query(
      "select body from decisions where package_id=$1 and package_revision=$2 and kind in ('accept','accept-with-findings') order by created_at desc,id desc limit 1" +
        (lock ? " for share" : ""),
      [p.id, p.revision],
    )
  ).rows[0]?.body;
  const acceptedSubject = await subjectOf(q, {
    ...p,
    status: "in-verification",
  });
  if (
    decision?.subject_digest?.algorithm !== "sha256" ||
    decision.subject_digest.value !== acceptedSubject.digest
  )
    throw new Refusal(
      409,
      "design-input-unverified",
      `${p.id}: current outputs do not match the accepted subject`,
    );
  return outputs;
}
/** Every declared or automatically supplied input must appear in the signed source set. */
export async function validateInputCoverage(
  q: Db | Tx,
  p: PackageRow,
  content: PreparationContent,
) {
  for (const input of content.package_contract.design_inputs) {
    const matches = matchingInputSources(input.doc, content.basis);
    if (matches.length !== 1 || matches[0]!.revision !== input.revision)
      throw new Refusal(
        409,
        "design-input-basis",
        `${input.doc}: pin exactly one source at declared revision ${input.revision}`,
      );
    const pkgId = input.doc.startsWith("package:")
      ? input.doc.slice(8)
      : input.doc;
    const dependency = await currentPackage(q, pkgId);
    if (dependency) {
      const b = matches[0]!;
      if (
        b.kind !== "package" ||
        b.reference !== `package:${dependency.id}` ||
        b.artifacts === undefined
      )
        throw new Refusal(
          409,
          "design-input-basis",
          `${input.doc}: pin the package and its complete published output set`,
        );
    }
  }
  if (p.capture_id) {
    if (
      !content.basis.some(
        (b) =>
          b.kind === "capture" &&
          b.reference === `capture:${p.capture_id}` &&
          b.revision === "0",
      )
    )
      throw new Refusal(
        409,
        "capture-basis",
        "The original capture must remain bound to this preparation",
      );
    const attachments = (
      await q.query<{ name: string }>(
        "select name from attachments where capture_id=$1",
        [p.capture_id],
      )
    ).rows;
    for (const a of attachments)
      if (
        !content.basis.some(
          (b) =>
            b.kind === "attachment" &&
            b.reference === `attachment:${p.capture_id}/${a.name}` &&
            b.revision === "0",
        )
      )
        throw new Refusal(
          409,
          "attachment-basis",
          `${a.name}: original attachment is missing from the controlled basis`,
        );
  }
}
/** Explicit human refresh derives pins from actual accepted sources; it never advances a declared revision. */
export async function refreshInputPins(
  c: Tx,
  cfg: WorkConfig,
  p: PackageRow,
  content: PreparationContent,
) {
  const put = (b: Basis) => {
    const i = content.basis.findIndex((v) => v.reference === b.reference);
    if (i < 0) content.basis.push(b);
    else content.basis[i] = b;
  };
  if (p.capture_id) {
    const capture = (
      await c.query("select body from captures where id=$1 for share", [
        p.capture_id,
      ])
    ).rows[0]?.body;
    if (!capture)
      throw new Refusal(409, "capture-basis", "Original capture is missing");
    put({
      kind: "capture",
      reference: `capture:${p.capture_id}`,
      revision: "0",
      digest: { algorithm: "sha256", value: digest(captureInput(capture)) },
    });
    const attachments = (
      await c.query<{ name: string; bytes: Buffer; sha256: string }>(
        "select name,bytes,sha256 from attachments where capture_id=$1 order by name for share",
        [p.capture_id],
      )
    ).rows;
    for (const a of attachments) {
      if (rawSha256(a.bytes) !== a.sha256)
        throw new Refusal(
          409,
          "attachment-basis",
          `${a.name}: retained bytes changed`,
        );
      put({
        kind: "attachment",
        reference: `attachment:${p.capture_id}/${a.name}`,
        revision: "0",
        digest: { algorithm: "sha256", value: a.sha256 },
      });
    }
  }
  for (const input of content.package_contract.design_inputs) {
    const id = input.doc.startsWith("package:")
      ? input.doc.slice(8)
      : input.doc;
    const dependency = await currentPackage(c, id, true);
    if (dependency) {
      if (String(dependency.revision) !== input.revision)
        throw new Refusal(
          409,
          "design-input-revision",
          `${input.doc}: current revision differs; explicitly revise the declared input before refreshing`,
        );
      const outputs = await acceptedPackageOutputs(c, dependency, true);
      put({
        kind: "package",
        reference: `package:${id}`,
        revision: input.revision,
        digest: { algorithm: "sha256", value: digest(dependency.body) },
        artifacts: outputs.map((o) => ({
          path: o.name,
          digest: { algorithm: "sha256", value: o.sha256 },
        })),
      });
      continue;
    }
    const matches = matchingInputSources(input.doc, content.basis);
    if (
      matches.length === 1 &&
      ["repository", "capture", "attachment"].includes(matches[0]!.kind)
    )
      continue;
    const entry = Object.entries(cfg.preparationSources ?? {}).find(
      ([ref, s]) =>
        (ref === input.doc || ref === `${s.kind}:${input.doc}`) &&
        s.revision === input.revision,
    );
    if (!entry)
      throw new Refusal(
        409,
        "design-input-basis",
        `${input.doc}: configure and pin its source at the declared revision`,
      );
    const [reference, source] = entry;
    let bytes: Buffer;
    try {
      bytes = await readBasisFile(source.path);
    } catch {
      throw new Refusal(
        409,
        "design-input-unavailable",
        `${input.doc}: configured source is unavailable or exceeds its budget`,
      );
    }
    put({
      kind: source.kind,
      reference,
      revision: input.revision,
      digest: { algorithm: "sha256", value: rawSha256(bytes) },
    });
  }
  await validateInputCoverage(c, p, content);
  return content;
}
