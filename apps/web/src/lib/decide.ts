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
}

/** Kinds that need a written reason before the person signs. */
export const NEEDS_REASON: ReadonlySet<DecisionKind> = new Set(["accept-with-findings", "return"]);

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
  const opts = await client.decisionOptions(input.packageId, req);
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

/** Decisions offered for a package in this state. */
export function availableDecisions(status: string, hasPreCheck: boolean, outcome?: string): DecisionKind[] {
  switch (status) {
    case "draft":
      return ["release", "reject"];
    case "released":
    case "in-work":
      return ["return", "reject"];
    case "in-verification":
      if (!hasPreCheck) return ["return", "reject"];
      return outcome === "pass"
        ? ["accept", "return", "reject"]
        : ["accept-with-findings", "return", "reject"];
    default:
      return [];
  }
}
