/**
 * What a run's trace says about which model answered (pattern AO-16, ADR 0024). A seat that fell back
 * to another model is flagged in words, never hidden behind the requested name. Only the trace's own
 * fields are used; nothing is inferred from the runtime's provider.
 */
export type ModelRouting =
  | { kind: "none" }
  | { kind: "same"; text: string }
  | { kind: "rerouted"; text: string }
  | { kind: "unreported"; text: string };

export function modelRouting(trace: { requested_model?: string; reported_model?: string } | undefined, finished: boolean): ModelRouting {
  const asked = trace?.requested_model?.trim() ?? "";
  // "default" means the run left the choice to the runtime, so whatever answered is not a fallback.
  const requested = asked === "default" ? "" : asked;
  const reported = trace?.reported_model?.trim() ?? "";
  if (reported && requested && reported !== requested) return { kind: "rerouted", text: `Answered by ${reported} (requested ${requested})` };
  if (reported) return { kind: "same", text: `Model ${reported}` };
  // While a run is going the CLI may not have said yet; only a finished run is "not reported".
  if (requested && finished) return { kind: "unreported", text: `Model not reported (requested ${requested})` };
  if (requested) return { kind: "same", text: `Requested ${requested}` };
  if (asked === "default" && finished) return { kind: "unreported", text: "Model not reported (runtime default)" };
  return { kind: "none" };
}
