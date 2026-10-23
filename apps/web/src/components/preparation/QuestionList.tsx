import { useState } from "react";
import type { PreparationContent, ResolutionRequest } from "../../api/types.js";
import { Text, Line, itemId } from "./fields.js";
export function QuestionList({
  value,
  change,
  resolve,
  dirty,
}: {
  value: PreparationContent;
  change: (fn: (draft: PreparationContent) => void) => void;
  resolve: (r: ResolutionRequest) => void;
  dirty: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return (
    <section aria-label="Questions and resolutions">
      <h3>Questions, assumptions and conflicts</h3>
      {value.questions.map((q, i) => (
        <div className="prep-item" key={q.id}>
          <p>
            {q.state} · {q.kind} · {q.owner}
          </p>
          {q.state === "open" ? (
            <>
              <Text
                label={`Question ${i + 1}`}
                value={q.text}
                change={(v) =>
                  change((d) => {
                    d.questions[i]!.text = v;
                  })
                }
              />
              <Line
                label={`Question ${i + 1} owner`}
                value={q.owner}
                change={(v) =>
                  change((d) => {
                    d.questions[i]!.owner = v;
                  })
                }
              />
              <label>
                <input
                  type="checkbox"
                  checked={q.blocking}
                  onChange={(e) =>
                    change((d) => {
                      d.questions[i]!.blocking = e.target.checked;
                    })
                  }
                />
                Blocks preparation
              </label>
            </>
          ) : (
            <p>{q.text}</p>
          )}
          {q.state === "open" && (
            <>
              <Text
                label={`Answer and rationale for question ${i + 1}`}
                value={answers[q.id] ?? ""}
                change={(v) => setAnswers({ ...answers, [q.id]: v })}
              />
              <button
                type="button"
                className="btn ghost small"
                disabled={dirty || !answers[q.id]?.trim()}
                onClick={() =>
                  resolve({
                    item_id: q.id,
                    rationale: answers[q.id]!,
                    source_refs: [],
                  })
                }
              >
                Record answer {i + 1}
              </button>
            </>
          )}
          {q.resolution_refs.map((ref) => {
            const r = value.resolutions.find((v) => v.id === ref);
            return r ? (
              <p key={ref}>
                {r.actor.id}: {r.rationale}
              </p>
            ) : null;
          })}
        </div>
      ))}
      <button
        type="button"
        className="btn ghost small"
        onClick={() =>
          change((d) => {
            d.questions.push({
              id: itemId("Q"),
              kind: "question",
              text: "",
              owner: "owner",
              blocking: true,
              state: "open",
              resolution_refs: [],
            });
          })
        }
      >
        Add question
      </button>
      <h3>Feasibility escalations</h3>
      {value.escalations.map((e, i) => (
        <div className="prep-item" key={e.id}>
          <p>
            {e.owner}: {e.reason}
          </p>
          <p>Alternatives: {e.alternatives.join("; ")}</p>
          {!e.resolution_refs.length && (
            <>
              <Text
                label={`Resolution for escalation ${i + 1}`}
                value={answers[e.id] ?? ""}
                change={(v) => setAnswers({ ...answers, [e.id]: v })}
              />
              <button
                type="button"
                className="btn ghost small"
                disabled={dirty || !answers[e.id]?.trim()}
                onClick={() =>
                  resolve({
                    item_id: e.id,
                    rationale: answers[e.id]!,
                    source_refs: [],
                  })
                }
              >
                Resolve escalation {i + 1}
              </button>
            </>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn ghost small"
        onClick={() =>
          change((d) => {
            d.escalations.push({
              id: itemId("ESC"),
              criterion_ids: [],
              reason: "",
              alternatives: [],
              owner: "owner",
              resolution_refs: [],
            });
          })
        }
      >
        Raise feasibility escalation
      </button>
      {value.escalations.map(
        (e, i) =>
          !e.resolution_refs.length && (
            <div className="prep-item" key={e.id}>
              <Text
                label={`Escalation ${i + 1} reason`}
                value={e.reason}
                change={(v) =>
                  change((d) => {
                    d.escalations[i]!.reason = v;
                  })
                }
              />
              <Text
                label={`Escalation ${i + 1} alternatives (one per line)`}
                value={e.alternatives.join("\n")}
                change={(v) =>
                  change((d) => {
                    d.escalations[i]!.alternatives = v.split("\n");
                  })
                }
              />
              <Line
                label={`Escalation ${i + 1} owner`}
                value={e.owner}
                change={(v) =>
                  change((d) => {
                    d.escalations[i]!.owner = v;
                  })
                }
              />
              <fieldset>
                <legend>Criteria affected by escalation {i + 1}</legend>
                {value.criteria.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={e.criterion_ids.includes(c.id)}
                      onChange={(event) =>
                        change((d) => {
                          d.escalations[i]!.criterion_ids = event.target.checked
                            ? [...e.criterion_ids, c.id]
                            : e.criterion_ids.filter((id) => id !== c.id);
                        })
                      }
                    />
                    {c.statement || c.id}
                  </label>
                ))}
              </fieldset>
            </div>
          ),
      )}
      {dirty && (
        <p className="muted small">
          Save the preparation before recording an answer against its revision.
        </p>
      )}
    </section>
  );
}
