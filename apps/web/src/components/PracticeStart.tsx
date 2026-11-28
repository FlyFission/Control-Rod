import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useContext } from "react";
import { type Api, api, explain } from "../api/client.js";
import { type Passkeys, browserPasskeys } from "../lib/decide.js";
import { startPractice } from "../lib/practice.js";
import { WorkspaceProjectUser, hydrateServerProjects, loadProjects, selectProject } from "../lib/projects.js";
import { useActionLock } from "../lib/scramLock.js";
import { sessionGeneration, stillCurrent } from "../lib/session.js";

/**
 * "Try a practice run": makes the practice project (once, signed with the passkey like any new
 * project), adds a practice card, opens that project and goes to the board, where the card moves
 * through every step on its own scripts. Used in Setup and in the first-run guide.
 */
export function PracticeStart({
  primary = false,
  passkeys = browserPasskeys,
  client = api,
}: {
  primary?: boolean;
  passkeys?: Passkeys;
  client?: Api;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useContext(WorkspaceProjectUser);
  const lock = useActionLock(null);
  const start = useMutation({
    mutationFn: async (startedUnder: number) => {
      const made = await startPractice(passkeys, client);
      return stillCurrent(startedUnder) ? made : undefined;
    },
    onSuccess: async (made, startedUnder) => {
      if (!made || !stillCurrent(startedUnder)) return;
      const fresh = await client.workspaceProjects().catch(() => loadProjects(user));
      if (!stillCurrent(startedUnder)) return;
      hydrateServerProjects(user, fresh.some((p) => p.id === made.project.id) ? fresh : [...fresh, made.project]);
      selectProject(user, made.project.id);
      void qc.invalidateQueries({ queryKey: ["workspace-projects", user] });
      void qc.invalidateQueries({ queryKey: ["captures"] });
      void navigate({ to: "/" });
    },
  });
  return (
    <div className="practice-start">
      <button
        type="button"
        className={primary ? "btn primary" : "btn"}
        disabled={start.isPending || lock.locked}
        title={lock.why}
        onClick={() => start.mutate(sessionGeneration())}
      >
        {start.isPending ? "Starting the practice run" : "Try a practice run"}
      </button>
      {start.error && (
        <p role="alert" className="error small">
          {explain(start.error, "Could not start the practice run.")}
        </p>
      )}
    </div>
  );
}
