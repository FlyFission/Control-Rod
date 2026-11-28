// `controlrod card add` and `controlrod cards`: add and watch cards from a terminal (or an agent
// working in one) without a browser or a passkey. They talk to the running app with the token it
// writes to <home>/cli.token, which opens only listing and adding cards (services/api/src/auth.ts,
// CLI_ROUTES). Adding a card does what the board's quick add does: the project's mode, id and repo
// tags, its default lane, and for a worktree project a worktree and branch of the card's own.
import { readFileSync } from "node:fs";
import { join } from "node:path";

// PackageStatus (spec/generated/json-schema/PackageStatus.json) in the board's words.
const STATUS = {
  draft: "Draft",
  released: "Ready",
  "in-work": "Agent working",
  "in-verification": "Being checked",
  accepted: "Accepted",
  closed: "Closed",
};

/** A branch name from what the card asks for, as the board makes it (apps/web/src/lib/branch.ts). */
export function cardBranchName(text, rand = Math.random) {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36).replace(/-+$/g, "");
  const tag = Math.floor(rand() * 0xffffff).toString(16).padStart(6, "0");
  return `${slug ? `cr/${slug}` : "cr/work-package"}-${tag}`;
}

/** The project a name or id means: exact id, else one name matched without case. Null for none given. */
export function pickProject(projects, wanted) {
  if (!wanted) return projects.length === 1 ? projects[0] : null;
  const byId = projects.find((p) => p.id === wanted);
  if (byId) return byId;
  const byName = projects.filter((p) => p.name.toLowerCase() === wanted.toLowerCase());
  if (byName.length === 1) return byName[0];
  const names = projects.map((p) => p.name).join(", ") || "none yet";
  throw new CardError(byName.length ? `More than one project is called ${wanted}; use its id.` : `No project called ${wanted}. Projects: ${names}.`);
}

export class CardError extends Error {}

/** A small client for the running app. `fetchImpl` is injectable for tests. */
export function client({ home, port, fetchImpl = fetch }) {
  let token;
  try {
    token = readFileSync(join(home, "cli.token"), "utf8").trim();
  } catch {
    throw new CardError("Control Rod is not running (or has not started since it was updated). Run `controlrod start` first.");
  }
  const base = `http://127.0.0.1:${port}`;
  return async function call(method, path, body) {
    let r;
    try {
      r = await fetchImpl(base + path, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new CardError("Control Rod is not running. Run `controlrod start` first.");
    }
    const text = await r.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        // Something other than Control Rod may be answering on this port, or the app sent an error
        // page. Either way the reply is not one this command can read, so it says that plainly.
        throw new CardError(
          `The app on port ${port} answered ${r.status} with a reply that is not JSON. If another program uses that port, stop it or start Control Rod on another port.`,
        );
      }
    }
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new CardError(`${json?.message ?? "Refused"}. If Control Rod was just updated, run \`controlrod restart\`.`);
      throw new CardError(json?.message ?? `The app answered ${r.status}`);
    }
    return json;
  };
}

/** Adds one card. Returns the capture the app recorded and the project it went to (or null). */
export async function addCard(call, text, { project: wanted, rand } = {}) {
  const title = text.trim();
  if (!title) throw new CardError("Say what needs doing, for example: controlrod card add \"Fix the login typo\"");
  const projects = (await call("GET", "/workspace/projects")) ?? [];
  const project = pickProject(projects, wanted);
  const mode = project?.mode ?? "software";
  const prefix = `[mode:${mode}]${project ? ` [project-id:${project.id}]${project.repo ? ` [repo:${project.repo}]` : ""}` : ""}\n\n`;
  const lane = project?.lane ?? "internal";
  let checkout;
  if (project?.repo && project.repoStrategy === "worktree") {
    const root = project.workspaceRoot || (await call("GET", "/repos")).workspace_root;
    const made = await call("POST", "/repos/materialize", {
      repo: project.repo,
      branch: cardBranchName(title, rand),
      strategy: "worktree",
      mode: mode === "capital-projects" ? "capital-projects" : "software",
      ...(root ? { workspace_root: root } : {}),
    });
    checkout = { repo: project.repo, local_path: made.local_path, branch: made.branch, ...(root ? { workspace_root: root } : {}) };
  }
  const capture = await call("POST", "/captures", { text: prefix + title, source: "cli", lane, ...(checkout ? { checkout } : {}) });
  return { capture, project };
}

/** One line per card, newest first: column, id, title. Captures still waiting for intake come first. */
export async function listCards(call, { project: wanted } = {}) {
  const projects = (await call("GET", "/workspace/projects")) ?? [];
  const project = wanted ? pickProject(projects, wanted) : null;
  const packages = (await call("GET", "/packages")) ?? [];
  const captures = (await call("GET", "/captures")) ?? [];
  const lines = [];
  for (const c of captures) {
    if (c.disposition !== "pending") continue;
    if (project && !String(c.text).includes(`[project-id:${project.id}]`)) continue;
    const words = String(c.text).replace(/\[[a-z-]+:[^\]]*\]/g, "").trim().split("\n")[0];
    lines.push(`${"New".padEnd(15)}  ${c.id}  ${words}`);
  }
  for (const p of packages) {
    if (project && p.project !== project.id) continue;
    lines.push(`${(STATUS[p.status] ?? p.status).padEnd(15)}  ${p.id}  ${p.title ?? ""}`);
  }
  return lines;
}
