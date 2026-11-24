import { Link } from "@tanstack/react-router";
import { WorkflowDiagram } from "../components/WorkflowDiagram.js";
import { CHECK_IN_CHOICES } from "../lib/agents.js";
import { buildCouncilFlow } from "../lib/councilFlow.js";
import { useActiveProject } from "../lib/projects.js";
import { useAgents } from "../lib/useAgents.js";

/**
 * Your workflow: the council and the path a card takes, drawn as a block flow diagram or read as a
 * decision matrix. It changes when you change seats or check-ins on Setup or the Agents roster.
 */
export function Workflow() {
  const agents = useAgents();
  const project = useActiveProject();
  const checkIn = agents.setup?.check_in ?? "start-and-merge";
  const choice = CHECK_IN_CHOICES.find((c) => c.id === checkIn)!;
  const flow = buildCouncilFlow(agents.rows, checkIn);
  return (
    <div className="place workflow">
      <header className="place-head">
        <h1>Your workflow</h1>
        <p className="muted">
          Who plans, who writes, who checks, and where a card stops for you. Check-ins: {choice.label.toLowerCase()}
          {project ? `. Project: ${project.name}` : ""}. Change seats and check-ins on <Link to="/setup">Setup</Link>.
        </p>
      </header>
      {agents.error && (
        <p role="alert" className="error">
          The agent checks could not be loaded. Is Control Rod still running?
        </p>
      )}
      {agents.loading ? <p className="muted">Looking for agents</p> : (
        <section className="panel" aria-label="Workflow">
          <WorkflowDiagram flow={flow} />
          <p className="muted small wf-note">
            A preview of what Control Rod does today for a card with no preferred agents. A project or card that names a preferred author or
            checker, and a card's lane, pins and sandbox, can change who takes a job. Product names and
            logos belong to their owners; Control Rod is not affiliated with them.
          </p>
        </section>
      )}
    </div>
  );
}
