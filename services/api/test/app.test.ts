import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildApp } from "../src/app.js";

const example = parse(
  readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"),
) as Record<string, unknown>;

describe("control plane skeleton", () => {
  it("reports health", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", version: "0.0.0" });
  });

  it("accepts the worked example against the generated schema", async () => {
    const res = await buildApp().inject({ method: "POST", url: "/packages", payload: example });
    expect(res.statusCode).toBe(201);
  });

  it("rejects a package without acceptance criteria", async () => {
    const { acceptance_criteria: _omit, ...bad } = example;
    const res = await buildApp().inject({ method: "POST", url: "/packages", payload: bad });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an engineering value sent as a JSON number", async () => {
    const bad = structuredClone(example) as { interfaces: { exports: { value: { value: unknown } }[] } };
    bad.interfaces.exports[0]!.value.value = 42.5;
    const res = await buildApp().inject({ method: "POST", url: "/packages", payload: bad });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown top-level field (RT-015)", async () => {
    const res = await buildApp().inject({
      method: "POST",
      url: "/packages",
      payload: { ...example, approved_by_agent: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown field nested inside a record (RT-015)", async () => {
    const bad = structuredClone(example) as { interfaces: { exports: Record<string, unknown>[] } };
    bad.interfaces.exports[0]!.deadband_waived = true;
    const res = await buildApp().inject({ method: "POST", url: "/packages", payload: bad });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown rigor mode", async () => {
    const res = await buildApp().inject({
      method: "POST",
      url: "/packages",
      payload: { ...example, rigor_mode: "whatever" },
    });
    expect(res.statusCode).toBe(400);
  });
});
