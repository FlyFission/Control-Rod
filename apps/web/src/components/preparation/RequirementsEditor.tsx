import type { PreparationContent } from "../../api/types.js";
import { Text, Line, Select, itemId } from "./fields.js";
export function RequirementsEditor({
  value,
  change,
}: {
  value: PreparationContent;
  change: (fn: (draft: PreparationContent) => void) => void;
}) {
  return (
    <section aria-label="Requirements and criteria">
      <h3>Requirements</h3>
      <Text
        label="Objective"
        value={value.package_contract.objective}
        change={(v) =>
          change((d) => {
            d.package_contract.objective = v;
          })
        }
      />
      {value.requirements.map((r, i) => (
        <div className="prep-item" key={r.id}>
          <p className="mono small">{r.id}</p>
          <Text
            label={`Requirement ${i + 1}`}
            value={r.statement}
            change={(v) =>
              change((d) => {
                d.requirements[i]!.statement = v;
              })
            }
          />
          <Select
            label={`Requirement ${i + 1} source`}
            value={r.source_refs[0] ?? ""}
            change={(v) =>
              change((d) => {
                d.requirements[i]!.source_refs = v ? [v] : [];
              })
            }
          >
            <option value="">Choose controlled source</option>
            {value.basis.map((b) => (
              <option key={b.reference}>{b.reference}</option>
            ))}
          </Select>
          <button
            type="button"
            className="btn ghost small"
            onClick={() =>
              change((d) => {
                d.requirements.splice(i, 1);
              })
            }
          >
            Retire requirement {i + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost small"
        onClick={() =>
          change((d) => {
            d.requirements.push({
              id: itemId("REQ"),
              statement: "",
              source_refs: d.basis[0] ? [d.basis[0].reference] : [],
              journey_or_repro_refs: [],
            });
          })
        }
      >
        Add requirement
      </button>
      <h3>Acceptance criteria</h3>
      {value.criteria.map((c, i) => (
        <div className="prep-item" key={c.id}>
          <p className="mono small">{c.id}</p>
          <Text
            label={`Criterion ${i + 1}`}
            value={c.statement}
            change={(v) =>
              change((d) => {
                d.criteria[i]!.statement = v;
              })
            }
          />
          <fieldset>
            <legend>Requirements covered by criterion {i + 1}</legend>
            {value.requirements.map((r) => (
              <label key={r.id}>
                <input
                  type="checkbox"
                  checked={c.requirement_ids.includes(r.id)}
                  onChange={(e) =>
                    change((d) => {
                      d.criteria[i]!.requirement_ids = e.target.checked
                        ? [...c.requirement_ids, r.id]
                        : c.requirement_ids.filter((id) => id !== r.id);
                    })
                  }
                />
                {r.statement || r.id}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="btn ghost small"
            onClick={() =>
              change((d) => {
                d.criteria.splice(i, 1);
              })
            }
          >
            Retire criterion {i + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost small"
        onClick={() =>
          change((d) => {
            d.criteria.push({
              id: itemId("AC"),
              statement: "",
              requirement_ids: [],
              verification_check_ids: [],
            });
          })
        }
      >
        Add criterion
      </button>
      <h3>Deliverables</h3>
      {value.package_contract.deliverables.map((deliverable, i) => (
        <div key={i}>
          <Line
            label={`Deliverable ${i + 1} identifier`}
            value={deliverable.id}
            change={(v) =>
              change((d) => {
                d.package_contract.deliverables[i]!.id = v;
              })
            }
          />
          <Text
            label={`Deliverable ${i + 1} description`}
            value={deliverable.type}
            change={(v) =>
              change((d) => {
                d.package_contract.deliverables[i]!.type = v;
              })
            }
          />
          <Line
            label={`Deliverable ${i + 1} formats`}
            value={deliverable.format?.join(", ") ?? ""}
            change={(v) =>
              change((d) => {
                d.package_contract.deliverables[i]!.format = v
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
              })
            }
          />
        </div>
      ))}
      <button
        type="button"
        className="btn ghost small"
        onClick={() =>
          change((d) => {
            d.package_contract.deliverables.push({
              id: itemId("D"),
              type: "",
              format: [],
            });
          })
        }
      >
        Add deliverable
      </button>
    </section>
  );
}
