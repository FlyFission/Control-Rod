import type { NormalizedEvent, Run } from "../../api/types.js";

/**
 * Run stories (specification 14 Ran; plan task 3.6): a run told as a readable sequence from the
 * daemon's normalized events, and the trace facts with honest flags: what the record shows and,
 * just as plainly, what it does not.
 */

/** One line of a story. A tool call and its result become a single step. */
export interface StoryStep {
  seq: number;
  kind: "said" | "tool" | "changed" | "asked" | "usage" | "problem" | "notice" | "dropped" | "ended";
  text: string;
  /** For a tool step: true succeeded, false failed, undefined still running or never reported. */
  ok?: boolean;
  detail?: string;
}

export function story(events: { seq: number; event: NormalizedEvent }[]): StoryStep[] {
  const steps: StoryStep[] = [];
  const open = new Map<string, StoryStep>();
  for (const { seq, event: e } of events) {
    switch (e.kind) {
      case "message":
        steps.push({ seq, kind: "said", text: e.text ?? "" });
        break;
      case "tool_start": {
        const step: StoryStep = { seq, kind: "tool", text: e.summary ?? e.tool ?? "tool call" };
        if (e.call_id) open.set(e.call_id, step);
        steps.push(step);
        break;
      }
      case "tool_end": {
        const step = e.call_id ? open.get(e.call_id) : undefined;
        if (step) {
          if (e.ok !== undefined) step.ok = e.ok;
          open.delete(e.call_id!);
        } else steps.push({ seq, kind: "tool", text: `${e.tool ?? "A tool call"} finished`, ...(e.ok !== undefined ? { ok: e.ok } : {}) });
        break;
      }
      case "file_change":
        steps.push({ seq, kind: "changed", text: `Changed ${e.path ?? "a file"}` });
        break;
      case "permission_request":
        steps.push({ seq, kind: "asked", text: `Asked permission: ${e.summary ?? e.tool ?? "a tool"}`, detail: "Print mode refuses it, so the run went on without it." });
        break;
      case "usage":
        steps.push({ seq, kind: "usage", text: `Used ${e.input_tokens ?? 0} input and ${e.output_tokens ?? 0} output tokens${e.cached_tokens ? ` (${e.cached_tokens} cached)` : ""}` });
        break;
      case "error":
        steps.push({ seq, kind: "problem", text: e.text ?? "An error" });
        break;
      case "notice":
        steps.push({ seq, kind: "notice", text: e.text ?? "" });
        break;
      case "dropped":
        steps.push({ seq, kind: "dropped", text: `${e.dropped ?? "Some"} events were not kept`, detail: "Admission or a storage limit refused them; the raw log has everything." });
        break;
      case "exit":
        steps.push({ seq, kind: "ended", text: e.text === "exited" ? "Ended" : `Ended: ${e.text ?? ""}` });
        break;
    }
  }
  return steps;
}

/** A fact about how the run ran, or a plain statement that the record cannot show it. */
export interface TraceFact {
  label: string;
  value: string;
  /** Set when the fact is a gap or a mismatch a reviewer should weigh. */
  flag?: string;
}

export function traceFacts(run: Run, opts: { attestationRequired: boolean }): TraceFact[] {
  const t = run.trace;
  const facts: TraceFact[] = [];
  if (t === undefined) {
    facts.push({ label: "Trace", value: "none", flag: run.status === "running" || run.status === "queued" ? "Recorded when the run completes." : "This run reported no execution trace." });
  } else {
    facts.push({
      label: "Runtime",
      value: `${t.tool.name}${t.tool.version ? ` ${t.tool.version}` : ""}`,
      ...(t.tool.version ? {} : { flag: "No version was recorded for the artifact that ran." }),
    });
    facts.push(t.tool.digest
      ? { label: "Artifact", value: `${t.tool.digest.algorithm}:${t.tool.digest.value.slice(0, 12)}` }
      : { label: "Artifact", value: "not identified", flag: "The executable that ran was not identified by digest." });
    const requested = t.requested_model ?? "default";
    const reported = t.reported_model;
    facts.push({ label: "Model asked for", value: requested });
    facts.push(reported === undefined
      ? { label: "Model reported", value: "not reported", flag: "The runtime did not say which model it used." }
      : requested !== "default" && reported !== requested
        ? { label: "Model reported", value: reported, flag: `Not the model asked for (${requested}).` }
        : { label: "Model reported", value: reported });
    facts.push(t.permission_mode !== undefined
      ? { label: "Permission mode", value: t.permission_mode }
      : { label: "Permission mode", value: "not recorded", flag: "The trace does not say which permission mode the runtime started in." });
    facts.push(t.allowed_tools !== undefined
      ? { label: "Tools allowed", value: t.allowed_tools.length ? t.allowed_tools.join(", ") : "none" }
      : { label: "Tools allowed", value: "not recorded", flag: "The trace does not list which tools the runtime was allowed." });
    facts.push(t.sandbox === undefined || t.sandbox === "none"
      ? { label: "Sandbox", value: t.sandbox ?? "not recorded", flag: "Agent actions were not confined by a sandbox." }
      : { label: "Sandbox", value: t.sandbox });
  }
  if (run.permission_waits === "not-observable")
    facts.push({ label: "Permission waits", value: "not observable", flag: "This runtime gives no signal when it needs permission; a refused action shows only as a failed tool call." });
  // Attestation of the sandbox arrives with the run sandbox (plan Phase 6); until then no run has it.
  facts.push({
    label: "Attestation",
    value: "none",
    flag: opts.attestationRequired
      ? "This tier requires attestation claims, and none exist yet: the run sandbox and its attestation are not built."
      : "No attestation claims: the run sandbox and its attestation are not built yet.",
  });
  return facts;
}
