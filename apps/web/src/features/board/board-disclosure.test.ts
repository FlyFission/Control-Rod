import { describe, expect, it } from "vitest";
import {
  DEFAULT_UNSUPPORTED_CAPABILITY_REASON,
  isAllowedAssetOrigin,
  isRedundantBranchLabel,
  partitionDeliverables,
  presentModelRouting,
  presentUsageMetric,
} from "./boardDisclosure.js";

describe("partitionDeliverables (AO-15 progressive deliverable disclosure)", () => {
  const sample = Array.from({ length: 14 }, (_, i) => `artifact-${i + 1}`);

  it("caps inline deliverables to 2 by default and signals expansion when more exist", () => {
    const res = partitionDeliverables(sample);
    expect(res.visible).toEqual(["artifact-1", "artifact-2"]);
    expect(res.hiddenCount).toBe(12);
    expect(res.overflowToInspectorCount).toBe(4);
    expect(res.canExpand).toBe(true);
  });

  it("expands up to 10 inline on click and routes the remainder to the review drawer/inspector", () => {
    const viaFlag = partitionDeliverables(sample, 2, 10, true);
    expect(viaFlag.visible).toHaveLength(10);
    expect(viaFlag.visible[0]).toBe("artifact-1");
    expect(viaFlag.visible[9]).toBe("artifact-10");
    expect(viaFlag.hiddenCount).toBe(4);
    expect(viaFlag.overflowToInspectorCount).toBe(4);
    expect(viaFlag.canExpand).toBe(false);

    const viaCollapsedCap = partitionDeliverables(sample, 10, 10);
    expect(viaCollapsedCap).toEqual(viaFlag);
  });

  it("does not offer expansion or overflow when item count is within the collapsed cap", () => {
    const twoItems = ["a", "b"];
    expect(partitionDeliverables(twoItems)).toEqual({
      visible: ["a", "b"],
      hiddenCount: 0,
      overflowToInspectorCount: 0,
      canExpand: false,
    });
    expect(partitionDeliverables([])).toEqual({
      visible: [],
      hiddenCount: 0,
      overflowToInspectorCount: 0,
      canExpand: false,
    });
  });

  it("handles counts between collapsedCap (2) and expandedCap (10) with zero inspector overflow", () => {
    const sixItems = sample.slice(0, 6);
    const collapsed = partitionDeliverables(sixItems, 2, 10);
    expect(collapsed.visible).toEqual(["artifact-1", "artifact-2"]);
    expect(collapsed.hiddenCount).toBe(4);
    expect(collapsed.overflowToInspectorCount).toBe(0);
    expect(collapsed.canExpand).toBe(true);

    const expanded = partitionDeliverables(sixItems, 2, 10, true);
    expect(expanded.visible).toEqual(sixItems);
    expect(expanded.hiddenCount).toBe(0);
    expect(expanded.overflowToInspectorCount).toBe(0);
    expect(expanded.canExpand).toBe(false);
  });

  it("never mutates the input array and clamps inverted or negative caps safely", () => {
    const input = Object.freeze(["x", "y", "z"]);
    const res = partitionDeliverables(input, -1, -5);
    expect(res.visible).toEqual([]);
    expect(res.hiddenCount).toBe(3);
    expect(res.overflowToInspectorCount).toBe(3);
    expect(res.canExpand).toBe(false);
  });
});

