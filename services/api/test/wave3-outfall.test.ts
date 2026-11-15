import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type EventRecord, eventDigest, verifySemanticInvariants } from "../src/events.js";
import {
  freezeWorkspace,
  issueClearance,
  recordApplication,
  recordVerdict,
} from "../src/outfall.js";

const tempDirs: string[] = [];

function makeTempRepo(): string {
  const dir = mkdtempSync(join(homedir(), ".cr-wave3-test-"));
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

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Wave 3 Merkle freeze, governed outfall, and semantic audit invariants", () => {
  it("verifySemanticInvariants catches non-monotonic seq, timestamp regression, and empty decision verdict", () => {
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
      type: "decision.recorded",
      subject: "PKG-1",
      actor: { kind: "human", id: "ben" },
      data: { verdict: "accepted" },
    };
    const ev2: EventRecord = { ...base2, digest: { algorithm: "sha256", value: eventDigest(base2) } };
    expect(verifySemanticInvariants([ev1, ev2])).toEqual([]);

    const bad: EventRecord = {
      ...ev2,
      seq: 1,
      at: "2026-11-15T11:59:00.000Z",
      data: { verdict: "   " },
    };
    const violations = verifySemanticInvariants([ev1, bad]);
    expect(violations.length).toBe(3);
  });

  it("freezeWorkspace captures deterministic Merkle digest without deleting untracked files", async () => {
    const repoDir = makeTempRepo();
    writeFileSync(join(repoDir, "calculations", "beam.py"), "sigma = 120\n");

    const freeze = await freezeWorkspace({ repoDir, label: "wave3-freeze" });
    expect(freeze.checkpoint_ref).toMatch(/^refs\/cr-checkpoints\/wave3-freeze-/);
    expect(freeze.manifest_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(freeze.file_count).toBeGreaterThanOrEqual(2);
    expect(existsSync(join(repoDir, "calculations", "beam.py"))).toBe(true);
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
