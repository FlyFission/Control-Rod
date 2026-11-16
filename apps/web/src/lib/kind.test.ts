import { afterEach, describe, expect, it, vi } from "vitest";
import { pkg } from "../test/fixtures.js";
import { kindsOf, loadLook, saveLook } from "./kind.js";

describe("kindsOf", () => {
  it("reads code from a code deliverable type, case and spacing ignored", () => {
    expect(kindsOf(pkg({ deliverables: [{ id: "D1", type: " Patch ", format: ["diff"] }] }))).toEqual(["code"]);
  });
  it("treats any other deliverable as a document", () => {
    expect(kindsOf(pkg({ deliverables: [{ id: "D1", type: "scope of work", format: ["pdf"] }] }))).toEqual(["doc"]);
  });
  it("shows both for a mixed package, code first", () => {
    expect(
      kindsOf(
        pkg({
          deliverables: [
            { id: "D1", type: "report", format: ["pdf"] },
            { id: "D2", type: "code", format: ["diff"] },
          ],
        }),
      ),
    ).toEqual(["code", "doc"]);
  });
  it("defaults a package with no deliverables to a document", () => {
    expect(kindsOf(pkg({ deliverables: [] }))).toEqual(["doc"]);
  });
});

describe("look preference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });
  it("defaults to look a", () => {
    expect(loadLook()).toBe("a");
  });
  it("round-trips a saved look", () => {
    saveLook("c");
    expect(loadLook()).toBe("c");
  });
  it("ignores a stored value that is not a look", () => {
    window.localStorage.setItem("cr.look", "zzz");
    expect(loadLook()).toBe("a");
  });
  it("falls back to look a when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadLook()).toBe("a");
  });
  it("does not throw when storage refuses a write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveLook("b")).not.toThrow();
  });
});
