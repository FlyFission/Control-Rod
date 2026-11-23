import type { WorkPackage } from "../api/types.js";

export type Workflow = NonNullable<WorkPackage["workflow"]>;

export const WORKFLOWS: readonly Workflow[] = ["playbook", "superpowers", "pocock", "pocock-superpowers"];

export const WORKFLOW_LABEL: Record<Workflow, string> = {
  playbook: "Playbook",
  superpowers: "Superpowers",
  pocock: "Pocock",
  "pocock-superpowers": "Pocock Superpowers",
};

export const WORKFLOW_DESCRIPTION: Record<Workflow, string> = {
  playbook: "The pack's own roles, no ported workflow.",
  superpowers: "Jesse Vincent's workflow: design, a plan of small tasks, test-first build, review per task.",
  pocock: "Matt Pocock's workflow: grill the idea, thin end-to-end tickets, test-first build, two-axis review.",
  "pocock-superpowers": "Matt Pocock's interview, tickets and review around Jesse Vincent's plan and build.",
};

/** Which workflow a package follows, and why. Never locked: grade does not constrain the workflow. */
export interface WorkflowResolution {
  workflow: Workflow;
  reason?: string;
}

/**
 * For display only; the server decides. Mirrors it: the card's own value, else the project
 * default, else Playbook. Independent of the context profile.
 */
export function resolveWorkflow(pkg: Pick<WorkPackage, "workflow">, projectDefault?: Workflow): WorkflowResolution {
  if (pkg.workflow) return { workflow: pkg.workflow, reason: `The card is set to ${WORKFLOW_LABEL[pkg.workflow]}` };
  if (projectDefault) return { workflow: projectDefault, reason: `The project default is ${WORKFLOW_LABEL[projectDefault]}` };
  return { workflow: "playbook" };
}

/** The default workflow of the project a package names, if one is set. Matched by id. */
export function projectWorkflowDefault(
  projects: readonly { id: string; default_workflow?: Workflow }[] | undefined,
  project: string,
): Workflow | undefined {
  return projects?.find((p) => p.id === project)?.default_workflow;
}
