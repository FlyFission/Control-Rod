import type { Db } from "./db/index.js";
import { PINNABLE } from "./runtimes.js";

/**
 * The Roster (workbench specification 12 and 21; plan task 5.1): who does the work and with what.
 * Everything here is read from records; nothing is inferred.
 *  - Roles: each run role, the baseline it runs as, the runtimes that have run it, its active pins
 *    and whether a rollback target exists.
 *  - Baselines: as recorded on runs. Baselines are not yet controlled items with their own revisions
 *    (AgentBaseline records are not written), and the view says so rather than implying approval.
 *  - Versions: every artifact a passing probe has seen for each pinnable runtime, the only ones a pin
 *    may name, with which roles pin it now.
 *  - Sandbox: the SandboxPolicy records in force (none until confinement lands, plan Phase 6) and,
 *    per runtime, the sandbox its latest completed run reported launching with. A run with no
 *    sandbox is reported as tier none, never as confined (specification 11.7).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

/** The run roles, in the order work flows. Which baseline and runtime ran each is read from the runs. */
const ROLES: { role: string; pinnable: boolean; what: string }[] = [
  { role: "intake", pinnable: true, what: "Reads a capture and drafts a work package" },
  { role: "requirements-preparer", pinnable: false, what: "Prepares the requirements a package will be held to" },
  { role: "technical-preparer", pinnable: false, what: "Prepares the technical basis a package works from" },
  { role: "author", pinnable: true, what: "Does the work of a released package" },
  { role: "pre-check", pinnable: true, what: "Checks the author's work, on another runtime where one is installed" },
];

export async function roster(db: Db) {
  const pins = (await db.query<{ body: Json; recorded_at: Date }>("select body, recorded_at from runtime_pins order by recorded_at")).rows;
  const active = pins.filter((p) => p.body.status === "active").map((p) => p.body);
  const runs = (await db.query<{ role: string; runtime: string | null; baseline: string | null; status: string; n: number; last: Date }>(
    `select role, body->'runtime'->>'provider' as runtime, body->>'agent_baseline' as baseline, status, count(*)::int as n, max(created_at) as last
       from runs group by 1, 2, 3, 4`)).rows;

  const roles = ROLES.map((r) => {
    const mine = runs.filter((x) => x.role === r.role);
    // Each runtime and baseline pair that has run this role; a role nothing has run yet names none.
    const pairs = new Map<string, { runtime: string; baseline: string }>();
    for (const x of mine)
      if (x.runtime && x.runtime !== "any" && x.baseline && x.baseline !== "unassigned") pairs.set(`${x.runtime}\u0000${x.baseline}`, { runtime: x.runtime, baseline: x.baseline });
    const last = mine.reduce<Date | null>((a, x) => (a === null || x.last > a ? x.last : a), null);
    return {
      role: r.role,
      what: r.what,
      pinnable: r.pinnable,
      baselines: [...pairs.values()].sort((a, b) => a.runtime.localeCompare(b.runtime) || a.baseline.localeCompare(b.baseline)),
      runs: mine.reduce((n, x) => n + x.n, 0),
      ...(last ? { last_run_at: last.toISOString() } : {}),
      pins: active.filter((p) => p.role === r.role),
      // A rollback needs an earlier pin of a different artifact, retired, for the same runtime and role.
      rollback: PINNABLE.filter((rt) => {
        const now = active.find((p) => p.role === r.role && p.runtime === rt);
        return now !== undefined && pins.some((p) => p.body.status === "retired" && p.body.role === r.role && p.body.runtime === rt && p.body.artifact_digest.value !== now.artifact_digest.value);
      }),
    };
  });

  const baselines = new Map<string, { id: string; roles: Set<string>; runs: number; last: Date; statuses: Record<string, number> }>();
  for (const x of runs) {
    if (!x.baseline || x.baseline === "unassigned") continue;
    const b = baselines.get(x.baseline) ?? { id: x.baseline, roles: new Set<string>(), runs: 0, last: x.last, statuses: {} };
    b.roles.add(x.role);
    b.runs += x.n;
    if (x.last > b.last) b.last = x.last;
    b.statuses[x.status] = (b.statuses[x.status] ?? 0) + x.n;
    baselines.set(x.baseline, b);
  }

  const probes = (await db.query<{ body: Json }>(
    "select body from runtime_probes where body->>'outcome' = 'pass' order by body->>'observed_at' desc")).rows.map((r) => r.body);
  const versions: Json[] = [];
  for (const p of probes) {
    if (versions.some((v) => v.runtime === p.runtime && v.digest.value === p.artifact_digest.value)) continue;
    versions.push({
      runtime: p.runtime, version: p.version, digest: p.artifact_digest, last_passed_at: p.observed_at,
      pinned_for: active.filter((x) => x.runtime === p.runtime && x.artifact_digest.value === p.artifact_digest.value).map((x) => x.role).sort(),
    });
  }

  const policies = (await db.query<{ body: Json; digest: string }>(
    "select distinct on (body->>'id') body, digest from sandbox_policies order by body->>'id', (body->>'version')::int desc")).rows
    .map((r) => ({ ...r.body, digest: r.digest }));
  const launched = (await db.query<{ runtime: string; sandbox: string | null; run_id: string; at: string }>(
    `select distinct on (body->'runtime'->>'provider') body->'runtime'->>'provider' as runtime, body->'trace'->>'sandbox' as sandbox, id as run_id,
            coalesce(body->>'finished_at', created_at::text) as at
       from runs where body ? 'trace' and body->'runtime'->>'provider' is not null
      order by body->'runtime'->>'provider', created_at desc`)).rows;

  return {
    roles,
    baselines: [...baselines.values()].sort((a, b) => a.id.localeCompare(b.id)).map((b) => ({
      id: b.id, roles: [...b.roles].sort(), runs: b.runs, last_run_at: b.last.toISOString(), statuses: b.statuses,
    })),
    // Baselines are names the dispatcher assigns, not approved controlled items with revisions.
    baselines_recorded: false,
    versions,
    sandbox: {
      policies,
      launched: launched.map((l) => ({ runtime: l.runtime, sandbox: l.sandbox ?? "not reported", run_id: l.run_id, at: l.at })),
    },
  };
}
