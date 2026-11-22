import { afterEach, describe, expect, it } from "vitest";
import { attentionItem as item } from "../test/fixtures.js";
import { attentionKey, newArrivals, notificationText, readNotifyChoice, titleWithCount, writeNotifyChoice } from "./attention.js";

describe("tab title count", () => {
  it("puts a known count above zero in front of the title", () => {
    expect(titleWithCount("Control Rod", 3)).toBe("(3) Control Rod");
  });
  it("leaves the title alone when nothing waits or the count is not known", () => {
    expect(titleWithCount("Control Rod", 0)).toBe("Control Rod");
    expect(titleWithCount("Control Rod", undefined)).toBe("Control Rod");
  });
});

describe("new arrivals", () => {
  it("treats the same package on a new revision as a new item", () => {
    const before = new Set([attentionKey(item())]);
    expect(newArrivals(before, [item()])).toEqual([]);
    expect(newArrivals(before, [item({ package_revision: 2 })])).toHaveLength(1);
  });
  it("tells kinds apart on one package", () => {
    const before = new Set([attentionKey(item())]);
    expect(newArrivals(before, [item({ kind: "dispute" })])).toHaveLength(1);
  });
});

describe("notification text", () => {
  it("names one item by its kind and the record's own title", () => {
    expect(notificationText([item()])).toEqual({ title: "Needs you: Accept", body: "Accept WP-1 Pump sizing" });
  });
  it("counts several and lists at most three titles", () => {
    const four = ["A", "B", "C", "D"].map((t, i) => item({ title: t, package_id: `WP-${i}` }));
    expect(notificationText(four)).toEqual({ title: "4 new items need you", body: "A\nB\nC" });
  });
  it("says nothing when nothing arrived", () => {
    expect(notificationText([])).toBeNull();
  });
});

describe("notify choice", () => {
  afterEach(() => window.localStorage.clear());
  it("is off until turned on, and belongs to one person", () => {
    expect(readNotifyChoice("ben")).toBe(false);
    writeNotifyChoice("ben", true);
    expect(readNotifyChoice("ben")).toBe(true);
    expect(readNotifyChoice("dora")).toBe(false);
    writeNotifyChoice("ben", false);
    expect(readNotifyChoice("ben")).toBe(false);
  });
});
