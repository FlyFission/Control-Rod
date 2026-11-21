import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../../api/client.js";
import type { PackageView, WorkPackage } from "../../api/types.js";
import { type ContextProfile, type ContextResolution, resolveContextProfile } from "../../lib/context-profile.js";
import { sessionGeneration } from "../../lib/session.js";

const OPTIONS: { id: ContextProfile; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "nuclear", label: "Nuclear" },
];

interface ContextSwitchProps {
  pkg: WorkPackage;
  /** The full package view; without it (still loading) the switch shows the value but cannot save. */
  view?: PackageView | undefined;
  projectDefault?: ContextProfile | undefined;
  /** The server's resolution, when it sends one; it wins over the display mirror. */
  server?: ContextResolution | undefined;
}

/**
 * "Context: Light / Nuclear" for one package. Saves through the draft edit (If-Match), so only a
 * draft can change; Safety and Material grades show locked Nuclear with the reason.
 */
export function ContextSwitch({ pkg, view, projectDefault, server }: ContextSwitchProps) {
  const qc = useQueryClient();
  const ctx = resolveContextProfile(pkg, projectDefault, server);
  const save = useMutation({
    mutationFn: (profile: ContextProfile) => api.updatePackage({ ...view!.package, context_profile: profile }, view!.draft_etag!),
    onMutate: () => ({ startedUnder: sessionGeneration() }),
    onSuccess: ({ data, etag }, _profile, context) => {
      if (context?.startedUnder !== sessionGeneration()) return;
      qc.setQueryData<PackageView>(["package", pkg.id], (old) => (old ? { ...old, package: data, ...(etag ? { draft_etag: etag } : {}) } : old));
      void qc.invalidateQueries({ queryKey: ["package", pkg.id] });
      void qc.invalidateQueries({ queryKey: ["packages"] });
    },
  });
  const editable = view !== undefined && view.package.status === "draft" && view.draft_etag !== undefined;
  const disabled = ctx.locked || !editable || save.isPending;
  const note = ctx.locked ? ctx.reason : view && !editable ? "Only a draft's context can change" : undefined;
  const noteId = `bd-ctx-note-${pkg.id}`;

  return (
    <div className="bd-ctx">
      <div role="group" aria-label="Context" className="bd-ctx-row" {...(note ? { "aria-describedby": noteId } : {})}>
        <span className="bd-ctx-label small">Context:</span>
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className="bd-ctx-btn"
            aria-pressed={ctx.profile === o.id}
            disabled={disabled}
            onClick={() => {
              if (ctx.profile !== o.id) save.mutate(o.id);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      {note && (
        <p id={noteId} className="small muted bd-ctx-note">
          {note}
        </p>
      )}
      {save.isError && (
        <p role="alert" className="small error">
          {explain(save.error, "Could not change the context.")}
        </p>
      )}
    </div>
  );
}
