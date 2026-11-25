import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { explain } from "../api/client.js";
import type { SigningSteps, WorkspaceProject } from "../api/types.js";
import { type Passkeys, browserPasskeys, signAdmin } from "../lib/decide.js";
import { MODE_LABEL, SIGNING_PRESETS, STEP_LABEL, STEP_MODES, type SigningPreset, type StepMode, presetOf } from "../lib/signing.js";

/**
 * "What needs your passkey" for one project: three presets and, under Advanced, each step on its
 * own. Saving is itself signed with the passkey, once. Nuclear-grade projects sign every step and
 * say so instead of offering a choice.
 */
export function SigningSettings({ project, passkeys = browserPasskeys }: { project: WorkspaceProject; passkeys?: Passkeys }) {
  const qc = useQueryClient();
  const saved = project.signing;
  const savedSteps: SigningSteps = saved?.steps ?? SIGNING_PRESETS[2]!.steps;
  const [steps, setSteps] = useState<SigningSteps>(saved?.steps ?? SIGNING_PRESETS[0]!.steps);
  const [done, setDone] = useState<string | null>(null);
  const chosen = presetOf(steps);
  const unchanged = saved !== undefined && (Object.keys(steps) as (keyof SigningSteps)[]).every((k) => steps[k] === savedSteps[k]);

  const save = useMutation({
    mutationFn: () =>
      signAdmin(
        "project.set-signing-policy",
        chosen === "custom" ? { project_id: project.id, steps } : { project_id: project.id, preset: chosen },
        passkeys,
      ),
    onSuccess: () => {
      setDone("Saved. New steps follow these settings now.");
      void qc.invalidateQueries({ queryKey: ["workspace-projects"] });
      for (const key of ["actions", "packages", "office", "inbox"]) void qc.invalidateQueries({ queryKey: [key] });
    },
  });

  if (project.mode === "nuclear-grade") {
    return (
      <p className="muted small">
        {project.name} is Nuclear-grade, so every release, accept, return and reject is signed with your passkey. That is fixed for this mode.
      </p>
    );
  }

  return (
    <div className="signing-settings">
      <div className="checkin-choices" role="radiogroup" aria-label={`What needs your passkey on ${project.name}`}>
        {SIGNING_PRESETS.map((p) => (
          <label key={p.id} className={`checkin-choice${chosen === p.id ? " chosen" : ""}`}>
            <input
              type="radio"
              name={`signing-${project.id}`}
              value={p.id}
              checked={chosen === p.id}
              disabled={save.isPending}
              onChange={() => {
                setDone(null);
                setSteps(p.steps);
              }}
            />
            <span>
              <strong>{p.label}</strong>
              {p.id === "light" && <span className="tag">Recommended</span>}
              {saved && presetOf(savedSteps) === p.id && <span className="tag">Current</span>}
              <span className="muted small block">{p.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <details className="signing-advanced">
        <summary className="small">Advanced: choose each step{chosen === "custom" ? " (custom now)" : ""}</summary>
        <table className="signing-steps small">
          <tbody>
            {(Object.keys(STEP_LABEL) as (keyof SigningSteps)[]).map((k) => (
              <tr key={k}>
                <th scope="row">{STEP_LABEL[k]}</th>
                <td>
                  <select
                    aria-label={STEP_LABEL[k]}
                    value={steps[k]}
                    disabled={save.isPending}
                    onChange={(e) => {
                      setDone(null);
                      setSteps({ ...steps, [k]: e.target.value as StepMode } as SigningSteps);
                    }}
                  >
                    {STEP_MODES[k].map((m) => (
                      <option key={m} value={m}>
                        {MODE_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">
          Safety and Material work, and anything on a proprietary or restricted lane, always asks for your passkey. Sending a card back or rejecting it
          always needs you.
        </p>
      </details>
      <div className="row">
        <button type="button" className="btn primary" disabled={save.isPending || unchanged} onClick={() => save.mutate()}>
          {save.isPending ? "Waiting for your passkey" : "Sign and save"}
        </button>
        {!saved && <span className="muted small">Until you save, every step on this project asks for your passkey.</span>}
        {saved && <span className="muted small">Saved as {saved.preset === "custom" ? "custom" : (SIGNING_PRESETS.find((p) => p.id === saved.preset)?.label ?? saved.preset)} by {saved.signed_by}.</span>}
      </div>
      {done && (
        <p className="small" role="status">
          {done}
        </p>
      )}
      {save.isError && (
        <p className="error" role="alert">
          {explain(save.error, "The settings were not saved.")}
        </p>
      )}
    </div>
  );
}

export type { SigningPreset };
