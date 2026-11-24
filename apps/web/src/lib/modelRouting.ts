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
  // A CLI reports the concrete model behind an alias it was asked for ("opus" -> "claude-opus-5-5").
  // Only a bare family word (letters only, no version) counts as an alias, and only when it is a
  // whole dash-separated part of the reported name: "gpt-5.4" answered by "gpt-5.4-mini" is a
  // different model and is flagged.
  if (reported && requested && reported !== requested) {
    if (isAliasOf(requested, reported)) return { kind: "same", text: `Model ${reported} (requested ${requested})` };
    return { kind: "rerouted", text: `Ran as ${reported} (requested ${requested})` };
  }
  if (reported) return { kind: "same", text: `Model ${reported}` };
  // While a run is going the CLI may not have said yet; only a finished run is "not reported".
  if (requested && finished) return { kind: "unreported", text: `Model not reported (requested ${requested})` };
  if (requested) return { kind: "same", text: `Requested ${requested}` };
  if (asked === "default" && finished) return { kind: "unreported", text: "Model not reported (runtime default)" };
  return { kind: "none" };
}

function isAliasOf(requested: string, reported: string): boolean {
  const alias = requested.toLowerCase();
  if (!/^[a-z]+$/.test(alias)) return false;
  return reported.toLowerCase().split(/[-_/.:]/).includes(alias);
}
