import { describe, expect, it } from "vitest";
import type { AgentFigure, ScramSummary } from "../../api/types.js";
import { type Floor, type Read, annunciator, coreState, emptyFloorNote, rodState } from "./plant-instruments.js";

/** The plant's instruments (plant view design, section 6): only what was reported, and unknown never shown as zero. */

const fig = (state: AgentFigure["state"]) => ({ state }) as AgentFigure;
const floor = (over: Partial<Floor> = {}, read: Partial<Read<Floor>> = {}): Read<Floor> => ({
  data: { figures: [fig("working"), fig("working"), fig("stuck"), fig("waiting"), fig("needs")], needs_me: 1, inbox_items: 3, hidden: 0, ...over },
  failed: false,
  at: Date.parse("2026-11-23T15:00:00Z"),
  ...read,
});
const scram = (over: Partial<ScramSummary["scram"]> & { stopped?: ScramSummary["stopped"] } = {}): ScramSummary => {
  const { stopped, ...s } = over;
  return { scram: { id: "S-1", org_id: "o", scope: "organization", ...s } as ScramSummary["scram"], run_count: 2, ...(stopped ? { stopped } : {}) };
};
const scrams = (list: ScramSummary[], read: Partial<Read<{ scrams: ScramSummary[] }>> = {}) => ({ data: { scrams: list }, failed: false, at: Date.parse("2026-11-23T15:00:00Z"), ...read });
const none: Read<{ scrams: ScramSummary[] }> = { data: undefined, failed: false, at: 0 };

describe("annunciator", () => {
  it("is dark when the plant is normal: normal waiting is not a window", () => {
    const w = annunciator(floor({ figures: [fig("working"), fig("waiting")], needs_me: 0, inbox_items: 0 }), scrams([]));
    expect(w.map((x) => [x.id, x.state, x.count])).toEqual([
      ["waiting-on-you", "dark", 0],
      ["stuck", "dark", 0],
      ["changed", "dark", 0],
      ["scram", "dark", 0],
    ]);
  });

  it("counts what waits on the viewer from the control plane's own count, not figures in the needs state", () => {
    const [mine] = annunciator(floor({ needs_me: 0 }), scrams([]));
    expect(mine).toMatchObject({ state: "dark", count: 0, note: "3 more in the Inbox" });
    const [lit] = annunciator(floor(), scrams([]));
    expect(lit).toMatchObject({ state: "lit", count: 1, note: "2 more in the Inbox" });
  });

  it("says Loading or Unavailable, never 0, before or without a read, and marks a last known reading", () => {
    const loading = annunciator({ data: undefined, failed: false, at: 0 }, none);
    expect(loading.every((x) => x.state === "loading" && x.count === undefined)).toBe(true);
    const failed = annunciator({ data: undefined, failed: true, at: 0 }, { data: undefined, failed: true, at: 0 });
    expect(failed.every((x) => x.state === "unavailable")).toBe(true);
    const stale = annunciator(floor({}, { failed: true }), scrams([]));
    expect(stale[1]!.asOf).toMatch(/^as of /);
  });

  it("lights SCRAM for one in force, names its scope, and never lights for a drill alone", () => {
    expect(annunciator(floor(), scrams([scram()]))[3]).toMatchObject({ state: "lit", count: 1, note: "Organization" });
    expect(annunciator(floor(), scrams([scram({ scope: "project", project_id: "p" }), scram({ id: "S-2", scope: "project", project_id: "q" })]))[3]).toMatchObject({ state: "lit", count: 2, note: "2 projects" });
    expect(annunciator(floor(), scrams([scram({ drill: true })]))[3]).toMatchObject({ state: "dark", count: 0, note: "1 drill" });
  });
});

describe("core", () => {
  it("is lit while any shown agent works, as a count in words, with no number it does not have", () => {
    expect(coreState(floor())).toEqual({ lit: true, caption: "2 agents working" });
    expect(coreState(floor({ figures: [fig("working")] }))).toEqual({ lit: true, caption: "1 agent working" });
    expect(coreState(floor({ figures: [fig("stuck")] }))).toEqual({ lit: false, caption: "No agent working" });
  });

  it("never says no agent works when presenting hides some", () => {
    expect(coreState(floor({ figures: [fig("stuck")], hidden: 3 }))).toEqual({ lit: false, caption: "0 shown working, 3 hidden" });
  });

  it("is neither lit nor dark before or without a read", () => {
    expect(coreState({ data: undefined, failed: true, at: 0 })).toEqual({ lit: null, caption: "Status unavailable" });
    expect(coreState(floor({}, { failed: true })).caption).toMatch(/^2 agents working, as of /);
  });
});

describe("control rods", () => {
  it("are withdrawn with no SCRAM in force, and unknown when SCRAM status could not be read", () => {
    expect(rodState(scrams([]))).toEqual({ position: "withdrawn" });
    expect(rodState(none)).toEqual({ position: "unknown", caption: "SCRAM status unavailable" });
    expect(rodState({ data: undefined, failed: true, at: 0 }).position).toBe("unknown");
  });

  it("insert for an organization SCRAM, and claim the stop only once it is recorded", () => {
    expect(rodState(scrams([scram()]))).toEqual({ position: "inserted", caption: "SCRAM in force: organization, stop not yet recorded" });
    const stopped = rodState(scrams([scram({ stopped: { ms_to_stop: 900, runs: 2, at: "2026-11-23T15:01:00Z" } })]));
    expect(stopped.position).toBe("inserted");
    expect(stopped.caption).toMatch(/^SCRAM in force: organization, runs stopped at /);
  });

  it("insert one bank for project SCRAMs and name how many, claiming nothing about other work", () => {
    expect(rodState(scrams([scram({ scope: "project", project_id: "p" })]))).toEqual({ position: "bank", caption: "SCRAM in force: 1 project" });
  });

  it("show a drill as a drill, never as a trip", () => {
    expect(rodState(scrams([scram({ drill: true })]))).toEqual({ position: "drill", caption: "SCRAM drill in force" });
    // A real SCRAM beside a drill is the real one.
    expect(rodState(scrams([scram({ drill: true }), scram({ id: "S-2" })])).position).toBe("inserted");
  });
});

describe("stale and hidden readings", () => {
  it("carries 'as of' on the rods and the core once a reading is no longer current", () => {
    const rods = rodState(scrams([scram({ scope: "project", project_id: "p" })], { failed: true }));
    expect(rods.asOf).toMatch(/^as of /);
    expect(rods.caption).toMatch(/^SCRAM in force: 1 project, as of /);
    expect(coreState(floor({}, { failed: true })).asOf).toMatch(/^as of /);
    expect(coreState(floor({})).asOf).toBeUndefined();
  });

  it("never says no agent is working when work is hidden while presenting", () => {
    expect(emptyFloorNote(0)).toBe("No agent is working right now.");
    expect(emptyFloorNote(3)).toBe("No agent is shown. 3 agents are hidden while presenting.");
  });
});
