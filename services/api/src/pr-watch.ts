/**
 * What GitHub says about a pull request Control Rod opened: open, merged or closed, and whether its
 * checks pass. Read-only and live, through the same gh sign-in that opened it. Only fixed words come
 * back: no title, body or comment from GitHub is read or shown. Change record: pr-watch.
 */
import type { components } from "./preparation/schema.js";
import { readPullRequestFacts } from "./repos.js";

export type PullRequestWatch = components["schemas"]["PullRequestWatch"];

/** How long a read of an open pull request stays current. A proposed setting, not a measured value. */
export const WATCH_FRESH_MS = 5 * 60_000;
/** How soon a read that failed is tried again. A proposed setting, not a measured value. */
export const WATCH_RETRY_MS = 60_000;
/** How long a package view waits for a read in flight before it answers without one. A proposed setting. */
export const WATCH_WAIT_MS = 2_000;

const FAILED = new Set(["FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"]);
const PASSED = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

/** gh's JSON for `pr view --json state,statusCheckRollup`, mapped to fixed words; null if it is not that. */
export function watchFromFacts(json: string, readAt: Date): PullRequestWatch | null {
  let facts: unknown;
  try { facts = JSON.parse(json); } catch { return null; }
  if (typeof facts !== "object" || facts === null) return null;
  const { state, statusCheckRollup } = facts as { state?: unknown; statusCheckRollup?: unknown };
  const pr = state === "OPEN" ? "open" : state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : null;
  if (!pr) return null;
  const checks = Array.isArray(statusCheckRollup) ? statusCheckRollup : [];
  let failing = false;
  let pending = false;
  for (const c of checks) {
    if (typeof c !== "object" || c === null) { pending = true; continue; }
    const { status, conclusion, state: ctx } = c as { status?: unknown; conclusion?: unknown; state?: unknown };
    // A commit status (StatusContext) carries state; a check run carries status and conclusion.
    const word = typeof ctx === "string" ? ctx : status === "COMPLETED" ? conclusion : "PENDING";
    if (typeof word === "string" && FAILED.has(word)) failing = true;
    else if (!(typeof word === "string" && PASSED.has(word))) pending = true;
  }
  return { state: pr, checks: failing ? "failing" : pending ? "pending" : checks.length ? "passing" : "none", read_at: readAt.toISOString() };
}

type Entry = { watch: PullRequestWatch | null; until: number; inflight?: Promise<void> };

/** Reads pull request state with a short in-memory cache; one read per link at a time. */
export class PullRequestWatcher {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private read: (url: string) => Promise<string> = readPullRequestFacts,
    private readonly now: () => number = Date.now,
  ) {}

  /** Swaps how pull requests are read and forgets every read so far (tests use a scripted gh). */
  useReader(read: (url: string) => Promise<string>): void {
    this.read = read;
    this.entries.clear();
  }

  /** The latest known state of the pull request at `url`, or undefined when it has never been read. Never throws. */
  async watch(url: string): Promise<PullRequestWatch | undefined> {
    let e = this.entries.get(url);
    if (!e || (this.now() >= e.until && !e.inflight)) {
      const entry: Entry = e ?? { watch: null, until: 0 };
      entry.inflight = this.refresh(url, entry);
      this.entries.set(url, entry);
      e = entry;
    }
    if (e.inflight) await Promise.race([e.inflight, new Promise((r) => setTimeout(r, WATCH_WAIT_MS).unref?.())]);
    return e.watch ?? undefined;
  }

  private async refresh(url: string, e: Entry): Promise<void> {
    try {
      const w = watchFromFacts(await this.read(url), new Date(this.now()));
      if (w) e.watch = w;
      // A merged or closed pull request does not change back, so it is not read again.
      e.until = w ? (w.state === "open" ? this.now() + WATCH_FRESH_MS : Number.POSITIVE_INFINITY) : this.now() + WATCH_RETRY_MS;
    } catch {
      e.until = this.now() + WATCH_RETRY_MS;
    } finally {
      delete e.inflight;
    }
  }
}

export const pullRequestWatcher = new PullRequestWatcher();
