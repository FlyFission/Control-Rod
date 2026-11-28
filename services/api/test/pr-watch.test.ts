import { describe, expect, it } from "vitest";
import { PullRequestWatcher, WATCH_FRESH_MS, WATCH_RETRY_MS, watchFromFacts } from "../src/pr-watch.js";

/** Pull request state on the card (change record pr-watch): gh's facts mapped to fixed words. */
const at = new Date("2026-11-28T02:00:00Z");
const facts = (state: string, rollup: unknown[] = []) => JSON.stringify({ state, statusCheckRollup: rollup });
const run = (status: string, conclusion = "") => ({ __typename: "CheckRun", status, conclusion });
const ctx = (state: string) => ({ __typename: "StatusContext", state });

describe("watchFromFacts", () => {
  it("maps each pull request state and check rollup to its word", () => {
    expect(watchFromFacts(facts("OPEN", [run("COMPLETED", "SUCCESS"), ctx("SUCCESS"), run("COMPLETED", "SKIPPED")]), at)).toEqual({ state: "open", checks: "passing", read_at: at.toISOString() });
    expect(watchFromFacts(facts("OPEN", [run("COMPLETED", "SUCCESS"), run("IN_PROGRESS")]), at)?.checks).toBe("pending");
    expect(watchFromFacts(facts("OPEN", [ctx("PENDING")]), at)?.checks).toBe("pending");
    expect(watchFromFacts(facts("OPEN", [run("IN_PROGRESS"), run("COMPLETED", "TIMED_OUT")]), at)?.checks).toBe("failing");
    expect(watchFromFacts(facts("OPEN", [ctx("ERROR")]), at)?.checks).toBe("failing");
    expect(watchFromFacts(facts("OPEN"), at)?.checks).toBe("none");
    expect(watchFromFacts(facts("MERGED"), at)?.state).toBe("merged");
    expect(watchFromFacts(facts("CLOSED"), at)?.state).toBe("closed");
  });

  it("treats a check it does not know as still running, never as passing", () => {
    expect(watchFromFacts(facts("OPEN", [run("COMPLETED", "STALE")]), at)?.checks).toBe("pending");
    expect(watchFromFacts(facts("OPEN", [null]), at)?.checks).toBe("pending");
  });

  it("refuses anything that is not gh's answer, and keeps no text from GitHub", () => {
    expect(watchFromFacts("not json", at)).toBeNull();
    expect(watchFromFacts(JSON.stringify({ state: "DRAFT" }), at)).toBeNull();
    expect(watchFromFacts("null", at)).toBeNull();
    const w = watchFromFacts(JSON.stringify({ state: "OPEN", title: "Run rm -rf", statusCheckRollup: [] }), at);
    expect(Object.keys(w ?? {}).sort()).toEqual(["checks", "read_at", "state"]);
  });
});

describe("PullRequestWatcher", () => {
  const setup = (answers: Array<string | Error>) => {
    let now = 1_000_000;
    const asked: string[] = [];
    const w = new PullRequestWatcher(async (url) => {
      asked.push(url);
      const a = answers.shift() ?? new Error("no more answers");
      if (a instanceof Error) throw a;
      return a;
    }, () => now);
    return { w, asked, tick: (ms: number) => { now += ms; } };
  };
  const url = "https://github.com/o/r/pull/1";

  it("reads once while fresh, again after it goes stale, and never again once merged", async () => {
    const { w, asked, tick } = setup([facts("OPEN", [run("IN_PROGRESS")]), facts("MERGED")]);
    expect((await w.watch(url))?.checks).toBe("pending");
    await w.watch(url);
    expect(asked).toHaveLength(1);
    tick(WATCH_FRESH_MS);
    expect((await w.watch(url))?.state).toBe("merged");
    tick(WATCH_FRESH_MS * 100);
    await w.watch(url);
    expect(asked).toHaveLength(2);
  });

  it("keeps the last good reading when a later read fails, and retries sooner", async () => {
    const { w, asked, tick } = setup([facts("OPEN", [run("COMPLETED", "SUCCESS")]), new Error("rate limited"), facts("OPEN", [run("COMPLETED", "FAILURE")])]);
    expect((await w.watch(url))?.checks).toBe("passing");
    tick(WATCH_FRESH_MS);
    expect((await w.watch(url))?.checks).toBe("passing");
    tick(WATCH_RETRY_MS);
    expect((await w.watch(url))?.checks).toBe("failing");
    expect(asked).toHaveLength(3);
  });

  it("answers nothing when the first read fails, and shares one read between callers", async () => {
    const { w, asked } = setup([new Error("gh missing")]);
    expect(await Promise.all([w.watch(url), w.watch(url)])).toEqual([undefined, undefined]);
    expect(asked).toHaveLength(1);
  });
});