describe("isRedundantBranchLabel (AO-15 duplicate branch/ref suppression)", () => {
  it("returns true when the branch or ref label is null, undefined, or whitespace", () => {
    expect(isRedundantBranchLabel("Fix primary coolant seal", undefined)).toBe(true);
    expect(isRedundantBranchLabel("Fix primary coolant seal", null)).toBe(true);
    expect(isRedundantBranchLabel("Fix primary coolant seal", "   ")).toBe(true);
  });

  it("returns true when branch/ref normalizes to the same text as the card title or id", () => {
    expect(isRedundantBranchLabel("Fix primary coolant seal", "Fix primary coolant seal")).toBe(true);
    expect(isRedundantBranchLabel("Fix primary coolant seal", "fix-primary-coolant-seal")).toBe(true);
    expect(isRedundantBranchLabel("Fix primary coolant seal", "feat/fix-primary-coolant-seal")).toBe(true);
    expect(isRedundantBranchLabel("Fix primary coolant seal", "refs/heads/fix/fix-primary-coolant-seal")).toBe(true);
    expect(isRedundantBranchLabel("WP-108", "wp-108")).toBe(true);
    expect(isRedundantBranchLabel("WP-108", "origin/wp_108")).toBe(true);
  });

  it("returns false when the branch label carries distinct information from the card title", () => {
    expect(isRedundantBranchLabel("Fix primary coolant seal", "feat/ao-s8-web-artifacts-reroute")).toBe(false);
    expect(isRedundantBranchLabel("WP-108", "feat/valve-recalibration")).toBe(false);
  });
});

describe("presentUsageMetric (AO-15 zero-fabrication & accessible usage telemetry)", () => {
  it("omits idle 0% or missing CPU telemetry and never fabricates token counts or $0.00 cost", () => {
    expect(presentUsageMetric({})).toEqual({
      showCpu: false,
      compactTokensLabel: null,
      srOnlyTokensLabel: null,
      costLabel: "Cost not reported",
    });

    expect(
      presentUsageMetric({
        cpuPercent: 0,
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        reportedCostUsd: "   ",
      }),
    ).toEqual({
      showCpu: false,
      compactTokensLabel: null,
      srOnlyTokensLabel: null,
      costLabel: "Cost not reported",
    });

    expect(presentUsageMetric({ cpuPercent: -2 }).showCpu).toBe(false);
  });

  it("shows CPU when > 0, pairs compact tabular token labels with sr-only copy, and preserves reported cost", () => {
    const metric = presentUsageMetric({
      inputTokens: 12450,
      outputTokens: 1320,
      cachedTokens: 8000,
      reportedCostUsd: "$0.14",
      cpuPercent: 37.5,
    });

    expect(metric.showCpu).toBe(true);
    expect(metric.compactTokensLabel).toBe("12,450 in · 1,320 out · 8,000 cached");
    expect(metric.srOnlyTokensLabel).toBe(
      "Token usage: 12,450 input tokens, 1,320 output tokens, 8,000 cached tokens",
    );
    expect(metric.costLabel).toBe("$0.14");
  });

  it("includes only reported token dimensions without fabricating 0 for omitted dimensions", () => {
    const partial = presentUsageMetric({
      inputTokens: 950,
      outputTokens: undefined,
      cachedTokens: null,
    });
    expect(partial.compactTokensLabel).toBe("950 in");
    expect(partial.srOnlyTokensLabel).toBe("Token usage: 950 input tokens");
    expect(partial.costLabel).toBe("Cost not reported");
  });
});

describe("presentModelRouting (AO-16 honest model reroute & capability disclosure)", () => {
  it("surfaces an honest reroute badge when actualModel differs from requestedModel", () => {
    const routed = presentModelRouting({
      requestedModel: "claude-opus-4-6",
      actualModel: "claude-sonnet-4-5",
    });
    expect(routed.isRerouted).toBe(true);
    expect(routed.routingBadge).toBe("Answered by claude-sonnet-4-5 (requested claude-opus-4-6)");
  });

  it("shows the requested model without a reroute warning when actualModel matches or is absent", () => {
    const same = presentModelRouting({
      requestedModel: "claude-opus-4-6",
      actualModel: "claude-opus-4-6",
    });
    expect(same.isRerouted).toBe(false);
    expect(same.routingBadge).toBe("claude-opus-4-6");

    const unreported = presentModelRouting({
      requestedModel: "claude-opus-4-6",
      actualModel: null,
    });
    expect(unreported.isRerouted).toBe(false);
    expect(unreported.routingBadge).toBe("claude-opus-4-6");
  });

  it("preserves unsupported capabilities as disabled with an explicit inline reason instead of dropping them", () => {
    const res = presentModelRouting({
      requestedModel: "gpt-5.4",
      capabilities: [
        { id: "code-review", label: "Code review", supported: true },
        {
          id: "browser-headless",
          label: "Headless browser verification",
          supported: false,
          reasonIfUnsupported: "Sandbox network policy forbids headless Chromium egress",
        },
        {
          id: "pdf-ocr",
          label: "Scanned PDF OCR",
          supported: false,
          reasonIfUnsupported: "   ",
        },
      ],
    });

    expect(res.capabilityItems).toEqual([
      {
        id: "code-review",
        label: "Code review",
        supported: true,
        disabled: false,
        inlineReason: null,
      },
      {
        id: "browser-headless",
        label: "Headless browser verification",
        supported: false,
        disabled: true,
        inlineReason: "Sandbox network policy forbids headless Chromium egress",
      },
      {
        id: "pdf-ocr",
        label: "Scanned PDF OCR",
        supported: false,
        disabled: true,
        inlineReason: DEFAULT_UNSUPPORTED_CAPABILITY_REASON,
      },
    ]);
  });
});

