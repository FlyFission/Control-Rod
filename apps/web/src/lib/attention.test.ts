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
  it("tells apart two captures held by the same SCRAM", () => {
    const one = item({ kind: "scram", scram_id: "S-1", capture_id: "C-1" });
    const before = new Set([attentionKey(one)]);
    expect(newArrivals(before, [item({ kind: "scram", scram_id: "S-1", capture_id: "C-2" })])).toHaveLength(1);
  });
  it("treats a run lost again on the same revision as a new item", () => {
    const lost = item({ kind: "lost", since: "2026-11-23T10:00:00Z" });
    const before = new Set([attentionKey(lost)]);
    expect(newArrivals(before, [lost])).toEqual([]);
    expect(newArrivals(before, [item({ kind: "lost", since: "2026-11-23T11:00:00Z" })])).toHaveLength(1);
  });
});

describe("notification text", () => {
  it("names one item by its kind and the record's own title", () => {
    expect(notificationText([item()])).toEqual({ title: "Needs you: Accept", body: "Open Control Rod to see it." });
  });
  it("counts several without listing their titles", () => {
    const four = ["A", "B", "C", "D"].map((t, i) => item({ title: t, package_id: `WP-${i}` }));
    expect(notificationText(four)).toEqual({ title: "4 new items need you", body: "Open Control Rod to see them." });
  });
  it("never carries a record's title or a SCRAM reason", () => {
    const scram = item({ kind: "scram", title: "SCRAM: secret-project leaked a token", scram_id: "S-1" });
    const text = notificationText([scram]);
    expect(text?.title).toBe("Needs you: SCRAM");
    expect(JSON.stringify(text)).not.toContain("secret-project");
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
