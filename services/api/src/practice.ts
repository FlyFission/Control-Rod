import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Caller } from "./admin.js";
import type { Db, Tx } from "./db/index.js";
import { appendEvent } from "./events.js";
import { Refusal } from "./refusal.js";
import { captureTags } from "./workflow.js";
import { type WorkspaceProjectView, createWorkspaceProject, listWorkspaceProjects } from "./workspace-projects.js";

/**
 * The practice project (change record practice-agent). A newcomer with no agent account can watch
 * the whole loop on a bundled sample project: intake, plan, release, author, pre-check, accept.
 *
 * The two practice runtimes are fixed routines inside the daemon (daemon/internal/runner/
 * adapter_practice.go): no model, no process, nothing from the job is executed. The rule this
 * module holds is that practice and real work never meet:
 *
 * - a practice project's runs go only to the practice runtimes, and
 * - the practice runtimes get no run of any other project,
 *
 * so the independence the practice author and the practice checker give each other (they are
 * separate routines on separate providers) never stands in for a real one. Release and acceptance
 * on the practice project need the passkey exactly as on any other project, or follow the signing
 * preset its owner chose.
 */

/** The practice author: intake and authoring. */
export const PRACTICE_AUTHOR = "practice";
/** The practice checker: pre-checks only, on a provider other than the author's. */
export const PRACTICE_CHECKER = "practice-check";
export const PRACTICE_RUNTIMES: readonly string[] = [PRACTICE_AUTHOR, PRACTICE_CHECKER];

export const isPracticeRuntime = (runtime: unknown): boolean =>
  typeof runtime === "string" && PRACTICE_RUNTIMES.includes(runtime.trim().toLowerCase());

/** The default name; the person can rename nothing about it but its lanes on the board. */
export const PRACTICE_PROJECT_NAME = "Practice project";

/** Where the bundled sample project lives in the repository. */
export const sampleSource = (root: string) => join(root, "services", "api", "practice", "sample-project");

/** Control Rod's own data folder for practice copies, unless the server names one. */
export const defaultPracticeDir = () => join(process.env.CONTROLROD_HOME ?? join(homedir(), ".controlrod"), "practice");

/** The files the practice card attaches, in this order. Nothing else from the copy is read. */
const SAMPLE_FILES = ["README.md", "hello.py"];
const MAX_SAMPLE_FILE = 64 * 1024;

/** Whether this project is a practice project, by the mark only Control Rod sets when it makes one. */
export async function isPracticeProject(q: { query: Db["query"] }, projectId: unknown, orgId: string | undefined): Promise<boolean> {
  if (typeof projectId !== "string" || !projectId.trim() || !orgId) return false;
  const r = await q.query(
    "select 1 from projects where id = $1 and org_id = $2 and (body->>'practice')::boolean is true",
    [projectId.trim(), orgId],
  );
  return Boolean(r.rowCount);
}

/** The project a capture's header names, when it names one. */
export function captureProjectId(text: unknown): string | undefined {
  const ids = new Set((captureTags(text) ?? []).filter((t) => t.key === "project-id").map((t) => t.value.trim()).filter(Boolean));
  // Two different projects are none, as promotion reads them.
  return ids.size === 1 ? [...ids][0] : undefined;
}

/**
 * A new capture keeps practice and real work apart: one on the practice project never binds a
 * repository checkout, and one anywhere else never asks for a practice agent.
 */
export async function guardPracticeCapture(c: { query: Db["query"] }, user: string, text: string, checkout: unknown): Promise<void> {
  const org = (await c.query<{ org_id: string }>("select org_id from members where user_name = $1", [user])).rows[0]?.org_id;
  if (await isPracticeProject(c, captureProjectId(text), org)) {
    if (checkout) throw new Refusal(409, "practice-fixed", "A practice card works on the bundled sample, never on a repository.");
    return;
  }
  refusePracticePick((captureTags(text) ?? []).filter((t) => t.key === "author" || t.key === "checker").map((t) => t.value.split("/")[0]));
}

/** The organization's active practice project, if it has one. */
export async function activePracticeProject(q: { query: Db["query"] }, orgId: string): Promise<string | null> {
  const r = await q.query<{ id: string }>(
    `select id from projects
      where org_id = $1 and (body->>'practice')::boolean is true and coalesce(body->>'status', 'active') = 'active'
      order by created_at desc, id limit 1`,
    [orgId],
  );
  return r.rows[0]?.id ?? null;
}

/**
 * The runtimes a run may use: on a practice project only the practice runtimes, anywhere else
 * never them. A pre-check on a practice project takes the practice checker alone, and an author or
 * intake the practice author alone, so neither can stand in for the other.
 */
