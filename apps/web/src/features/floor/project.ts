import type { Run, WorkPackage } from "../../api/types.js";
import type {
  FloorInput,
  FloorModel,
  FloorEntity,
  StationId,
  ActionId,
} from "./types.js";
import type { StateKind } from "../../components/StateMark.js";
import { selectPackagePage } from "./paging.js";
export function variantForRun(id: string): number {
  let h = 2166136261;
  for (const c of new TextEncoder().encode(id)) {
    h = Math.imul(h ^ c, 16777619) >>> 0;
  }
  return h % 6;
}
function stationFor(p: WorkPackage, r: Run): StationId {
  if (r.role === "pre-check") return "verify";
  if (r.role === "intake" || r.role === "requirements-preparer")
    return "general";
  return p.mode === "capital-projects" ||
    p.agent_assignment.some((a) => a.role.startsWith("site"))
    ? "site"
    : "general";
}
function runEntity(p: WorkPackage, r: Run, conflict = false): FloorEntity {
  let label = "Status unavailable",
    action: ActionId = "idle",
    mark: StateKind = "idle",
    rank = 8,
    station = stationFor(p, r);
  const knownRole = [
    "intake",
    "author",
    "pre-check",
    "requirements-preparer",
    "technical-preparer",
  ].includes(r.role);
  if (!conflict && knownRole)
    switch (r.status) {
      case "queued":
        label = r.waiting_reason ? "Waiting" : "Queued";
        action = r.waiting_reason ? "attention" : "wait";
        mark = "waiting";
        rank = 6;
        station = "bench";
        break;
      case "running":
        label = r.stop_requested_at
          ? "Stopping"
          : r.role === "pre-check"
            ? "Pre-checking"
            : "Working";
        action = r.stop_requested_at
          ? "wait"
          : r.role === "pre-check"
            ? "inspect"
            : "work";
        mark = r.stop_requested_at ? "waiting" : "working";
        rank = r.stop_requested_at ? 4 : 5;
        break;
      case "succeeded":
        label =
          r.role === "pre-check" ? "Pre-check run finished" : "Run finished";
        action = "submitted";
        rank = 7;
        break;
      case "failed":
        label = "Failed";
        action = "error";
        mark = "stuck";
        rank = 3;
        break;
      case "lost":
        label = "Lost run";
        action = "error";
        mark = "stuck";
        rank = 0;
        break;
      case "stopped":
        label = "Stopped";
        station = "bench";
        rank = 7;
        break;
    }
  if (label === "Status unavailable") station = "bench";
  return {
    id: `run:${r.id}`,
    kind: "run",
    packageId: p.id,
    revision: p.revision,
    runId: r.id,
    role: r.role,
    sourceState: conflict ? "unknown" : r.status,
    label,
    detail: conflict
      ? "Conflicting records for this run"
      : label === "Status unavailable"
        ? `Unrecognized status or role: ${r.status} / ${r.role}`
        : (r.waiting_reason ?? r.error ?? r.label ?? ""),
    station,
    action,
    mark,
    attentionRank: rank,
    ...(label === "Status unavailable" ? {} : { variant: variantForRun(r.id) }),
  };
}
const time = (r: Run) =>
  Date.parse(r.finished_at ?? r.started_at ?? r.queued_at) || 0;
