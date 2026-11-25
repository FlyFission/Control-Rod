import { WebAuthnAbortService, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { api, type Api } from "../api/client.js";
import type { Decision, DecisionKind, Digest } from "../api/types.js";
import { ACCEPT_COMMANDS, ACCEPT_WAITS_FOR_VERIFICATION } from "./board.js";

/** The browser passkey calls, injectable so tests can stand in for the authenticator. */
export interface Passkeys {
  get(options: Record<string, unknown>): Promise<Record<string, unknown>>;
  create(options: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/**
 * How long the browser's own passkey window may stay open before Control Rod stops waiting for it.
 * This is an application deadline, not the server's: the server asks the browser to time out after
 * 60 seconds and keeps the challenge for 5 minutes. 90 seconds allows the browser's own timeout plus
 * a margin, so in practice it ends only a window the browser never answers (seen on macOS Safari,
 * Nov 2026, when Apple's passkey picker crashed mid-choice and left the window waiting on a sheet
 * that no longer existed). A very slow ceremony also ends here, and can simply be tried again.
 */
export const PASSKEY_PATIENCE_MS = 90_000;

/** Said when the browser's passkey window never answered and Control Rod stopped waiting. */
export const PASSKEY_STUCK_MESSAGE =
  "Your browser's passkey window did not answer in time, so Control Rod stopped waiting and did not send this attempt. Nothing was recorded. " +
  "If the browser is frozen, quit and reopen it (on a Mac: Cmd+Option+Esc, then Force Quit), then try again. " +
  "If it happens again, try a different browser or choose to use a phone on the passkey window.";

export class PasskeyStuckError extends Error {
  constructor() {
    super(PASSKEY_STUCK_MESSAGE);
    this.name = "PasskeyStuckError";
  }
}

/**
 * The browser runs one passkey ceremony at a time, and the cancel below is shared, so a timer may
 * only cancel the ceremony it started: a newer one supersedes it.
 */
let latestCeremony = 0;

/**
 * Runs one passkey ceremony, and if it has not settled after `patienceMs`, asks the browser to
 * cancel it (best effort) and rejects with PasskeyStuckError so the page can say what happened.
 * A late answer from the browser after that is ignored and never sent, so the attempt is not
 * recorded; its challenge stays unused until it expires.
 */
export function withPasskeyPatience<T>(
  ceremony: () => Promise<T>,
  patienceMs: number = PASSKEY_PATIENCE_MS,
  cancel: () => void = () => WebAuthnAbortService.cancelCeremony(),
): Promise<T> {
  const mine = ++latestCeremony;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (mine === latestCeremony) {
        try {
          cancel();
        } catch {
          // The browser may refuse to cancel; the person still needs the message.
        }
      }
      reject(new PasskeyStuckError());
    }, patienceMs);
    const finish = (ok: boolean, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok) resolve(value as T);
      else reject(value);
    };
    let running: Promise<T>;
    try {
      running = ceremony();
    } catch (err) {
      finish(false, err);
      return;
    }
    running.then((v) => finish(true, v), (err: unknown) => finish(false, err));
  });
}

export const browserPasskeys: Passkeys = {
  async get(options) {
    const res = await withPasskeyPatience(() =>
      startAuthentication({ optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON }),
    );
    return res as unknown as Record<string, unknown>;
  },
  async create(options) {
    const res = await withPasskeyPatience(() =>
      startRegistration({ optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON }),
    );
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
  /**
   * Safety or Material work. An accept is sent only if a person verification read at this moment
   * shows a pass that covers the current work (ruling 16; screen-only until the kernel guard D-4).
   */
  independentCheck?: boolean;
  /**
   * The owner's signing policy lets this step go with a press (the action's signature is "none"):
   * no passkey is asked for. The server still checks the digest the person was shown.
   */
  noPasskey?: boolean;
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
  if (input.independentCheck && ACCEPT_COMMANDS.includes(input.kind)) {
    const fresh = await client.personVerifications(input.packageId);
    const covers = fresh.some((v) => v.package_revision === input.revision && v.outcome === "pass" && v.covers_current_subject === true);
    if (!covers) throw new Error(`${ACCEPT_WAITS_FOR_VERIFICATION}. No recorded pass covers the work as it is now.`);
  }
  const req = {
    kind: input.kind,
    package_revision: input.revision,
    ...(input.reason !== undefined && input.reason.trim().length > 0 ? { reason: input.reason.trim() } : {}),
  };
  if (input.noPasskey) {
    const decision = await client.decide(input.packageId, { ...req, expected_subject_digest: input.shownDigest });
    return { decision, signed: input.shownDigest };
  }
  const opts = await client.decisionOptions(input.packageId, { ...req, expected_subject_digest: input.shownDigest });
  if (opts.subject_digest.value !== input.shownDigest.value) {
    throw new Error("This package changed since you opened it. Reload and review the current version.");
  }
  const assertion = await passkeys.get(opts.options);
  const decision = await client.decide(input.packageId, { ...req, assertion });
  return { decision, signed: opts.subject_digest };
}

/** The button label for a decision. */
export function decisionLabel(kind: DecisionKind): string {
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

/**
 * Runs a signed administrative command: ask for the challenge over exactly this payload, sign it
 * with the person's passkey, send the same payload with the assertion. The server decides.
 */
export async function signAdmin<T = Record<string, unknown>>(
  name: string,
  payload: Record<string, unknown>,
  passkeys: Passkeys = browserPasskeys,
  client: Api = api,
): Promise<T> {
  const opts = await client.adminCommandOptions(name, payload);
  const assertion = await passkeys.get(opts.options);
  return client.adminCommand<T>(name, payload, assertion);
}