export function practiceOffer(offer: readonly string[], practice: boolean, role: string): string[] {
  if (!practice) return offer.filter((r) => !isPracticeRuntime(r));
  const want = role === "pre-check" ? PRACTICE_CHECKER : PRACTICE_AUTHOR;
  return offer.filter((r) => r === want);
}

/** The hold reason for a practice run when the daemon offers no practice runtime. */
export const PRACTICE_RUNTIME_HOLD =
  "Waiting for the practice agents. They come with Control Rod's run daemon: start it with `pnpm cr start`, and check that CONTROLROD_PRACTICE is not set to 0.";

/** Refuses an agent pick that names a practice runtime: those belong to the practice project only. */
export function refusePracticePick(values: unknown[]): void {
  for (const v of values) {
    const eco = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>).ecosystem : v;
    if (isPracticeRuntime(eco)) {
      throw new Refusal(400, "practice-only", "The practice agents work only on the practice project. Pick a real agent for this project.");
    }
  }
}

/** Copies the bundled sample into the practice folder once, and returns where it is. */
export function ensureSampleCopy(root: string, practiceDir: string): string {
  const dest = join(practiceDir, "sample-project");
  if (!existsSync(dest)) {
    mkdirSync(practiceDir, { recursive: true, mode: 0o700 });
    cpSync(sampleSource(root), dest, { recursive: true, errorOnExist: false, force: false });
  }
  return dest;
}

/**
 * The sample's files for the card, read from the copy as plain small files. A file that is a link,
 * not a regular file, too large or missing falls back to the bundled original, so nothing outside
 * the copy is ever read through it.
 */
function sampleFiles(root: string, copy: string): { name: string; bytes: Buffer }[] {
  const out: { name: string; bytes: Buffer }[] = [];
  const names = new Set(readdirSync(sampleSource(root)));
  for (const name of SAMPLE_FILES) {
    if (!names.has(name)) continue;
    let bytes: Buffer | null = null;
    try {
      const st = lstatSync(join(copy, name));
      if (st.isFile() && st.size <= MAX_SAMPLE_FILE) bytes = readFileSync(join(copy, name));
    } catch {
      bytes = null;
    }
    out.push({ name, bytes: bytes ?? readFileSync(join(sampleSource(root), name)) });
  }
  return out;
}

/** The fixed request of a practice card, with the sample attached the way the capture box attaches files. */
export function practiceCaptureText(projectId: string, files: { name: string; bytes: Buffer }[]): string {
  const fences = files.map((f) => `\`\`\`attachment name="${f.name}" encoding="base64"\n${f.bytes.toString("base64")}\n\`\`\``);
  return [
    `[project-id:${projectId}] [mode:software]`,
    "Practice card: add a short Getting started section to the sample project's README, so a newcomer knows how to run the program.",
    "",
    ...fences,
  ].join("\n");
}

/**
 * Makes the organization's practice project, or returns the one it has. Run inside the signed
 * project.practice-start command: making a project needs a passkey, as any project does.
 */
export async function startPracticeProject(
  c: Tx,
  caller: Caller,
  root: string,
  practiceDir: string,
  signed?: Parameters<typeof createWorkspaceProject>[3],
): Promise<WorkspaceProjectView & { sample_dir: string }> {
  const sample = ensureSampleCopy(root, practiceDir);
  const existing = await activePracticeProject(c, caller.orgId);
  if (existing) {
    const view = (await listWorkspaceProjects(c as unknown as Db, caller.orgId)).find((p) => p.id === existing);
    if (view) return { ...view, sample_dir: sample };
  }
  const view = await createWorkspaceProject(c, caller, {
    name: PRACTICE_PROJECT_NAME,
    mode: "software",
    lane: "public",
    author: { ecosystem: PRACTICE_AUTHOR, model: "default", reasoning: "default" },
    checker: { ecosystem: PRACTICE_CHECKER, model: "default", reasoning: "default" },
  }, signed, { practice: true });
  await appendEvent(c, "project.practice-started", view.id, { kind: "human", id: caller.userName }, { sample: "bundled" });
  return { ...view, practice: true, sample_dir: sample };
}

/** The sample's files for a new practice card on this project. */
export function practiceCardText(root: string, practiceDir: string, projectId: string): { text: string; sample_dir: string } {
  const copy = ensureSampleCopy(root, practiceDir);
  return { text: practiceCaptureText(projectId, sampleFiles(root, copy)), sample_dir: copy };
}
