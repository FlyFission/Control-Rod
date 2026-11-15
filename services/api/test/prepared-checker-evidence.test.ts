import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { preparedHarness } from "./preparation-flow.js";

let f: Awaited<ReturnType<typeof preparedHarness>>;
beforeAll(async () => {
  f = await preparedHarness();
}, 120_000);
afterAll(async () => f?.h.stop());

function brief(job: { inputs?: { name: string; content_base64: string }[] }) {
  const file = job.inputs?.find((i) => i.name === "BRIEF.md");
  if (!file) throw new Error("no brief");
  return Buffer.from(file.content_base64, "base64").toString();
}

function submission(
  job: { run: { package_id: string; preparation_manifest_digest: unknown } },
  evidenceRef: string,
) {
  return {
    package_id: job.run.package_id,
    package_revision: 0,
    release_manifest_digest: job.run.preparation_manifest_digest,
    results: [
      {
        criterion_id: "AC-1",
        outcome: "pass",
        finding_refs: [],
        check_results: [
          {
            check_id: "CHECK-1",
            outcome: "pass",
            evidence_refs: [evidenceRef],
          },
        ],
      },
    ],
  };
}

async function preparedCheck(authorRuntime: string, checkerRuntime: string) {
  const p = await f.draft();
  await f.release(p.id);
  const author = (await f.claim([authorRuntime])).json();
  expect(author.run.role, author).toBe("author");
  expect((await f.complete(author)).json().status).toBe("succeeded");
  const claim = await f.claim([checkerRuntime]);
  expect(claim.statusCode, claim.body).toBe(200);
  return claim.json();
}

describe("prepared checker evidence", () => {
  it("lets a fake prepared check keep a separate out/ evidence file", async () => {
    const checker = await preparedCheck("claude", "fake");
    expect(brief(checker)).toContain(
      "Retain actual check evidence as separate out/ files and reference it as checker:<relative file name>.",
    );
    expect(brief(checker)).toContain("out/verification.json");
    const done = await f.complete(checker, {
      verification: { outcome: "pass", findings: [] },
      criterion_results: submission(checker, "checker:checks.md"),
      outputs: [
        {
          name: "checks.md",
          content_base64: Buffer.from("Independent review log").toString("base64"),
        },
      ],
    });
    expect(done.json(), done.body).toMatchObject({ status: "succeeded" });
  });

  it("lets a sandboxed prepared check keep evidence uploaded from scratch/evidence/", async () => {
    const checker = await preparedCheck("fake", "claude");
    expect(brief(checker)).toContain(
      "Retain check evidence as files under scratch/evidence/ and reference each as checker:evidence/<relative file name>.",
    );
    expect(brief(checker)).toContain("scratch/verification.json");
    const done = await f.complete(checker, {
      verification: { outcome: "pass", findings: [] },
      criterion_results: submission(checker, "checker:evidence/checks.md"),
      outputs: [
        {
          name: "evidence/checks.md",
          content_base64: Buffer.from("Independent review log").toString("base64"),
        },
      ],
    });
    expect(done.json(), done.body).toMatchObject({ status: "succeeded" });
  });
});
