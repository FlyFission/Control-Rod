import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { type EventRecord, eventDigest, verifySemanticInvariants } from "../src/events.js";
import {
  freezeWorkspace,
  issueClearance,
  recordApplication,
  recordVerdict,
} from "../src/outfall.js";
import { Refusal } from "../src/refusal.js";
import { teach } from "../src/refusals.js";
import { repoRoutes } from "../src/repos.js";

const tempDirs: string[] = [];

function makeTempRepo(parentDir = homedir()): string {
  const dir = mkdtempSync(join(parentDir, ".cr-wave3-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  mkdirSync(join(dir, "calculations"), { recursive: true });
  writeFileSync(join(dir, "calculations", "load.py"), "print(42)\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

function makeWorkspaceWithRepo(): { workspaceRoot: string; repoDir: string } {
  const workspaceRoot = mkdtempSync(join(homedir(), "cr-wave3-ws-"));
  tempDirs.push(workspaceRoot);
  const repoDir = join(workspaceRoot, "sample-repo");
  mkdirSync(repoDir, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
  mkdirSync(join(repoDir, "calculations"), { recursive: true });
  writeFileSync(join(repoDir, "calculations", "load.py"), "print(42)\n");
  execFileSync("git", ["add", "."], { cwd: repoDir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: repoDir });
  return { workspaceRoot, repoDir };
}

async function withRepoApp<T>(fn: (app: FastifyInstance) => Promise<T>): Promise<T> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof Refusal) {
      const taught = teach(err.code);
      return reply.code(err.status).send({ code: err.code, message: err.message, change: taught.change });
    }
    throw err;
  });
  repoRoutes(app, async () => "person-test");
  try {
    return await fn(app);
  } finally {
    await app.close();
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Wave 3 Merkle freeze, governed outfall, and semantic audit invariants", () => {
  it("verifySemanticInvariants catches non-monotonic seq, timestamp regression, and missing decision status", () => {
    const base1: Omit<EventRecord, "digest"> = {
      seq: 1,
      at: "2026-11-15T12:00:00.000Z",
      type: "capture.created",
      subject: "CAP-1",
      actor: { kind: "human", id: "ben" },
    };
    const ev1: EventRecord = { ...base1, digest: { algorithm: "sha256", value: eventDigest(base1) } };
    const base2: Omit<EventRecord, "digest"> = {
      seq: 2,
      at: "2026-11-15T12:01:00.000Z",
      type: "decision.accept",
      subject: "PKG-1",
      actor: { kind: "human", id: "ben" },
      data: { revision: 0, decision: "dec_1", subject_digest: "abc", status: "accepted" },
    };
    const ev2: EventRecord = { ...base2, digest: { algorithm: "sha256", value: eventDigest(base2) } };
    expect(verifySemanticInvariants([ev1, ev2])).toEqual([]);

    const bad: EventRecord = {
      ...ev2,
      seq: 1,
      at: "2026-11-15T11:59:00.000Z",
      data: { status: "   " },
    };
    const violations = verifySemanticInvariants([ev1, bad]);
    expect(violations.length).toBe(3);

    const missingStatus: EventRecord = {
      ...ev2,
      seq: 3,
      at: "2026-11-15T12:02:00.000Z",
      data: { revision: 0 },
    };
    expect(verifySemanticInvariants([ev1, ev2, missingStatus])).toHaveLength(1);
  });

  it("freezeWorkspace captures deterministic Merkle digest without deleting untracked files or mangling special paths", async () => {
    const repoDir = makeTempRepo();
    writeFileSync(join(repoDir, "calculations", "beam.py"), "sigma = 120\n");
    writeFileSync(join(repoDir, "calculations", "café spec .py"), "val = 1\n");

    const freeze1 = await freezeWorkspace({ repoDir, label: "wave3-freeze" });
    const freeze2 = await freezeWorkspace({ repoDir, label: "wave3-freeze-2" });
    expect(freeze1.checkpoint_ref).toMatch(/^refs\/cr-checkpoints\/wave3-freeze-/);
    expect(freeze1.manifest_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(freeze1.manifest_digest).toBe(freeze2.manifest_digest);
    expect(freeze1.file_count).toBe(3);
    expect(existsSync(join(repoDir, "calculations", "beam.py"))).toBe(true);
    expect(existsSync(join(repoDir, "calculations", "café spec .py"))).toBe(true);
  });

  it("POST /repos/freeze enforces workspaceRoot containment, validates inputs, and maps git failures", async () => {
    const { workspaceRoot, repoDir } = makeWorkspaceWithRepo();
    const outsideRepo = makeTempRepo();
    writeFileSync(join(repoDir, "calculations", "beam.py"), "sigma = 120\n");

    await withRepoApp(async (app) => {
      const ok = await app.inject({
        method: "POST",
        url: "/repos/freeze",
        payload: { repo_path: repoDir, label: "wave3-http", workspace_root: workspaceRoot },
      });
      expect(ok.statusCode, ok.body).toBe(200);
      expect(ok.json()).toMatchObject({
        ok: true,
        manifest_digest: expect.stringMatching(/^[0-9a-f]{64}$/),
        checkpoint_ref: expect.stringMatching(/^refs\/cr-checkpoints\/wave3-http-/),
      });

      const outside = await app.inject({
        method: "POST",
        url: "/repos/freeze",
        payload: { repo_path: outsideRepo, workspace_root: workspaceRoot },
      });
      expect(outside.statusCode).toBe(400);
      expect(outside.json().code).toBe("invalid-repo-path");

      const badType = await app.inject({
        method: "POST",
        url: "/repos/freeze",
        payload: { repo_path: 123, workspace_root: workspaceRoot },
      });
      expect(badType.statusCode).toBe(400);
      expect(badType.json().code).toBe("invalid-repo-path");

      const badLabel = await app.inject({
        method: "POST",
        url: "/repos/freeze",
        payload: { repo_path: repoDir, label: 42, workspace_root: workspaceRoot },
      });
      expect(badLabel.statusCode).toBe(400);
      expect(badLabel.json().code).toBe("invalid");

      rmSync(join(repoDir, ".git", "refs", "cr-checkpoints"), { recursive: true, force: true });
      writeFileSync(join(repoDir, ".git", "refs", "cr-checkpoints"), "not-a-dir\n");
      const gitFail = await app.inject({
        method: "POST",
        url: "/repos/freeze",
        payload: { repo_path: repoDir, label: "blocked", workspace_root: workspaceRoot },
      });
      expect(gitFail.statusCode).toBe(400);
      expect(gitFail.json().code).toBe("git-failed");
    });
  });

  it("enforces Verdict -> Clearance -> Verified Application in both software and capital-projects modes", () => {
    const rejected = recordVerdict({
      packageId: "PKG-1",
      freezeDigest: "abc123",
      signerId: "ben",
      status: "rejected",
    });
    expect(() =>
      issueClearance({
        verdict: rejected,
        mode: "software",
        target: "FlyFission/Control-Rod#main",
        authorizerId: "ben",
      }),
    ).toThrow(/rejected verdict/i);

    const accepted = recordVerdict({
      packageId: "PKG-2",
      freezeDigest: "def456",
      signerId: "ben",
      status: "accepted",
    });
    const clearance = issueClearance({
      verdict: accepted,
      mode: "capital-projects",
      target: "transmittal://owner-review-01",
      authorizerId: "ben",
    });
    const record = recordApplication({
      clearance,
      externalRef: "zip://transmittal-01.zip",
      artifactDigest: "999aaa",
    });
    expect(record.mode).toBe("capital-projects");
    expect(record.record_digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