const later = (a: Run, b: Run) =>
  time(a) > time(b) || (time(a) === time(b) && a.id > b.id);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function projectFloor(input: FloorInput): FloorModel {
  const selected = selectPackagePage(input.packages, input.page);
  const entities: FloorEntity[] = [],
    revisionConflicts: string[] = [],
    warnings: string[] = [];
  for (const p of selected.items) {
    const v = input.views.get(p.id);
    if (!v) continue;
    if (
      v.package.id !== p.id ||
      v.package.revision !== p.revision ||
      v.package.status !== p.status
    ) {
      revisionConflicts.push(p.id);
      continue;
    }
    const unique = new Map<string, Run>(),
      conflicts = new Set<string>();
    for (const r of v.runs) {
      if (r.package_id !== p.id || r.package_revision !== p.revision) continue;
      const prev = unique.get(r.id);
      if (prev && canonical(prev) !== canonical(r)) conflicts.add(r.id);
      else unique.set(r.id, r);
    }
    const terminals = new Map<string, Run>();
    for (const r of unique.values()) {
      if (
        r.status === "queued" ||
        r.status === "running" ||
        !["succeeded", "failed", "stopped", "lost"].includes(r.status) ||
        ![
          "intake",
          "author",
          "pre-check",
          "requirements-preparer",
          "technical-preparer",
        ].includes(r.role) ||
        conflicts.has(r.id)
      )
        entities.push(runEntity(p, r, conflicts.has(r.id)));
      else {
        const prev = terminals.get(r.role);
        if (!prev || later(r, prev)) terminals.set(r.role, r);
      }
    }
    for (const r of terminals.values()) entities.push(runEntity(p, r));
    for (const id of conflicts) warnings.push(`Conflicting records: ${id}`);
    for (const o of input.office.filter(
      (o) => o.package_id === p.id && o.package_revision === p.revision,
    )) {
      const labels: Record<string, string> = {
        permission: "Needs permission",
        lost: "Lost run",
        dispute: "Dispute",
        accept: "Awaiting human review",
        release: "Awaiting release",
      };
      entities.push({
        id: `office:${o.kind}:${p.id}:${p.revision}`,
        kind: "request",
        packageId: p.id,
        revision: p.revision,
        role: o.kind,
        sourceState: o.kind,
        label: labels[o.kind] ?? "Needs you",
        detail: `${o.title}: ${o.detail}`,
        station: "office",
        action: "attention",
        mark: "needs",
        attentionRank:
          o.kind === "lost" || o.kind === "dispute"
            ? 0
            : o.kind === "permission"
              ? 1
              : 2,
      });
    }
    if (p.status === "accepted" || p.status === "closed") {
      const findings =
        p.status === "accepted" &&
        v.decisions.some(
          (d) =>
            d.package_id === p.id &&
            d.package_revision === p.revision &&
            d.kind === "accept-with-findings",
        );
      entities.push({
        id: `package:${p.id}:${p.revision}`,
        kind: "package",
        packageId: p.id,
        revision: p.revision,
        sourceState: p.status,
        label:
          p.status === "closed"
            ? "Closed"
            : findings
              ? "Accepted with findings"
              : "Accepted",
        detail: p.title,
        station: "archive",
        action: "idle",
        mark: p.status === "accepted" ? "done" : "idle",
        attentionRank: 9,
      });
    }
    if (
      v.pre_check &&
      v.pre_check.package_revision === p.revision &&
      v.pre_check.package_id === p.id
    ) {
      const outcomes: Record<string, string> = {
        pass: "Pre-check passed",
        fail: "Pre-check failed",
        inconclusive: "Pre-check inconclusive",
      };
      const summary = outcomes[v.pre_check.outcome];
      if (summary) warnings.push(`${p.id}: ${summary}`);
    }
  }
  const owners = new Map<string, Set<string>>();
  for (const e of entities)
    if (e.kind === "run" && e.runId) {
      const set = owners.get(e.runId) ?? new Set<string>();
      set.add(`${e.packageId}:${e.revision}`);
      owners.set(e.runId, set);
    }
  for (const [runId, set] of owners)
    if (set.size > 1) {
      const detail = `Conflicting run ID ${runId} across ${[...set].sort().join(", ")}. Open the source package for details.`;
      warnings.push(detail);
      for (const e of entities)
        if (e.runId === runId) {
          e.id = `conflict:${e.packageId}:${e.revision}:${e.id}`;
          e.sourceState = "unknown";
          e.label = "Status unavailable";
          e.detail = detail;
          e.action = "idle";
          e.mark = "idle";
          e.station = "bench";
          e.attentionRank = 0;
          delete e.variant;
        }
    }
  const dedup = new Map(entities.map((e) => [e.id, e]));
  return {
    entities: [...dedup.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
    selectedPackages: selected.items,
    matchingPackageCount: selected.total,
    revisionConflicts,
    warnings,
  };
}
