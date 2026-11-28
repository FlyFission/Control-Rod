// `controlrod card add` and `controlrod cards` against a stand-in for the running app.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addCard, CardError, client, listCards, pickProject } from "../lib/cards.mjs";

const projects = [
  { id: "PRJ-1", name: "Sandbox", mode: "software", repo: "FlyFission/control-rod-sandbox", repoStrategy: "worktree", workspaceRoot: "", lane: "public" },
  { id: "PRJ-2", name: "Notes", mode: "capital-projects", repo: "", repoStrategy: "worktree", workspaceRoot: "", lane: "internal" },
];

function app(answers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ method: init.method, path, auth: init.headers.authorization, body: init.body ? JSON.parse(init.body) : undefined });
    const a = answers[`${init.method} ${path}`];
    const [status, body] = typeof a === "function" ? a(calls.at(-1).body) : a ?? [404, { message: "no route" }];
    return { ok: status < 300, status, text: async () => JSON.stringify(body) };
  };
  const home = mkdtempSync(join(tmpdir(), "cr-cards-"));
  writeFileSync(join(home, "cli.token"), "tok\n");
  return { call: client({ home, port: 7300, fetchImpl }), calls };
}

test("adds a card to a worktree project the way quick add does", async () => {
  const { call, calls } = app({
    "GET /workspace/projects": [200, projects],
    "GET /repos": [200, { workspace_root: "/Users/x/projects" }],
    "POST /repos/materialize": (b) => [200, { local_path: `/Users/x/projects/.worktrees/${b.branch}`, branch: b.branch }],
    "POST /captures": (b) => [201, { id: "C-1", ...b }],
  });
  const { capture, project } = await addCard(call, "Add a hello line", { project: "sandbox", rand: () => 0 });
  assert.equal(project.id, "PRJ-1");
  assert.equal(capture.text, "[mode:software] [project-id:PRJ-1] [repo:FlyFission/control-rod-sandbox]\n\nAdd a hello line");
  assert.equal(capture.lane, "public");
  assert.equal(capture.checkout.branch, "cr/add-a-hello-line-000000");
  assert.equal(capture.checkout.workspace_root, "/Users/x/projects");
  assert.ok(calls.every((c) => c.auth === "Bearer tok"));
});

test("a project without a repository gets no worktree", async () => {
  const { call, calls } = app({ "GET /workspace/projects": [200, projects], "POST /captures": (b) => [201, { id: "C-2", ...b }] });
  const { capture } = await addCard(call, "Write a memo", { project: "PRJ-2" });
  assert.equal(capture.checkout, undefined);
  assert.equal(capture.text, "[mode:capital-projects] [project-id:PRJ-2]\n\nWrite a memo");
  assert.ok(!calls.some((c) => c.path.startsWith("/repos")));
});

test("names the projects when the one asked for does not exist, and refuses empty text", async () => {
  assert.throws(() => pickProject(projects, "nope"), /No project called nope\. Projects: Sandbox, Notes\./);
  const { call } = app({});
  await assert.rejects(addCard(call, "  "), CardError);
});

test("lists new captures and cards by column", async () => {
  const { call } = app({
    "GET /workspace/projects": [200, projects],
    "GET /packages": [200, [{ id: "P-1", title: "README hello", status: "in-verification", project: "PRJ-1" }, { id: "P-3", title: "Odd", status: "something-new-and-long", project: "PRJ-1" }, { id: "P-2", title: "Other", status: "accepted", project: "PRJ-2" }]],
    "GET /captures": [200, [{ id: "C-9", disposition: "pending", text: "[mode:software] [project-id:PRJ-1]\n\nFix it" }]],
  });
  assert.deepEqual(await listCards(call, { project: "Sandbox" }), ["New              C-9  Fix it", "Being checked    P-1  README hello", "something-new-and-long  P-3  Odd"]);
});

test("says to start Control Rod when there is no token, and to restart when it is refused", async () => {
  assert.throws(() => client({ home: mkdtempSync(join(tmpdir(), "cr-none-")), port: 1 }), /controlrod start/);
  const { call } = app({ "GET /packages": [403, { message: "Refused: this request did not come from the Control Rod app" }] });
  await assert.rejects(call("GET", "/packages"), /controlrod restart/);
  // Inside the checkout the person types `pnpm cr`, so the hint says that.
  assert.throws(() => client({ home: mkdtempSync(join(tmpdir(), "cr-none-")), port: 1, me: "pnpm cr" }), /`pnpm cr start` first/);
});
