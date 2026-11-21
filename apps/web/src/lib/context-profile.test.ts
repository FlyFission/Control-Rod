import { describe, expect, it } from "vitest";
import { projectContextDefault, resolveContextProfile } from "./context-profile.js";

describe("resolveContextProfile", () => {
  it("locks Safety and Material grades to Nuclear, whatever the card or project says", () => {
    expect(resolveContextProfile({ grade: "safety", context_profile: "light" }, "light")).toEqual({
      profile: "nuclear", locked: true, reason: "Safety grade work is always Nuclear",
    });
    expect(resolveContextProfile({ grade: "material" })).toEqual({
      profile: "nuclear", locked: true, reason: "Material grade work is always Nuclear",
    });
  });

  it("uses the card's value, else the project default, else Light", () => {
    expect(resolveContextProfile({ grade: "general-service", context_profile: "light" }, "nuclear")).toEqual({ profile: "light", locked: false });
    expect(resolveContextProfile({ context_profile: "nuclear" })).toEqual({ profile: "nuclear", locked: false });
    expect(resolveContextProfile({}, "nuclear")).toEqual({ profile: "nuclear", locked: false });
    expect(resolveContextProfile({})).toEqual({ profile: "light", locked: false });
  });

  it("shows the server's resolution when it sent one", () => {
    const server = { profile: "nuclear" as const, locked: true, reason: "Trust-surface work is always Nuclear" };
    expect(resolveContextProfile({ context_profile: "light" }, "light", server)).toBe(server);
  });
});

describe("projectContextDefault", () => {
  const projects = [{ id: "prj_1", name: "Plant A", default_context_profile: "nuclear" as const }, { id: "prj_2", name: "Office" }];
  it("finds the project by id or name", () => {
    expect(projectContextDefault(projects, "prj_1")).toBe("nuclear");
    expect(projectContextDefault(projects, "Plant A")).toBe("nuclear");
    expect(projectContextDefault(projects, "Office")).toBeUndefined();
    expect(projectContextDefault(undefined, "prj_1")).toBeUndefined();
  });
});
