import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../../api/client.js";
import type { PackageView, WorkPackage } from "../../api/types.js";
import { sessionGeneration } from "../../lib/session.js";
import { WORKFLOWS, WORKFLOW_DESCRIPTION, WORKFLOW_LABEL, type Workflow, resolveWorkflow } from "../../lib/workflow.js";

interface WorkflowSwitchProps {
  pkg: WorkPackage;
  /** The full package view; without it (still loading) the switch shows the value but cannot save. */
  view?: PackageView | undefined;
  projectDefault?: Workflow | undefined;
}

/**
 * "Workflow" select for one package. Saves through the draft edit (If-Match), so only a draft
 * outside guided preparation can change. Independent of the context profile, never locked by grade.
 */
export function WorkflowSwitch({ pkg, view, projectDefault }: WorkflowSwitchProps) {
  const qc = useQueryClient();
  const wf = resolveWorkflow(pkg, projectDefault);
  const save = useMutation({
    // An empty choice clears the card's own value, so the package follows its project's default again.
    mutationFn: (workflow: Workflow | "") => {
      const { workflow: _own, ...rest } = view!.package;
      return api.updatePackage(workflow ? { ...rest, workflow } : rest, view!.draft_etag!);
    },
    onMutate: () => ({ startedUnder: sessionGeneration() }),
    onSuccess: ({ data, etag }, _workflow, context) => {
      if (context?.startedUnder !== sessionGeneration()) return;
      qc.setQueryData<PackageView>(["package", pkg.id], (old) => (old ? { ...old, package: data, ...(etag ? { draft_etag: etag } : {}) } : old));
      void qc.invalidateQueries({ queryKey: ["package", pkg.id] });
      void qc.invalidateQueries({ queryKey: ["packages"] });
    },
  });
  // A draft in guided preparation refuses the plain draft edit (preparation-edit-required), and
  // the preparation contract does not carry the workflow, so the switch stays read-only there.
  const preparing = view?.preparation_enrolled === true;
  const editable = view !== undefined && view.package.status === "draft" && view.draft_etag !== undefined && !preparing;
  const disabled = !editable || save.isPending;
  const note = view && !editable
    ? preparing && view.package.status === "draft" ? "Not editable during guided preparation" : "Only a draft's workflow can change"
    : undefined;
  const noteId = `bd-wf-note-${pkg.id}`;
  const selectId = `bd-wf-select-${pkg.id}`;
  const descId = `bd-wf-desc-${pkg.id}`;

  return (
    <div className="bd-ctx bd-wf">
      <div className="bd-ctx-row">
        <label htmlFor={selectId} className="bd-ctx-label small">
          Workflow
        </label>
        <select
          id={selectId}
          className="bd-wf-select"
          value={pkg.workflow ?? ""}
          disabled={disabled}
          aria-describedby={note ? `${descId} ${noteId}` : descId}
          onChange={(e) => {
            const next = e.target.value as Workflow | "";
            if (next !== (pkg.workflow ?? "")) save.mutate(next);
          }}
        >
          <option value="">Project default ({WORKFLOW_LABEL[projectDefault ?? "playbook"]})</option>
          {WORKFLOWS.map((w) => (
            <option key={w} value={w}>
              {WORKFLOW_LABEL[w]}
            </option>
          ))}
        </select>
      </div>
      <p id={descId} className="small muted bd-ctx-note">
        {WORKFLOW_DESCRIPTION[wf.workflow]}
        {wf.reason ? ` ${wf.reason}.` : ""}
      </p>
      {note && (
        <p id={noteId} className="small muted bd-ctx-note">
          {note}
        </p>
      )}
      {save.isError && (
        <p role="alert" className="small error">
          {explain(save.error, "Could not change the workflow.")}
        </p>
      )}
    </div>
  );
}
