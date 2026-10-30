/**
 * The command catalog (specification 10.2): every controlled write the API performs today, by name.
 * The executor refuses names not listed here, and a test checks that every listed command is used
 * and every used command is listed. Columns follow the specification: who may issue it, how it is
 * signed (Direct, Absorbed or None), and the catalog row it implements.
 */
export type Principal = "member" | "agent-via-daemon" | "system" | "member-or-system";
export type Signature = "direct" | "absorbed" | "none";

interface Entry {
  principal: Principal;
  signature: Signature;
  /** The specification 10.2 row, or "operational" for session and challenge bookkeeping. */
  spec: string;
}

const entry = (principal: Principal, signature: Signature, spec: string): Entry => ({ principal, signature, spec });

export const COMMANDS = {
  // Authentication bookkeeping. Credential registration is a 10.2 row; the rest is operational.
  "auth.challenge-issue": entry("member-or-system", "none", "operational"),
  "auth.challenge-consume": entry("member-or-system", "none", "operational"),
  "auth.register-credential": entry("member", "none", "Register authenticator credential"),
  "auth.record-assertion": entry("member", "none", "operational"),
  "auth.session-start": entry("member", "none", "operational"),
  "auth.session-end": entry("member", "none", "operational"),

  // Work.
  "capture.create": entry("member", "none", "Capture"),
  "draft.edit": entry("member", "none", "Edit draft"),
  "output.record-mismatch": entry("system", "none", "Submit output (integrity record)"),
  "run.claim": entry("agent-via-daemon", "none", "Claim"),
  "run.log": entry("agent-via-daemon", "none", "Submit output (run log)"),
  "run.complete": entry("agent-via-daemon", "none", "Submit output, submit pre-check"),
  "run.record-refused": entry("agent-via-daemon", "none", "Submit output (refused completion record)"),
  "run.sweep-lost": entry("system", "none", "Sweep lost"),
  "run.requeue": entry("member", "none", "Requeue"),
  "run.stop": entry("member", "none", "Stop run"),
  "run.override-independence": entry("member", "direct", "Override independence"),
  "runtime.report-status": entry("agent-via-daemon", "none", "Probe runtime"),
  "decision.apply": entry("member", "direct", "Release; Verdict"),

  // Preparation.
  "preparation.enroll": entry("member", "none", "Enroll, edit, resolve preparation"),
  "preparation.edit": entry("member", "none", "Enroll, edit, resolve preparation"),
  "preparation.resolve": entry("member", "none", "Enroll, edit, resolve preparation"),
  "preparation.refresh-basis": entry("member", "none", "Enroll, edit, resolve preparation"),
  "preparation.confirm": entry("member", "direct", "Confirm requirements"),

  // Grants.
  "grant.issue": entry("system", "none", "Grant issue"),
  "grant.begin-use": entry("agent-via-daemon", "none", "Grant begin use"),
  "grant.finish-use": entry("agent-via-daemon", "none", "Grant finalize use"),
  "grant.revoke": entry("member-or-system", "none", "Grant revoke"),
} as const satisfies Record<string, Entry>;

export type CommandName = keyof typeof COMMANDS;
