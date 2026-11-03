import { acceptedPackageOutputs } from "./inputs.js";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import type { Db, Tx } from "../db/index.js";
import { digest } from "../kernel.js";
import { currentPackage, Refusal, type WorkConfig } from "../work.js";
import type { PreparationContent } from "./types.js";
const exec = promisify(execFile);
const MAX_SOURCE = 5 * 1024 * 1024,
  MAX_TOTAL = 25 * 1024 * 1024;
export async function readBasisFile(path: string) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    size += chunk.length;
    if (size > MAX_SOURCE)
      throw new Error("Controlled source exceeds input budget");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks, size);
}
export const rawSha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
/** Capture routing/answer fields change during intake; the human input does not. */
export function captureInput(c: Record<string, unknown>) {
  const { schema_version, id, text, source, created_at } = c;
  return { schema_version, id, text, source, created_at };
}
export interface ResolvedBasis {
  reference: string;
  source_digest: string;
  bytes: Buffer;
  bytes_sha256: string;
  kind: string;
  artifacts?: { path: string; sha256: string; bytes: Buffer }[];
}
export async function resolveBasis(
  q: Db | Tx,
  cfg: Partial<
    Pick<WorkConfig, "root" | "preparationSources" | "preparationRepositories">
  >,
  basis: PreparationContent["basis"],
  lock = false,
): Promise<ResolvedBasis[]> {
  const out: ResolvedBasis[] = [];
  let total = 0;
  for (const b of basis) {
    try {
      if (b.digest.algorithm !== "sha256")
        throw new Refusal(
          409,
          "basis-unverified",
          "Only SHA-256 source pins are supported",
        );
      let bytes: Buffer, sourceDigest: string;
      let artifacts: ResolvedBasis["artifacts"];
      if (b.kind === "package") {
        const id = b.reference.startsWith("package:")
          ? b.reference.slice(8)
          : "";
        let row = await currentPackage(q, id, lock);
        // A return can insert a newer revision while a reader waits for the former current row.
        if (lock) {
          const latest = await currentPackage(q, id, true);
          if (latest) row = latest;
        }
        if (!row || String(row.revision) !== b.revision)
          throw new Refusal(
            409,
            "basis-unverified",
            `${b.reference}: package revision changed`,
          );
        bytes = Buffer.from(JSON.stringify(row.body));
        sourceDigest = digest(row.body);
        if (b.artifacts !== undefined) {
          const outputs = await acceptedPackageOutputs(q, row, lock);
          const expected = [...b.artifacts].sort((a, b) =>
            a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
          );
          const actual = outputs.map((o) => ({
            path: o.name,
            digest: { algorithm: "sha256", value: o.sha256 },
          }));
          if (
            expected.length !== actual.length ||
            new Set(expected.map((a) => a.path)).size !== expected.length ||
            expected.some(
              (a) =>
                !actual.some(
                  (v) =>
                    v.path === a.path &&
                    a.digest.algorithm === "sha256" &&
                    v.digest.value === a.digest.value,
                ),
            )
          )
            throw new Refusal(
              409,
              "basis-unverified",
              `${b.reference}: published output set changed`,
            );
          artifacts = outputs.map((o) => ({
            path: o.name,
            sha256: o.sha256,
            bytes: o.bytes,
          }));
        }
      } else if (b.kind === "capture") {
        const id = b.reference.startsWith("capture:")
          ? b.reference.slice(8)
          : "";
        const row = (
          await q.query(
            "select body from captures where id=$1" +
              (lock ? " for share" : ""),
            [id],
          )
        ).rows[0];
        if (!row || b.revision !== "0")
          throw new Refusal(
            409,
            "basis-unverified",
            `${b.reference}: capture is unavailable`,
          );
        const input = captureInput(row.body);
        bytes = Buffer.from(JSON.stringify(input));
        sourceDigest = digest(input);
      } else if (b.kind === "attachment") {
        const ref = b.reference.startsWith("attachment:")
            ? b.reference.slice(11)
            : "",
          slash = ref.indexOf("/");
        const row = (
          await q.query(
            "select bytes,sha256 from attachments where capture_id=$1 and name=$2" +
              (lock ? " for share" : ""),
            [ref.slice(0, slash), ref.slice(slash + 1)],
          )
        ).rows[0];
        if (!row || slash < 0 || b.revision !== "0")
          throw new Refusal(
            409,
            "basis-unverified",
            `${b.reference}: attachment is unavailable`,
          );
        bytes = row.bytes;
        sourceDigest = rawSha256(bytes);
        if (sourceDigest !== row.sha256)
          throw new Refusal(
            409,
            "basis-unverified",
            `${b.reference}: stored attachment changed`,
          );
      } else if (b.kind === "repository") {
        const configured =
          cfg.preparationRepositories?.[b.reference] ??
          (b.reference === "repository:control-rod" ? cfg.root : undefined);
        if (
          !configured ||
          !b.path ||
          !/^[0-9a-f]{40,64}$/.test(b.commit ?? "") ||
          b.path.split(/[\\/]/).some((s) => s === ".." || s === ".git") ||
          isAbsolute(b.path) ||
          /^[A-Za-z]:/.test(b.path) ||
          b.path.includes("\\")
        )
          throw new Refusal(
            409,
            "basis-unverified",
            `${b.reference}: repository access is not configured or path is invalid`,
          );
        const root = await realpath(configured),
          path = await realpath(resolve(root, b.path)),
          rel = relative(root, path);
        if (
          rel.startsWith("..") ||
          isAbsolute(rel) ||
          !(await stat(path)).isFile()
        )
          throw new Refusal(
            409,
            "basis-unverified",
            `${b.reference}: path is outside the allowed repository`,
          );
        const options = {
          timeout: 5000,
          maxBuffer: MAX_SOURCE,
          env: {
            ...process.env,
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_NO_REPLACE_OBJECTS: "1",
            GIT_NO_LAZY_FETCH: "1",
            GIT_OPTIONAL_LOCKS: "0",
            GIT_TERMINAL_PROMPT: "0",
          },
        };
        const before = (
          await exec(
            "git",
            ["-C", root, "rev-parse", "--verify", "HEAD"],
            options,
          )
        ).stdout.trim();
        if (before !== b.commit || b.revision !== b.commit)
          throw new Refusal(
            409,
            "basis-unverified",
            `${b.reference}: repository HEAD changed`,
          );
        const pinned = await exec(
          "git",
          ["-C", root, "cat-file", "blob", `${b.commit}:${b.path}`],
          { ...options, encoding: "buffer" },
        );
        bytes = await readBasisFile(path);
        sourceDigest = rawSha256(bytes);
        const after = (
          await exec(
            "git",
            ["-C", root, "rev-parse", "--verify", "HEAD"],
            options,
          )
        ).stdout.trim();
        if (before !== after || rawSha256(pinned.stdout) !== sourceDigest)
          throw new Refusal(
            409,
            "basis-unverified",
            `${b.reference}: working bytes differ from the pinned blob`,
          );
      } else {
        const source = cfg.preparationSources?.[b.reference];
        if (!source || source.kind !== b.kind || source.revision !== b.revision)
          throw new Refusal(
            409,
            "basis-unverified",
            `${b.reference}: document/policy revision is not configured`,
          );
        if ((await stat(source.path)).size > MAX_SOURCE)
          throw new Refusal(
            409,
            "basis-unverified",
            `${b.reference}: source exceeds the retained input budget`,
          );
        bytes = await readBasisFile(source.path);
        sourceDigest = rawSha256(bytes);
      }
      total +=
        bytes.length +
        (artifacts ?? []).reduce((n, a) => n + a.bytes.length, 0);
      if ((artifacts ?? []).some((a) => a.bytes.length > MAX_SOURCE))
        throw new Refusal(
          409,
          "basis-unverified",
          `${b.reference}: dependency artifact exceeds the input budget`,
        );
      if (
        bytes.length > MAX_SOURCE ||
        total > MAX_TOTAL ||
        sourceDigest !== b.digest.value
      )
        throw new Refusal(
          409,
          "basis-unverified",
          `${b.reference}: source digest changed or input budget exceeded`,
        );
      out.push({
        reference: b.reference,
        kind: b.kind,
        source_digest: sourceDigest,
        bytes,
        bytes_sha256: rawSha256(bytes),
        ...(artifacts ? { artifacts } : {}),
      });
    } catch (error) {
      if (error instanceof Refusal) throw error;
      throw new Refusal(
        409,
        "basis-unverified",
        `${b.reference}: controlled source cannot be verified`,
      );
    }
  }
  if (!out.length)
    throw new Refusal(
      409,
      "basis-unverified",
      "At least one controlled source is required",
    );
  return out;
}
