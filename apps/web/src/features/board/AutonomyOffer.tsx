import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { explain } from "../../api/client.js";
import type { WorkspaceProject } from "../../api/types.js";
import { type Passkeys, browserPasskeys, signAdmin } from "../../lib/decide.js";
import { DEFAULT_SIGNING_PRESET } from "../../lib/signing.js";

/**
 * One line above the board for a project that has never chosen what needs a passkey (projects made
 * before signing settings existed, so every step asks for the passkey): turn on the default preset,
 * Balanced, with one passkey tap, or choose in Setup. It goes away once a choice is saved, or for
 * this session when dismissed.
 */
export function AutonomyOffer({ project, passkeys = browserPasskeys }: { project: WorkspaceProject; passkeys?: Passkeys }) {
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(false);
  const turnOn = useMutation({
    mutationFn: () => signAdmin("project.set-signing-policy", { project_id: project.id, preset: DEFAULT_SIGNING_PRESET }, passkeys),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspace-projects"] });
      for (const key of ["actions", "packages", "office", "inbox"]) void qc.invalidateQueries({ queryKey: [key] });
    },
  });
  if (hidden || project.signing !== undefined || project.mode === "nuclear-grade" || turnOn.isSuccess) return null;
  return (
    <div className="bd-autonomy-offer" role="region" aria-label="Let cards start on their own">
      <p className="small">
        <strong>Let routine cards start on their own?</strong> Cards would start as soon as the plan is drafted. You would still sign each accept with your passkey.
      </p>
      <button type="button" className="btn small primary" disabled={turnOn.isPending} onClick={() => turnOn.mutate()}>
        {turnOn.isPending ? "Waiting for your passkey" : "Turn on (one passkey tap)"}
      </button>
      <a className="small" href="/setup#signing">
        Choose in Setup
      </a>
      <button type="button" className="btn small ghost" onClick={() => setHidden(true)}>
        Not now
      </button>
      {turnOn.isError && (
        <p className="error small" role="alert">
          {explain(turnOn.error, "Nothing was changed.")}
        </p>
      )}
    </div>
  );
}
