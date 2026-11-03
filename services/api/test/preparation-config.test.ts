import { describe, expect, it } from "vitest";
import { preparationConfig } from "../src/preparation/config.js";
describe("owner source configuration", () => {
  it("accepts only explicit source/repository maps", () => {
    expect(
      preparationConfig(
        JSON.stringify({
          repositories: { "repository:test": "/controlled/repo" },
          sources: {
            "document:brief": {
              kind: "document",
              revision: "A",
              path: "/controlled/brief.md",
            },
          },
        }),
      ),
    ).toMatchObject({
      preparationRepositories: { "repository:test": "/controlled/repo" },
      preparationSources: { "document:brief": { revision: "A" } },
    });
  });
  it("reads the data lane the owner gave each source and repository", () => {
    expect(
      preparationConfig(
        JSON.stringify({
          repositories: { "repository:test": { path: "/controlled/repo", lane: "proprietary" } },
          sources: { "document:brief": { kind: "document", revision: "A", path: "/controlled/brief.md", lane: "internal" } },
        }),
      ),
    ).toMatchObject({
      preparationRepositories: { "repository:test": "/controlled/repo" },
      preparationLanes: { "repository:test": "proprietary", "document:brief": "internal" },
    });
    expect(() => preparationConfig('{"sources":{"document:brief":{"kind":"document","revision":"A","path":"x","lane":"secret"}}}')).toThrow(/lane/);
  });
  for (const raw of [
    '{"sources":{},"sources":{}}',
    '{"unknown":true}',
    '{"repositories":{"repository:test":""}}',
    '{"sources":{"document:brief":{"kind":"document","revision":1,"path":"x"}}}',
    '{"sources":{"document:brief":{"kind":"policy","revision":"A","path":"x"}}}',
  ])
    it(`refuses ambiguous/misclassified configuration ${raw}`, () =>
      expect(() => preparationConfig(raw)).toThrow());
});
