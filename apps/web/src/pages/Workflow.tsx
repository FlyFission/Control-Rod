import { Link } from "@tanstack/react-router";
import { WorkflowEditor } from "../components/WorkflowEditor.js";
import { CHECK_IN_CHOICES } from "../lib/agents.js";
import { useActiveProject } from "../lib/projects.js";
import { useAgents } from "../lib/useAgents.js";

/**
 * Your workflow: interactive swim-lane block flow editor, council diagram, and decision matrix.
 * Reads council seats from Setup / Agents roster as stage defaults and lets users override
 * per-skill agents, reorder stages, compose workflow presets with Light/Nuclear context depth,
 * and fork or import skill swim lanes.
 */
export function Workflow() {
  const agents = useAgents();
  const project = useActiveProject();
  const packageId =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("package") || undefined : undefined;
  const checkIn = agents.setup?.check_in ?? "start-and-merge";
  const choice = CHECK_IN_CHOICES.find((c) => c.id === checkIn)!;
  return (
    <div className="place workflow">
      <header className="place-head">
        <h1>Your workflow</h1>
        <p className="muted">
          Who plans, who writes, who checks, and where a card stops for you. Check-ins: {choice.label.toLowerCase()}
          {choice.today ? "" : " (saved for later; today the live stops are your signed release and your signed acceptance)"}
          {packageId ? `. Card: ${packageId}` : project ? `. Project: ${project.name}` : ""}. Change seats and check-ins on <Link to="/setup">Setup</Link>.
        </p>
      </header>
      {agents.error && (
        <p role="alert" className="error">
          The agent checks could not be loaded. Is Control Rod still running?
        </p>
      )}
      {agents.loading ? <p className="muted">Looking for agents</p> : (
        <section className="panel" aria-label="Workflow">
          <WorkflowEditor
            rows={agents.rows}
            initialCheckIn={checkIn}
            {...(packageId ? { packageId } : {})}
            {...(project ? { projectId: project.id, projectName: project.name } : {})}
          />
          <p className="muted small wf-note">
            Stage defaults follow your council seats from Setup. Per-skill overrides, blind-checker independence,
            and Nuclear-Grade digest checks are validated before saving. Product names and logos belong to their
            owners; Control Rod is not affiliated with them.
          </p>
        </section>
      )}
    </div>
  );
}
