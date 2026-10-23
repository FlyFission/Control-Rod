import type { PreparationContent } from "../../api/types.js";
import { Text, Line, itemId, lines } from "./fields.js";
export function TechnicalPlanEditor({
  value,
  change,
}: {
  value: PreparationContent;
  change: (fn: (draft: PreparationContent) => void) => void;
}) {
  const p = value.technical_plan;
  return (
    <section aria-label="Technical preparation">
      <h3>Technical plan</h3>
      <Text
        label="Approach summary"
        value={p.summary}
        change={(v) =>
          change((d) => {
            d.technical_plan.summary = v;
          })
        }
      />
      <Text
        label="Alternatives considered (one per line)"
        value={p.alternatives.join("\n")}
        change={(v) =>
          change((d) => {
            d.technical_plan.alternatives = v.split("\n");
          })
        }
      />
      {p.design_elements.map((el, i) => (
        <Text
          key={el.id}
          label={`Design element ${i + 1}`}
          value={el.description}
          change={(v) =>
            change((d) => {
              d.technical_plan.design_elements[i]!.description = v;
            })
          }
        />
      ))}
      <button
        type="button"
        className="btn ghost small"
        onClick={() =>
          change((d) => {
            d.technical_plan.design_elements.push({
              id: itemId("DES"),
              description: "",
            });
          })
        }
      >
        Add design element
      </button>
      {p.tasks.map((t, i) => (
        <div className="prep-item" key={t.id}>
          <p className="mono small">{t.id}</p>
          <Text
            label={`Task ${i + 1}`}
            value={t.description}
            change={(v) =>
              change((d) => {
                d.technical_plan.tasks[i]!.description = v;
              })
            }
          />
          <fieldset>
            <legend>Design elements for task {i + 1}</legend>
            {p.design_elements.map((el) => (
              <label key={el.id}>
                <input
                  type="checkbox"
                  checked={t.design_element_ids.includes(el.id)}
                  onChange={(e) =>
                    change((d) => {
                      d.technical_plan.tasks[i]!.design_element_ids = e.target
                        .checked
                        ? [...t.design_element_ids, el.id]
                        : t.design_element_ids.filter((id) => id !== el.id);
                    })
                  }
                />
                {el.description || el.id}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Tasks that must finish before task {i + 1}</legend>
            {p.tasks
              .filter((v) => v.id !== t.id)
              .map((other) => (
                <label key={other.id}>
                  <input
                    type="checkbox"
                    checked={t.depends_on.includes(other.id)}
                    onChange={(e) =>
                      change((d) => {
                        d.technical_plan.tasks[i]!.depends_on = e.target.checked
                          ? [...t.depends_on, other.id]
                          : t.depends_on.filter((id) => id !== other.id);
                      })
                    }
                  />
                  {other.description || other.id}
                </label>
              ))}
          </fieldset>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost small"
        onClick={() =>
          change((d) => {
            d.technical_plan.tasks.push({
              id: itemId("TASK"),
              description: "",
              design_element_ids: [],
              depends_on: [],
            });
          })
        }
      >
        Add task
      </button>
      <h3>Verification coverage</h3>
      <p className="muted small">
        Mapping a check records intent. Results are recorded only when
        verification runs.
      </p>
      {p.checks.map((c, i) => (
        <div className="prep-item" key={c.id}>
          <Line
            label={`Check ${i + 1} method`}
            value={c.method}
            change={(v) =>
              change((d) => {
                d.technical_plan.checks[i]!.method = v;
              })
            }
          />
          <Text
            label={`Check ${i + 1} expected result`}
            value={c.expected_result}
            change={(v) =>
              change((d) => {
                d.technical_plan.checks[i]!.expected_result = v;
              })
            }
          />
          <label>
            <input
              type="checkbox"
              checked={c.required}
              onChange={(e) =>
                change((d) => {
                  d.technical_plan.checks[i]!.required = e.target.checked;
                })
              }
            />
            Required check {i + 1}
          </label>
          <fieldset>
            <legend>Criteria verified by check {i + 1}</legend>
            {value.criteria.map((criterion) => (
              <label key={criterion.id}>
                <input
                  type="checkbox"
                  checked={c.criterion_ids.includes(criterion.id)}
                  onChange={(e) =>
                    change((d) => {
                      d.technical_plan.checks[i]!.criterion_ids = e.target
                        .checked
                        ? [...c.criterion_ids, criterion.id]
                        : c.criterion_ids.filter((id) => id !== criterion.id);
                      const target = d.criteria.find(
                        (v) => v.id === criterion.id,
                      )!;
                      target.verification_check_ids = e.target.checked
                        ? [
                            ...target.verification_check_ids.filter(
                              (id) => id !== c.id,
                            ),
                            c.id,
                          ]
                        : target.verification_check_ids.filter(
                            (id) => id !== c.id,
                          );
                    })
                  }
                />
                {criterion.statement || criterion.id}
              </label>
            ))}
          </fieldset>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost small"
        onClick={() =>
          change((d) => {
            d.technical_plan.checks.push({
              id: itemId("CHECK"),
              criterion_ids: [],
              method: "",
              required: true,
              expected_result: "",
            });
          })
        }
      >
        Add verification check
      </button>
      <Text
        label="Rollout and recovery"
        value={p.rollout}
        change={(v) =>
          change((d) => {
            d.technical_plan.rollout = v;
          })
        }
      />
      <Text
        label="Risks and holds (one per line)"
        value={p.risks.join("\n")}
        change={(v) =>
          change((d) => {
            d.technical_plan.risks = v.split("\n");
          })
        }
      />
      <Text
        label="Controlled current-state sources (one reference per line)"
        value={p.current_state_refs.join("\n")}
        change={(v) =>
          change((d) => {
            d.technical_plan.current_state_refs = lines(v);
          })
        }
      />
    </section>
  );
}
