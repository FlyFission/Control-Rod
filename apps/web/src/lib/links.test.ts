import { describe, expect, it } from "vitest";
import { httpsHref, sitePathOrHttpsHref } from "./links.js";

describe("httpsHref", () => {
  it("keeps an https address", () => {
    expect(httpsHref("https://github.com/o/r/pull/1")).toBe("https://github.com/o/r/pull/1");
  });

  it("drops every other scheme and anything that is not an address", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://github.com/o/r/pull/1",
      "vbscript:x",
      "file:///etc/passwd",
      "/packages/WP-1",
      "//evil.example/x",
      "github.com/o/r",
      "",
      null,
      undefined,
    ]) {
      expect(httpsHref(bad), String(bad)).toBeUndefined();
    }
  });
});

describe("sitePathOrHttpsHref", () => {
  it("keeps a path on this site and an https address", () => {
    expect(sitePathOrHttpsHref("/packages/WP-1/runs/R-1/log")).toBe("/packages/WP-1/runs/R-1/log");
    expect(sitePathOrHttpsHref("https://example.org/e")).toBe("https://example.org/e");
  });

  it("drops a path that would reach another host and every other scheme", () => {
    for (const bad of ["//evil.example/x", "/\\evil.example/x", "/a\\b", "/a\tb", "javascript:alert(1)", "data:x", "http://a.b/", "relative/path", ""]) {
      expect(sitePathOrHttpsHref(bad), bad).toBeUndefined();
    }
  });
});
