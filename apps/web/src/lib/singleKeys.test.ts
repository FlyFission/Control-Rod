import { afterEach, describe, expect, it, vi } from "vitest";
import { setSingleKeys, singleKeysOn } from "./singleKeys.js";

describe("single-key shortcuts switch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });
  it("is on by default and remembers off on this browser", () => {
    expect(singleKeysOn()).toBe(true);
    setSingleKeys(false);
    expect(singleKeysOn()).toBe(false);
    expect(window.localStorage.getItem("cr.single-key-shortcuts")).toBe("off");
  });
  it("follows a choice made in another tab of this browser", () => {
    setSingleKeys(true);
    window.dispatchEvent(new StorageEvent("storage", { key: "cr.single-key-shortcuts", newValue: "off" }));
    expect(singleKeysOn()).toBe(false);
    window.dispatchEvent(new StorageEvent("storage", { key: "cr.single-key-shortcuts", newValue: "on" }));
    expect(singleKeysOn()).toBe(true);
  });
  it("still turns off for this page when browser storage refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    setSingleKeys(false);
    expect(singleKeysOn()).toBe(false);
  });
});
