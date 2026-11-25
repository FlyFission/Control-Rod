import { randomUUID } from "node:crypto";
import type { Db, Tx } from "./db/index.js";
import { highConsequence, needsOf } from "./authority.js";
import { laneOf } from "./markings.js";
import { Refusal } from "./refusal.js";
import { resolveWorkspaceMode } from "./workspace-projects.js";
import { captureTags } from "./workflow.js";

/**
 * The owner's signing policy for a project: which steps on its cards need a passkey of their own.
 * The owner chooses it in the project's settings and signs that choice once with a passkey; the
 * signed record lives on the project and every decision made under it carries a copy of it.
 *
 * - `auto`: Control Rod takes the step itself as soon as it can (release, and accept of a pass).
 * - `click`: the person presses the button; no passkey.
 * - `passkey`: the person presses the button and signs it, as before.
 *
 * A policy covers only routine work: not Nuclear-grade, not safety or other high-consequence
 * work, and only on the public or internal lanes. Everything else asks for a passkey every time,
 * whatever the policy says. No policy at all means every step is signed (the behaviour before
 * policies existed).
 */
export type StepMode = "auto" | "click" | "passkey";
export type SigningStep = "release" | "accept" | "return" | "reject";
export type Preset = "light" | "balanced" | "everything";

export const STEPS: readonly SigningStep[] = ["release", "accept", "return", "reject"];

/** Which modes each step may take. Only release and accept can happen without a person. */
const ALLOWED: Record<SigningStep, readonly StepMode[]> = {
  release: ["auto", "click", "passkey"],
  accept: ["auto", "click", "passkey"],
  return: ["click", "passkey"],
  reject: ["click", "passkey"],
};

export const PRESETS: Record<Preset, Record<SigningStep, StepMode>> = {
  light: { release: "auto", accept: "auto", return: "click", reject: "click" },
  balanced: { release: "auto", accept: "passkey", return: "click", reject: "click" },
  everything: { release: "passkey", accept: "passkey", return: "passkey", reject: "passkey" },
};

/** The preset new projects are offered first. */
export const DEFAULT_PRESET: Preset = "light";

export interface SigningPolicy {
  id: string;
  version: number;
  /** The preset the steps match, or "custom" when the owner changed a step by hand. */
  preset: Preset | "custom";
  steps: Record<SigningStep, StepMode>;
  signed_by: string;
  signed_at: string;
  /** The digest the owner's passkey signed: the command, the member and this exact choice. */
  subject_digest: string;
  challenge_nonce?: string;
  assertion: { credential_id: string; authenticator_data: string; client_data_json: string; signature: string };
}

const ROUTINE_LANES = new Set(["public", "internal"]);

/** Checks a requested set of steps, filling any left out from the preset, or from Everything. */
export function parseSteps(preset: unknown, steps: unknown): { preset: Preset | "custom"; steps: Record<SigningStep, StepMode> } {
  if (preset !== undefined && !(typeof preset === "string" && preset in PRESETS)) {
    throw new Refusal(400, "invalid", "The preset must be light, balanced or everything");
  }
  const base = PRESETS[(preset as Preset | undefined) ?? "everything"];
  const given = steps === undefined ? {} : steps;
  if (typeof given !== "object" || given === null || Array.isArray(given)) throw new Refusal(400, "invalid", "steps must map each step to auto, click or passkey");
  const out = { ...base };
  for (const [k, v] of Object.entries(given)) {
    if (!(STEPS as readonly string[]).includes(k)) throw new Refusal(400, "invalid", `Unknown step ${k}`);
    if (!ALLOWED[k as SigningStep].includes(v as StepMode)) {
      throw new Refusal(400, "invalid", `${k} may be ${ALLOWED[k as SigningStep].join(", ")}`);
    }
    out[k as SigningStep] = v as StepMode;
  }
  const named = (Object.keys(PRESETS) as Preset[]).find((p) => STEPS.every((s) => PRESETS[p][s] === out[s]));
  return { preset: named ?? "custom", steps: out };
}

export function newPolicyId(): string {
  return `SP-${randomUUID().slice(0, 8)}`;
}

/** The policy stored on a project body, or null when there is none or it is malformed. */
export function policyOf(projectBody: Record<string, unknown> | undefined): SigningPolicy | null {
  const p = projectBody?.signing_policy as SigningPolicy | undefined;
  if (!p || typeof p !== "object" || typeof p.id !== "string" || !p.assertion?.signature || !p.steps) return null;
  for (const s of STEPS) if (!ALLOWED[s].includes(p.steps[s])) return null;
  return p;
}

