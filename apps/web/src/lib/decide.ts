import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { api, type Api } from "../api/client.js";
import type { Decision, DecisionKind, Digest } from "../api/types.js";

/** The browser passkey calls, injectable so tests can stand in for the authenticator. */
export interface Passkeys {
  get(options: Record<string, unknown>): Promise<Record<string, unknown>>;
  create(options: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export const browserPasskeys: Passkeys = {
  async get(options) {
    const res = await startAuthentication({ optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON });
    return res as unknown as Record<string, unknown>;
  },
  async create(options) {
    const res = await startRegistration({ optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON });
    return res as unknown as Record<string, unknown>;
  },
};

export interface DecideInput {
  packageId: string;
  revision: number;
  kind: DecisionKind;
  reason?: string;
  /** The subject digest shown to the person. Signing stops if the server's differs. */
  shownDigest: Digest;
}

/** Kinds that need a written reason before the person signs. */
export const NEEDS_REASON: ReadonlySet<DecisionKind> = new Set(["accept-with-findings", "return", "reject"]);

export const DECISION_LABEL: Record<DecisionKind, string> = {
  release: "Release",
  accept: "Accept",
  "accept-with-findings": "Accept with findings",
  return: "Return with direction",
  reject: "Reject",
};

/**
 * One decision: ask the server for the digest and challenge, sign with the person's passkey,
 * send the signed decision. The kernel on the server decides whether it is allowed.
 */
export async function decide(
  input: DecideInput,
  passkeys: Passkeys = browserPasskeys,
  client: Api = api,
): Promise<{ decision: Decision; signed: Digest }> {
  if (NEEDS_REASON.has(input.kind) && (input.reason ?? "").trim().length === 0) {
    throw new Error("A reason is required for this decision.");
  }
  const req = {
    kind: input.kind,
    package_revision: input.revision,
    ...(input.reason !== undefined && input.reason.trim().length > 0 ? { reason: input.reason.trim() } : {}),
  };
  const opts = await client.decisionOptions(input.packageId, { ...req, expected_subject_digest: input.shownDigest });
  if (opts.subject_digest.value !== input.shownDigest.value) {
    throw new Error("This package changed since you opened it. Reload and review the current version.");
  }
  const assertion = await passkeys.get(opts.options);
  const decision = await client.decide(input.packageId, { ...req, assertion });
  return { decision, signed: opts.subject_digest };
}

/** Package roles whose acceptance means something more specific than "accept". */
const ACCEPT_LABEL_BY_ROLE: Record<string, string> = { "site-parcel": "Confirm boundary" };

/** The button label for a decision on this package. */
export function decisionLabel(kind: DecisionKind, firstRole: string | undefined): string {
  if (kind === "accept" && firstRole !== undefined) {
    const special = ACCEPT_LABEL_BY_ROLE[firstRole];
    if (special !== undefined) return special;
  }
  return DECISION_LABEL[kind];
}


/**
 * Settles a lost run whose outcome is unknown: the person signs that it will not report, with the
 * reason. Requeue is allowed once it is settled.
 */
export async function signReconcile(
  input: { packageId: string; runId: string; reason: string },
  passkeys: Passkeys = browserPasskeys,
  client: Api = api,
): Promise<{ signed: Digest }> {
  const reason = input.reason.trim();
  if (reason.length === 0) throw new Error("Say why the run will not report.");
  const opts = await client.reconcileOptions(input.packageId, input.runId, reason);
  const assertion = await passkeys.get(opts.options);
  await client.reconcileRun(input.packageId, input.runId, { reason, assertion });
  return { signed: opts.subject_digest };
}

/**
 * The owner's override for a held pre-check: ask for the digest of the run and the reason, sign
 * it with the passkey, send the signed override. The kernel on the server decides.
 */
export async function signOverride(
  input: { packageId: string; runId: string; reason: string },
  passkeys: Passkeys = browserPasskeys,
  client: Api = api,
): Promise<{ signed: Digest }> {
  const reason = input.reason.trim();
  if (reason.length === 0) throw new Error("Say why the pre-check may share the author's runtime.");
  const opts = await client.overrideOptions(input.packageId, input.runId, reason);
  const assertion = await passkeys.get(opts.options);
  await client.overrideIndependence(input.packageId, input.runId, { reason, assertion });
  return { signed: opts.subject_digest };
}
