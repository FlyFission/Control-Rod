import { api } from "../../api/client.js";
import type { StoryStep } from "./story.js";

/** One step of a run story: what the agent said, a tool call with its result, or a notice. */
export function StoryLine({ step }: { step: StoryStep }) {
  const mark = step.kind === "tool" ? (step.ok === false ? "✕" : step.ok === true ? "✓" : "…") : "";
  return (
    <li className={`story-step ${step.kind}${step.ok === false ? " failed" : ""}`}>
      {mark && (
        <span className="story-mark" aria-label={step.ok === false ? "failed" : step.ok === true ? "succeeded" : "no result reported"}>
          {mark}
        </span>
      )}
      <span className="story-text">{step.text}</span>
      {step.detail && <span className="muted small"> {step.detail}</span>}
    </li>
  );
}

/** Every event of a run, page by page (2,000 per page, up to the run's limit). */
export async function allRunEvents(packageId: string, runId: string) {
  const out: Awaited<ReturnType<typeof api.runEvents>>["events"] = [];
  let after = 0;
  for (let page = 0; page < 12; page++) {
    const { events } = await api.runEvents(packageId, runId, after);
    out.push(...events);
    if (events.length < 2000) break;
    after = events.at(-1)!.seq;
  }
  return out;
}