/** Whether a policy may cover this package at all: routine work on a low-risk lane. */
export async function routinePackage(q: Db | Tx, pkg: { id: string; body: Record<string, unknown> }, projectBody?: Record<string, unknown>): Promise<boolean> {
  // Intake stores a Nuclear-grade draft under the software mode with the nuclear context profile.
  if (pkg.body.mode === "nuclear-grade" || pkg.body.context_profile === "nuclear") return false;
  // The capture itself, which no draft edit changes, can also say Nuclear-grade.
  const origin = await captureOf(q, pkg.id);
  if ((captureTags(origin?.text) ?? []).some((t) => t.key === "mode" && t.value.toLowerCase() === "nuclear-grade")) return false;
  // ...and so can intake's own judgement, recorded on the package.drafted event.
  // A draft from before intake recorded that judgement (no nuclear key at all) is never covered.
  const drafted = (await q.query<{ nuclear: string | null }>("select body->'data'->>'nuclear' as nuclear from events where body->>'type' = 'package.drafted' and body->>'subject' = $1 order by seq limit 1", [pkg.id])).rows[0];
  if (!drafted || drafted.nuclear !== "false") return false;
  if (projectBody && resolveWorkspaceMode(projectBody) === "nuclear-grade") return false;
  if (highConsequence(needsOf(pkg.body as { grade?: unknown; discipline?: unknown }))) return false;
  const lane = await laneOf(q, "package", pkg.id, pkg.body.data_lane);
  return lane !== undefined && ROUTINE_LANES.has(lane);
}

/**
 * The project body whose policy may govern a package. Never the package's own editable `project`
 * field alone: the project must be the one the person's capture named (its project-id tag, which
 * intake files the package under), and it must belong to the same organization as the package.
 */
async function projectOf(q: Db | Tx, pkg: { id: string; body: Record<string, unknown> }): Promise<Record<string, unknown> | undefined> {
  if (typeof pkg.body.project !== "string") return undefined;
  const origin = await captureOf(q, pkg.id);
  if (!origin?.org_id) return undefined;
  const named = (captureTags(origin.text) ?? []).filter((t) => t.key === "project-id").map((t) => t.value.trim());
  if (named.length !== 1 || named[0] !== pkg.body.project) return undefined;
  const r = await q.query<{ body: Record<string, unknown> }>("select body from projects where id = $1 and org_id = $2", [pkg.body.project, origin.org_id]);
  return r.rows[0]?.body;
}

/** The capture a package came from, as the person typed it, and the organization that owns it. */
async function captureOf(q: Db | Tx, packageId: string): Promise<{ text: unknown; org_id: string | null } | undefined> {
  const r = await q.query<{ text: unknown; org_id: string | null }>(
    `select c.body->>'text' as text, o.org_id from packages p join captures c on c.id = p.capture_id
       left join object_owners o on o.object_kind = 'capture' and o.object_id = c.id
      where p.id = $1 order by p.revision desc limit 1`, [packageId]);
  return r.rows[0];
}

/**
 * The policy that governs this package, or null when none does: the project has no signed policy,
 * or the package is not routine work. Read inside the caller's transaction, so a policy changed or
 * withdrawn a moment ago is honoured.
 */
export async function governingPolicy(q: Db | Tx, pkg: { id: string; body: Record<string, unknown> }): Promise<SigningPolicy | null> {
  const project = await projectOf(q, pkg);
  const policy = policyOf(project);
  if (!policy) return null;
  return (await routinePackage(q, pkg, project)) ? policy : null;
}

/** How a decision kind is taken under a policy. Accept with findings is never automatic. */
export function modeFor(policy: SigningPolicy | null, kind: string): StepMode {
  if (!policy) return "passkey";
  if (kind === "accept-with-findings") return policy.steps.accept === "passkey" ? "passkey" : "click";
  if ((STEPS as readonly string[]).includes(kind)) return policy.steps[kind as SigningStep];
  return "passkey";
}

/** What a decision made under a policy records about it, so the record stands on its own. */
export function policyRef(p: SigningPolicy) {
  return {
    id: p.id,
    version: p.version,
    preset: p.preset,
    steps: p.steps,
    signed_by: p.signed_by,
    signed_at: p.signed_at,
    subject_digest: p.subject_digest,
    ...(p.challenge_nonce ? { challenge_nonce: p.challenge_nonce } : {}),
  };
}

/** A new policy version, signed by the passkey assertion that came with the command that set it. */
export function signPolicy(input: {
  prior: SigningPolicy | null;
  preset: Preset | "custom";
  steps: Record<SigningStep, StepMode>;
  signedBy: string;
  subject: string;
  nonce?: string;
  assertion: SigningPolicy["assertion"];
}): SigningPolicy {
  return {
    id: input.prior?.id ?? newPolicyId(),
    version: (input.prior?.version ?? 0) + 1,
    preset: input.preset,
    steps: input.steps,
    signed_by: input.signedBy,
    signed_at: new Date().toISOString(),
    subject_digest: input.subject,
    ...(input.nonce ? { challenge_nonce: input.nonce } : {}),
    assertion: input.assertion,
  };
}

/** What the workspace view shows about a project's policy: the choice, never the assertion. */
export function policySummary(projectBody: Record<string, unknown> | undefined) {
  const p = policyOf(projectBody);
  return p ? { signing: { preset: p.preset, steps: p.steps, version: p.version, signed_by: p.signed_by, signed_at: p.signed_at } } : {};
}