describe("isAllowedAssetOrigin (#133, AO #8785 zero-third-party-network URL guard)", () => {
  const currentOrigin = "https://control-rod.internal:8443";

  it("allows relative URLs, data:/blob: URLs, currentOrigin, localhost/127.0.0.1, and configured origins", () => {
    expect(isAllowedAssetOrigin("/assets/fonts/inter.woff2", currentOrigin)).toBe(true);
    expect(isAllowedAssetOrigin("tiles/12/2048/1362.png", currentOrigin)).toBe(true);
    expect(isAllowedAssetOrigin("./icons/rod.svg", currentOrigin)).toBe(true);
    expect(isAllowedAssetOrigin("data:image/png;base64,iVBORw0KGgo=", currentOrigin)).toBe(true);
    expect(isAllowedAssetOrigin(`blob:${currentOrigin}/550e8400-e29b-41d4-a716-446655440000`, currentOrigin)).toBe(
      true,
    );
    expect(isAllowedAssetOrigin("blob:null/550e8400-e29b-41d4-a716-446655440000", currentOrigin)).toBe(true);
    expect(isAllowedAssetOrigin(`${currentOrigin}/api/v1/artifacts/A-1`, currentOrigin)).toBe(true);
    expect(isAllowedAssetOrigin("http://localhost:8080/tiles/1/1/1.png", currentOrigin)).toBe(true);
    expect(isAllowedAssetOrigin("http://127.0.0.1:9000/fonts/mono.woff2", currentOrigin)).toBe(true);
    expect(
      isAllowedAssetOrigin("https://maps.plant.local/tiles/3/4/5.png", currentOrigin, [
        "https://maps.plant.local",
      ]),
    ).toBe(true);
  });

  it("rejects unconfigured third-party tile, font, and CDN origins by default", () => {
    expect(isAllowedAssetOrigin("https://tile.openstreetmap.org/12/2048/1362.png", currentOrigin)).toBe(false);
    expect(isAllowedAssetOrigin("https://fonts.googleapis.com/css2?family=Inter", currentOrigin)).toBe(false);
    expect(isAllowedAssetOrigin("https://fonts.gstatic.com/s/inter/v18/font.woff2", currentOrigin)).toBe(false);
    expect(isAllowedAssetOrigin("//tile.openstreetmap.org/12/2048/1362.png", currentOrigin)).toBe(false);
    expect(isAllowedAssetOrigin("blob:https://tile.openstreetmap.org/550e8400", currentOrigin)).toBe(false);
  });

  it("rejects empty strings and non-web / executable URL schemes", () => {
    expect(isAllowedAssetOrigin("", currentOrigin)).toBe(false);
    expect(isAllowedAssetOrigin("   ", currentOrigin)).toBe(false);
    expect(isAllowedAssetOrigin("javascript:alert(1)", currentOrigin)).toBe(false);
    expect(isAllowedAssetOrigin("file:///etc/passwd", currentOrigin)).toBe(false);
    expect(isAllowedAssetOrigin("ws://evil.example.com/socket", currentOrigin)).toBe(false);
  });
});
